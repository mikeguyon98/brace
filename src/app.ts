#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from './shared/logger';
import { SingleProcessConfig, ClaimMessage, RemittanceMessage } from './shared/types';
import { queueManager } from './queue/in-memory-queue';
import { IngestionService } from './services/ingestion';
import { ClearinghouseService } from './services/clearinghouse';
import { PayerService } from './services/payer';
import { BillingService } from './services/billing';

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
    rateLimit: 2.0, // claims per second
  },
};

class BillingSimulator {
  private config: SingleProcessConfig;
  private ingestionService!: IngestionService;
  private clearinghouseService!: ClearinghouseService;
  private payerServices: Map<string, PayerService> = new Map();
  private billingService!: BillingService;
  private isRunning = false;

  constructor(config: SingleProcessConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.setupServices();
  }

  private setupServices(): void {
    logger.info('Initializing billing simulator services...');

    // Create queues
    const claimsQueue = queueManager.getQueue<ClaimMessage>('claims-ingestion', {
      concurrency: 10,
      maxAttempts: 1,
    });

    const remittanceQueue = queueManager.getQueue<RemittanceMessage>('remittance-return', {
      concurrency: 5,
      maxAttempts: 5,
      retryDelay: 500,
    });

    // Create payer queues
    const payerQueues = new Map();
    const payerConfigs = new Map();

    for (const payerConfig of this.config.payers) {
      const payerQueue = queueManager.getQueue<ClaimMessage>(`payer-${payerConfig.payer_id.toLowerCase()}`, {
        concurrency: 3,
        maxAttempts: 3,
        retryDelay: 1000,
      });
      
      payerQueues.set(payerConfig.payer_id, payerQueue);
      payerConfigs.set(payerConfig.payer_id, payerConfig);
    }

    // Initialize services
    this.ingestionService = new IngestionService(claimsQueue, this.config.ingestion);

    this.clearinghouseService = new ClearinghouseService(
      claimsQueue,
      remittanceQueue,
      payerQueues,
      payerConfigs
    );

    // Initialize payer services
    for (const payerConfig of this.config.payers) {
      const payerQueue = payerQueues.get(payerConfig.payer_id);
      const payerService = new PayerService(payerConfig, payerQueue, remittanceQueue);
      this.payerServices.set(payerConfig.payer_id, payerService);
    }

    this.billingService = new BillingService(remittanceQueue, this.config.billing);

    logger.info(`Initialized ${this.config.payers.length} payer services`);
    logger.info('All services initialized successfully');
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

    this.billingService.stop();
    queueManager.clear();

    logger.info('Billing simulator stopped');
  }

  async ingestFile(filePath: string): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Simulator must be started before ingesting files');
    }

    logger.info(`Starting file ingestion: ${filePath}`);
    await this.ingestionService.ingestFile(filePath);
    logger.info('File ingestion completed');
  }

  private logServiceStatus(): void {
    const queueStats = queueManager.getOverallStats();
    const ingestionStats = this.ingestionService.getStats();
    const clearinghouseStats = this.clearinghouseService.getStats();
    const billingStats = this.billingService.getStats();

    logger.info('=== SERVICE STATUS ===');
    logger.info(`Queues: ${queueStats.totalQueues}, Pending: ${queueStats.totalPending}, Processing: ${queueStats.totalProcessing}`);
    logger.info(`Clearinghouse: ${clearinghouseStats.claimsProcessed} claims routed`);
    logger.info(`Billing: ${billingStats.totalClaims} processed, $${billingStats.totalBilledAmount.toFixed(2)} billed`);
    
    for (const [payerId, payerService] of this.payerServices) {
      const stats = payerService.getStats();
      logger.info(`${stats.payerName}: ${stats.claimsProcessed} claims processed`);
    }
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