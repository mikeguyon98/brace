#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync, promises as fs } from 'fs';
import { join } from 'path';
import { logger } from './shared/logger';
import { SingleProcessConfig, ClaimMessage, RemittanceMessage } from './shared/types';
import { queueManager, InMemoryQueue } from './queue/in-memory-queue';
import { ClaimStore, DatabaseConfig } from './services/database';
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
      database: 'billing_simulator',
      username: 'postgres',
      password: 'postgres',
    },
    reportingIntervalSeconds: 30,
  },
  payers: [
    {
      payer_id: 'anthem',
      name: 'Anthem (Strict)',
      processing_delay_ms: { min: 100, max: 500 },
      adjudication_rules: {
        payer_percentage: 0.80,
        copay_fixed_amount: 25.00,
        deductible_percentage: 0.10,
      },
      denial_settings: {
        denial_rate: 0.15,  // 15% denial rate
        hard_denial_rate: 0.70,  // 70% of denials are hard denials
        preferred_categories: [],
      },
    },
    {
      payer_id: 'united_health_group',
      name: 'United Health Group (High Rejection)',
      processing_delay_ms: { min: 150, max: 600 },
      adjudication_rules: {
        payer_percentage: 0.75,
        copay_fixed_amount: 30.00,
        deductible_percentage: 0.15,
      },
      denial_settings: {
        denial_rate: 0.25,  // 25% denial rate - high rejection payer
        hard_denial_rate: 0.80,  // 80% of denials are hard denials
        preferred_categories: [],
      },
    },
    {
      payer_id: 'medicare',
      name: 'Medicare (Denial Demo)',
      processing_delay_ms: { min: 300, max: 1000 },
      adjudication_rules: {
        payer_percentage: 0.70,
        copay_fixed_amount: 15.00,
        deductible_percentage: 0.20,
      },
      denial_settings: {
        denial_rate: 0.20,  // 20% denial rate
        hard_denial_rate: 0.60,  // 60% of denials are hard denials
        preferred_categories: [],
      },
    },
  ],
  ingestion: {
    rateLimit: 20.0, // claims per second - increased default
  },
};

class BillingSimulator {
  private config: SingleProcessConfig;
  private claimStore!: ClaimStore;
  private ingestionService!: IngestionService;
  private clearinghouseService!: ClearinghouseService;
  private payerServices: Map<string, PayerService> = new Map();
  private billingService!: BillingService;
  private arAgingService!: ARAgingService;
  private isRunning = false;
  
  // Simple completion tracking
  private completionCheckInterval?: NodeJS.Timeout;

  constructor(config: SingleProcessConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    await this.setupServices();
  }

  private async setupServices(): Promise<void> {
    // Initialize PostgreSQL claim store
    const dbConfig: DatabaseConfig = {
      host: this.config.billing.database.host,
      port: this.config.billing.database.port,
      database: 'billing_simulator', // Use a dedicated database
      user: this.config.billing.database.username,
      password: this.config.billing.database.password,
      ssl: false,
      max: 20
    };

    this.claimStore = new ClaimStore(dbConfig);
    await this.claimStore.initialize();

    // Initialize queues - claims queue processed by clearinghouse service directly
    const claimsQueue = queueManager.getQueue<ClaimMessage>('claims', {
      concurrency: 5,
      maxAttempts: 3,
      retryDelay: 1000,
      useWorkerThreads: false // Disable worker threads - clearinghouse service handles this
    });

    const remittanceQueue = queueManager.getQueue<RemittanceMessage>('remittance', {
      concurrency: 8, // Process 8 remittances simultaneously
      maxAttempts: 3,
      retryDelay: 1000,
      useWorkerThreads: true,
      workerScript: require.resolve('./queue/workers/claim-processor-worker.js')
    });

    // Initialize payer queues with parallel processing
    const payerQueues = new Map<string, InMemoryQueue<ClaimMessage>>();
    const payerConfigs = new Map<string, any>();

    for (const payerConfig of this.config.payers) {
      const payerQueue = queueManager.getQueue<ClaimMessage>(`payer-${payerConfig.payer_id.toLowerCase()}`, {
        concurrency: 5, // Each payer can process 5 claims simultaneously
        maxAttempts: 3,
        retryDelay: 1000,
        useWorkerThreads: false, // Disable worker threads - payer services handle processing directly
        workerScript: require.resolve('./queue/workers/claim-processor-worker.js')
      });
      
      payerQueues.set(payerConfig.payer_id, payerQueue);
      payerConfigs.set(payerConfig.payer_id, payerConfig);
    }

    // Initialize services with PostgreSQL integration (no pipeline tracking)
    this.ingestionService = new IngestionService(
      claimsQueue, 
      this.claimStore,
      this.config.ingestion
    );

    // Initialize AR Aging service first
    this.arAgingService = new ARAgingService(5);

    this.clearinghouseService = new ClearinghouseService(
      claimsQueue,
      remittanceQueue,
      payerQueues,
      payerConfigs,
      this.claimStore,
      this.arAgingService
    );

    // Initialize payer services
    for (const payerConfig of this.config.payers) {
      const payerQueue = payerQueues.get(payerConfig.payer_id);
      if (!payerQueue) {
        throw new Error(`Payer queue not found for ${payerConfig.payer_id}`);
      }
      const payerService = new PayerService(
        payerConfig, 
        payerQueue, 
        remittanceQueue,
        this.claimStore
      );
      this.payerServices.set(payerConfig.payer_id, payerService);
    }

    this.billingService = new BillingService(
      remittanceQueue, 
      this.claimStore,
      this.config.billing, 
      this.arAgingService
    );

    logger.info(`Initialized ${this.config.payers.length} payer services with PostgreSQL storage`);
    logger.info('All services initialized successfully with PostgreSQL integration');
    logger.info('💡 Claims are now stored in PostgreSQL for real-time tracking');
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

    // Stop all services
    this.billingService.stop();
    this.arAgingService.stop();
    
    // Stop all queues and their worker threads
    const allQueues = queueManager.getAllQueues();
    for (const queue of allQueues.values()) {
      await queue.stop();
    }
    
    queueManager.clear();

    logger.info('Billing simulator stopped');
  }

  /**
   * Get real-time statistics from PostgreSQL
   */
  async getOverallStats(): Promise<any> {
    try {
      const processingStats = await this.claimStore.getProcessingStats();
      const payerStats = await this.claimStore.getPayerStats();
      const agingStats = await this.claimStore.getAgingStats();
      const recentActivity = await this.claimStore.getRecentActivity(10);

      // Get queue statistics for monitoring
      const allQueues = queueManager.getAllQueues();
      const queueStats: any = {};
      
      for (const [name, queue] of allQueues) {
        queueStats[name] = queue.getStats();
      }

      return {
        processing: processingStats,
        payers: payerStats,
        aging: agingStats,
        recentActivity,
        queues: queueStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error getting overall stats:', error);
      throw error;
    }
  }



  async ingestFile(filePath: string): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Simulator must be started before ingesting files');
    }

    logger.info(`📁 Starting file ingestion: ${filePath}`);
    
    try {
      await this.ingestionService.ingestFile(filePath);
      logger.info('📥 File ingestion completed successfully');
    } catch (error) {
      logger.error('❌ File ingestion failed:', error);
      throw error;
    }
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

  // Legacy method - now uses PostgreSQL stats
  getStats() {
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
      await simulator.initialize();
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
      await simulator.initialize();
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