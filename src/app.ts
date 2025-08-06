#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync, promises as fs } from 'fs';
import { join } from 'path';
import { logger } from './shared/logger';
import { SingleProcessConfig, ClaimMessage, RemittanceMessage } from './shared/types';
import { queueManager } from './queue/in-memory-queue';
import { IngestionService } from './services/ingestion';
import { ClearinghouseService } from './services/clearinghouse';
import { PayerService } from './services/payer';
import { BillingService } from './services/billing';
import { ARAgingService } from './services/ar-aging';

// Default configuration
const DEFAULT_CONFIG: SingleProcessConfig = {
  clearinghouse: {
    database: {
      host: 'localhost',
      port: 5434,
      database: 'clearinghouse',
      username: 'postgres',
      password: 'postgres',
    },
  },
  billing: {
    database: {
      host: 'localhost', 
      port: 5433,
      database: 'billing',
      username: 'postgres',
      password: 'postgres',
    },
    reportingIntervalSeconds: 30,
  },
  payers: [
    {
      payer_id: 'AETNA_001',
      name: 'Aetna',
      processing_delay_ms: { min: 100, max: 500 },
      adjudication_rules: {
        payer_percentage: 0.80,
        copay_fixed_amount: 25.00,
        deductible_percentage: 0.10,
      },
    },
    {
      payer_id: 'BCBS_001',
      name: 'Blue Cross Blue Shield',
      processing_delay_ms: { min: 150, max: 600 },
      adjudication_rules: {
        payer_percentage: 0.75,
        copay_fixed_amount: 30.00,
        deductible_percentage: 0.15,
      },
    },
    {
      payer_id: 'CIGNA_001',
      name: 'Cigna',
      processing_delay_ms: { min: 200, max: 700 },
      adjudication_rules: {
        payer_percentage: 0.85,
        copay_fixed_amount: 20.00,
        deductible_percentage: 0.05,
      },
    },
    {
      payer_id: 'HUMANA_001',
      name: 'Humana',
      processing_delay_ms: { min: 100, max: 400 },
      adjudication_rules: {
        payer_percentage: 0.78,
        copay_fixed_amount: 35.00,
        deductible_percentage: 0.12,
      },
    },
    {
      payer_id: 'MEDICARE_001',
      name: 'Medicare',
      processing_delay_ms: { min: 300, max: 1000 },
      adjudication_rules: {
        payer_percentage: 0.70,
        copay_fixed_amount: 15.00,
        deductible_percentage: 0.20,
      },
    },
  ],
  ingestion: {
    rateLimit: 20.0, // claims per second - increased default
  },
};

class BillingSimulator {
  private config: SingleProcessConfig;
  private ingestionService!: IngestionService;
  private clearinghouseService!: ClearinghouseService;
  private payerServices: Map<string, PayerService> = new Map();
  private billingService!: BillingService;
  private arAgingService!: ARAgingService;
  private isRunning = false;
  
  // Claim tracking for completion detection
  private totalClaimsToProcess = 0;
  private claimsProcessedByBilling = 0;
  private completionCheckInterval?: NodeJS.Timeout;
  
  // Fine-grained pipeline tracking - tracks claims CURRENTLY in each step
  private pipelineStats = {
    step1_being_ingested: 0,              // Claims currently being read from file
    step2_in_clearinghouse_queue: 0,      // Claims waiting in clearinghouse queue
    step3_with_payers: 0,                 // Claims currently being processed by payers
    step4_remittances_in_billing_queue: 0, // Remittances waiting in billing queue
    step5_fully_complete: 0               // Claims fully processed through billing
  };

  constructor(config: SingleProcessConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.setupServices();
  }

  private setupServices(): void {
    logger.info('Initializing billing simulator services...');

    // Create queues with optimized concurrency
    const claimsQueue = queueManager.getQueue<ClaimMessage>('claims-ingestion', {
      concurrency: 25, // Increased from 10
      maxAttempts: 1,
    });

    const remittanceQueue = queueManager.getQueue<RemittanceMessage>('remittance-return', {
      concurrency: 20, // Increased from 5 for faster billing processing
      maxAttempts: 5,
      retryDelay: 500,
    });

    // Create payer queues
    const payerQueues = new Map();
    const payerConfigs = new Map();

    for (const payerConfig of this.config.payers) {
      // Spawn tons of workers as suggested - much higher concurrency
      const payerQueue = queueManager.getQueue<ClaimMessage>(`payer-${payerConfig.payer_id.toLowerCase()}`, {
        concurrency: 25, // Dramatically increased from 3 to 25 workers per payer!
        maxAttempts: 3,
        retryDelay: 1000,
      });
      
      payerQueues.set(payerConfig.payer_id, payerQueue);
      payerConfigs.set(payerConfig.payer_id, payerConfig);
    }

    // Initialize services with pipeline tracking callbacks
    this.ingestionService = new IngestionService(
      claimsQueue, 
      this.config.ingestion,
      () => this.claimStartsIngestion(),
      () => this.claimFinishesIngestion()
    );

    // Initialize AR Aging service first
    this.arAgingService = new ARAgingService(5);

    this.clearinghouseService = new ClearinghouseService(
      claimsQueue,
      remittanceQueue,
      payerQueues,
      payerConfigs,
      this.arAgingService,
      () => this.claimForwardedToPayer()
    );

    // Initialize payer services
    for (const payerConfig of this.config.payers) {
      const payerQueue = payerQueues.get(payerConfig.payer_id);
      const payerService = new PayerService(
        payerConfig, 
        payerQueue, 
        remittanceQueue,
        () => this.claimAdjudicatedByPayer()
      );
      this.payerServices.set(payerConfig.payer_id, payerService);
    }

    this.billingService = new BillingService(
      remittanceQueue, 
      this.config.billing, 
      this.arAgingService,
      () => this.incrementProcessedClaims()
    );

    logger.info(`Initialized ${this.config.payers.length} payer services`);
    logger.info('All services initialized successfully including AR Aging');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Simulator is already running');
    }

    this.isRunning = true;
    logger.info('Billing simulator started');
    logger.info('All services are now processing in a single process');
    
    // Log service status
    this.logServiceStatus();

    // Set up periodic status logging
    setInterval(() => {
      this.logServiceStatus();
    }, 30000); // Every 30 seconds
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping billing simulator...');
    this.isRunning = false;

    // Clear completion tracking
    if (this.completionCheckInterval) {
      clearInterval(this.completionCheckInterval);
    }

    this.billingService.stop();
    this.arAgingService.stop();
    queueManager.clear();

    logger.info('Billing simulator stopped');
  }

  /**
   * Set the total number of claims to process
   */
  setTotalClaimsToProcess(count: number): void {
    this.totalClaimsToProcess = count;
    this.claimsProcessedByBilling = 0;
    logger.info(`📊 Tracking ${count} claims for completion`);
  }

  /**
   * Increment the count of claims processed by billing
   */
  incrementProcessedClaims(): void {
    this.claimsProcessedByBilling++;
    // Move from billing queue to fully complete
    this.pipelineStats.step4_remittances_in_billing_queue--;
    this.pipelineStats.step5_fully_complete++;
    logger.info(`✅ Claim processed by billing: ${this.claimsProcessedByBilling}/${this.totalClaimsToProcess}`);
  }

  // Pipeline step tracking methods - claims enter and leave each step
  claimStartsIngestion(): void {
    this.pipelineStats.step1_being_ingested++;
  }

  claimFinishesIngestion(): void {
    this.pipelineStats.step1_being_ingested--;
    this.pipelineStats.step2_in_clearinghouse_queue++;
  }

  claimForwardedToPayer(): void {
    this.pipelineStats.step2_in_clearinghouse_queue--;
    this.pipelineStats.step3_with_payers++;
  }

  claimAdjudicatedByPayer(): void {
    this.pipelineStats.step3_with_payers--;
    this.pipelineStats.step4_remittances_in_billing_queue++;
  }

  getPipelineStats() {
    return { ...this.pipelineStats };
  }

  /**
   * Check if all claims have been processed
   */
  areAllClaimsProcessed(): boolean {
    return this.totalClaimsToProcess > 0 && this.claimsProcessedByBilling >= this.totalClaimsToProcess;
  }

  /**
   * Wait for all claims to be processed with live claim state tracking
   */
  async waitForAllClaimsToComplete(): Promise<void> {
    if (this.totalClaimsToProcess === 0) {
      logger.info('No claims to track - exiting immediately');
      return;
    }

    logger.info(`⏳ Waiting for all ${this.totalClaimsToProcess} claims to be processed...`);
    logger.info('📊 Live claim state tracking every 5 seconds');

    return new Promise((resolve) => {
      this.completionCheckInterval = setInterval(() => {
        this.printClaimStateTracking();
        
        if (this.areAllClaimsProcessed()) {
          logger.info(`🎉 ALL CLAIMS COMPLETED! Processed ${this.claimsProcessedByBilling}/${this.totalClaimsToProcess} claims (100%)`);
          clearInterval(this.completionCheckInterval!);
          resolve();
        }
      }, 5000); // Check every 5 seconds
    });
  }

  /**
   * Print detailed pipeline tracking and AR aging report
   */
  private printClaimStateTracking(): void {
    const claimStats = this.arAgingService.getClaimStateStats();
    const billingStats = this.billingService.getStats();
    const queueStats = queueManager.getOverallStats();
    const pipelineStats = this.getPipelineStats();
    
    const progress = (this.claimsProcessedByBilling / this.totalClaimsToProcess * 100).toFixed(1);
    
    console.log('\n' + '═'.repeat(120));
    console.log(`🏥 HEALTHCARE BILLING PIPELINE TRACKING - ${new Date().toLocaleTimeString()}`);
    console.log('═'.repeat(120));
    
    // Overall progress
    console.log(`🎯 OVERALL PROGRESS: ${this.claimsProcessedByBilling}/${this.totalClaimsToProcess} completed (${progress}%)`);
    console.log(`💰 FINANCIAL: $${billingStats.totalBilledAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} billed | $${billingStats.totalPaidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} paid | ${((billingStats.totalPaidAmount / Math.max(billingStats.totalBilledAmount, 1)) * 100).toFixed(1)}% rate`);
    
    console.log('\n📋 DETAILED PIPELINE STATUS:');
    console.log('─'.repeat(120));
    console.log('| Step | Description                                    | Count | Status |');
    console.log('─'.repeat(120));
    console.log(`| 1️⃣   | Claims Being Ingested from File               | ${String(pipelineStats.step1_being_ingested).padStart(5)} | ${pipelineStats.step1_being_ingested === 0 ? '✅ Complete' : '🔄 Processing'} |`);
    console.log(`| 2️⃣   | Claims in Clearinghouse Queue                 | ${String(pipelineStats.step2_in_clearinghouse_queue).padStart(5)} | ${pipelineStats.step2_in_clearinghouse_queue === 0 ? '✅ Complete' : '🔄 Processing'} |`);
    console.log(`| 3️⃣   | Claims with Payers (Being Adjudicated)        | ${String(pipelineStats.step3_with_payers).padStart(5)} | ${pipelineStats.step3_with_payers === 0 ? '✅ Complete' : '🔄 Processing'} |`);
    console.log(`| 4️⃣   | Remittances in Billing Queue                  | ${String(pipelineStats.step4_remittances_in_billing_queue).padStart(5)} | ${pipelineStats.step4_remittances_in_billing_queue === 0 ? '✅ Complete' : '🔄 Processing'} |`);
    console.log(`| 5️⃣   | Claims Fully Complete                          | ${String(pipelineStats.step5_fully_complete).padStart(5)} | ${pipelineStats.step5_fully_complete === this.totalClaimsToProcess ? '✅ All Done' : '🔄 In Progress'} |`);
    console.log('─'.repeat(120));
    
    console.log(`\n⚡ QUEUE STATUS: ${queueStats.totalPending} pending | ${queueStats.totalProcessing} processing | Outstanding: ${claimStats.outstanding}`);
    
    // Show AR Aging Report
    console.log('\n' + '─'.repeat(120));
    this.arAgingService.printFormattedReport();
    
    console.log('─'.repeat(120));
    console.log(`📈 Next update in 5 seconds...`);
    console.log('═'.repeat(120) + '\n');
  }

  async ingestFile(filePath: string): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Simulator must be started before ingesting files');
    }

    logger.info(`Starting file ingestion: ${filePath}`);
    
    // Count claims before ingestion
    const claimCount = await this.countClaimsInFile(filePath);
    this.setTotalClaimsToProcess(claimCount);
    
    await this.ingestionService.ingestFile(filePath);
    logger.info('File ingestion completed');

    // Wait for ALL claims to be processed with live state tracking
    await this.waitForAllClaimsToComplete();
    logger.info('🎉 All claims have been fully processed!');
    
    // Generate final comprehensive AR Aging report
    await this.generateFinalARAgingReport();
  }

  /**
   * Generate final comprehensive AR Aging report
   */
  private async generateFinalARAgingReport(): Promise<void> {
    logger.info('\n' + '='.repeat(120));
    logger.info('🏁 FINAL COMPREHENSIVE AR AGING REPORT');
    logger.info('='.repeat(120));
    
    // Give the AR Aging service a moment to process the last remittances
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Generate the final report
    this.arAgingService.printFormattedReport();
    
    // Get billing statistics for final summary
    const billingStats = this.billingService.getStats();
    const uptime = process.uptime();
    const totalThroughput = billingStats.totalClaims / uptime;
    
    console.log('\n' + '='.repeat(120));
    console.log('📊 FINAL PERFORMANCE SUMMARY');
    console.log('='.repeat(120));
    console.log(`🎯 TOTAL CLAIMS PROCESSED: ${billingStats.totalClaims.toLocaleString()}`);
    console.log(`💰 TOTAL AMOUNT BILLED: $${billingStats.totalBilledAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`💳 TOTAL AMOUNT PAID: $${billingStats.totalPaidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`👥 TOTAL PATIENT RESPONSIBILITY: $${billingStats.totalPatientResponsibility.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`📈 OVERALL PAYMENT RATE: ${((billingStats.totalPaidAmount / billingStats.totalBilledAmount) * 100).toFixed(1)}%`);
    console.log(`⚡ AVERAGE THROUGHPUT: ${totalThroughput.toFixed(2)} claims/second`);
    console.log(`⏱️  TOTAL PROCESSING TIME: ${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`);
    
    // Show payer performance breakdown
    console.log('\n📋 PAYER PERFORMANCE BREAKDOWN:');
    console.log('─'.repeat(120));
    for (const [payerId, payerService] of this.payerServices) {
      const stats = payerService.getStats();
      const payerThroughput = stats.claimsProcessed / uptime;
      const payerPayment = billingStats.payerBreakdown.get(payerId);
      const paymentRate = payerPayment ? (payerPayment.paidAmount / payerPayment.billedAmount * 100) : 0;
      
      console.log(`  ${stats.payerName.padEnd(25)} | ${String(stats.claimsProcessed).padStart(6)} claims | ${payerThroughput.toFixed(2).padStart(8)} c/s | ${paymentRate.toFixed(1).padStart(6)}% paid`);
    }
    
    // Get critical claims analysis
    const criticalClaims = this.arAgingService.getCriticalClaims();
    if (criticalClaims.length > 0) {
      console.log('\n🚨 CLAIMS REQUIRING ATTENTION (3+ minutes):');
      console.log('─'.repeat(120));
      criticalClaims.slice(0, 10).forEach(claim => {
        const ageMinutes = ((new Date()).getTime() - claim.submittedAt.getTime()) / (1000 * 60);
        console.log(`  ${claim.claimId.padEnd(15)} | ${claim.payerId.padEnd(12)} | ${ageMinutes.toFixed(1).padStart(6)} min | $${claim.billedAmount.toFixed(2).padStart(10)}`);
      });
      if (criticalClaims.length > 10) {
        console.log(`  ... and ${criticalClaims.length - 10} more critical claims`);
      }
    }
    
    console.log('\n' + '='.repeat(120));
    console.log('✅ AR AGING ANALYSIS COMPLETE - ALL CLAIMS PROCESSED SUCCESSFULLY');
    console.log('='.repeat(120) + '\n');
  }

  /**
   * Count the number of claims in a JSONL file
   */
  private async countClaimsInFile(filePath: string): Promise<number> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      const count = lines.length;
      logger.info(`📋 Found ${count} claims in ${filePath}`);
      return count;
    } catch (error) {
      logger.error(`Error counting claims in ${filePath}:`, error instanceof Error ? error.message : error);
      return 0;
    }
  }

  private logServiceStatus(): void {
    const queueStats = queueManager.getOverallStats();
    const ingestionStats = this.ingestionService.getStats();
    const clearinghouseStats = this.clearinghouseService.getStats();
    const billingStats = this.billingService.getStats();

    // Calculate overall throughput
    const uptime = process.uptime();
    const throughput = billingStats.totalClaims / uptime;

    logger.info('=== HIGH-PERFORMANCE STATUS ===');
    logger.info(`🚀 Throughput: ${throughput.toFixed(2)} claims/sec | Queues: ${queueStats.totalQueues} | Pending: ${queueStats.totalPending} | Processing: ${queueStats.totalProcessing}`);
    logger.info(`📊 Clearinghouse: ${clearinghouseStats.claimsProcessed} routed | Billing: ${billingStats.totalClaims} processed | $${billingStats.totalBilledAmount.toFixed(2)} billed`);
    
    // Show payer processing rates
    let payerSummary = '';
    for (const [payerId, payerService] of this.payerServices) {
      const stats = payerService.getStats();
      const rate = stats.claimsProcessed / uptime;
      payerSummary += `${stats.payerName.split(' ')[0]}: ${stats.claimsProcessed} (${rate.toFixed(1)}/s) | `;
    }
    logger.info(`💰 Payers: ${payerSummary.slice(0, -3)}`);
  }

  printReport(): void {
    this.billingService.printReport();
  }

  getOverallStats() {
    return {
      isRunning: this.isRunning,
      queues: queueManager.getOverallStats(),
      ingestion: this.ingestionService.getStats(),
      clearinghouse: this.clearinghouseService.getStats(),
      billing: this.billingService.getStats(),
      payers: Array.from(this.payerServices.values()).map(service => service.getStats()),
    };
  }
}

// CLI Interface
async function main() {
  const program = new Command();

  program
    .name('billing-simulator')
    .description('Single-process medical billing claims processing simulator')
    .version('2.0.0');

  program
    .command('start')
    .description('Start the billing simulator')
    .option('-c, --config <path>', 'Path to configuration file')
    .action(async (options) => {
      let config = DEFAULT_CONFIG;
      
      if (options.config) {
        try {
          const configData = readFileSync(options.config, 'utf-8');
          config = JSON.parse(configData);
          logger.info(`Loaded configuration from ${options.config}`);
        } catch (error) {
          logger.error(`Failed to load configuration: ${error instanceof Error ? error.message : error}`);
          process.exit(1);
        }
      }

      const simulator = new BillingSimulator(config);
      await simulator.start();

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully...');
        await simulator.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully...');
        await simulator.stop();
        process.exit(0);
      });

      // Keep the process running
      logger.info('Press Ctrl+C to stop the simulator');
      await new Promise(() => {}); // Keep running indefinitely
    });

  program
    .command('ingest <file>')
    .description('Ingest a claims file')
    .option('-r, --rate <rate>', 'Ingestion rate (claims per second)', parseFloat, 2.0)
    .option('-c, --config <path>', 'Path to configuration file')
    .action(async (file, options) => {
      let config = DEFAULT_CONFIG;
      
      if (options.config) {
        try {
          const configData = readFileSync(options.config, 'utf-8');
          config = JSON.parse(configData);
        } catch (error) {
          logger.error(`Failed to load configuration: ${error instanceof Error ? error.message : error}`);
          process.exit(1);
        }
      }

      // Override ingestion rate if provided
      if (options.rate) {
        config.ingestion = { rateLimit: options.rate };
      }

      const simulator = new BillingSimulator(config);
      await simulator.start();

      try {
        await simulator.ingestFile(file);
        
        // Wait a bit for processing to complete
        logger.info('Waiting for processing to complete...');
        setTimeout(() => {
          simulator.printReport();
          simulator.stop().then(() => process.exit(0));
        }, 5000);
        
      } catch (error) {
        logger.error(`Ingestion failed: ${error instanceof Error ? error.message : error}`);
        await simulator.stop();
        process.exit(1);
      }
    });

  program
    .command('report')
    .description('Generate a sample report (requires running simulator)')
    .action(() => {
      // This would connect to a running simulator to get stats
      console.log('Note: This command would connect to a running simulator instance to generate reports.');
      console.log('For now, use the "ingest" command which includes a report at the end.');
    });

  await program.parseAsync(process.argv);
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('Application failed:', error);
    process.exit(1);
  });
}

export { BillingSimulator, DEFAULT_CONFIG };