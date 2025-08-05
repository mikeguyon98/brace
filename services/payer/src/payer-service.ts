import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import {
  type ClaimMessage,
  type RemittanceMessage,
  type PayerConfig,
  createServiceLogger,
  QUEUE_NAMES,
  QUEUE_CONFIGS,
} from '@billing-simulator/shared';
import { PayerAdjudicator } from './adjudicator';

const logger = createServiceLogger('payer-service');

export interface PayerServiceConfig {
  payerId: string;
  payerConfig: PayerConfig;
  redis: {
    host: string;
    port: number;
    password?: string;
  };
}

export class PayerService {
  private config: PayerServiceConfig;
  private redis: Redis;
  private adjudicator: PayerAdjudicator;
  
  // Queues
  private payerQueue: Queue<ClaimMessage>;
  private remittanceQueue: Queue<RemittanceMessage>;
  
  // Worker
  private worker: Worker<ClaimMessage>;
  
  // Metrics
  private claimsProcessed = 0;
  private totalProcessingTime = 0;
  private errors = 0;
  private startTime = Date.now();

  constructor(config: PayerServiceConfig) {
    this.config = config;
    
    // Redis connection configuration for BullMQ
    const redisConfig = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null,
    };

    // Initialize Redis connection for general use
    this.redis = new Redis({
      ...redisConfig,
      lazyConnect: true,
    });

    // Initialize adjudicator
    this.adjudicator = new PayerAdjudicator(config.payerConfig);

    // Initialize queues with separate connections
    const queueName = `payer-${config.payerId.toLowerCase()}`;
    this.payerQueue = new Queue(queueName, {
      connection: redisConfig,
    });

    this.remittanceQueue = new Queue(QUEUE_NAMES.REMITTANCE_RETURN, {
      connection: redisConfig,
      defaultJobOptions: QUEUE_CONFIGS.remittance.defaultJobOptions,
    });

    // Initialize worker with separate connection
    this.worker = new Worker(
      queueName,
      this.processClaim.bind(this),
      {
        connection: redisConfig,
        concurrency: this.calculateConcurrency(),
      }
    );

    this.setupWorkerEventHandlers();
    
    logger.info(`Payer service initialized for ${config.payerConfig.name} (${config.payerId})`);
  }

  async start(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info(`Payer service ${this.config.payerId} connected to Redis`);
      
      logger.info(`Payer service ${this.config.payerId} started and ready to process claims`);
    } catch (error) {
      logger.error(`Failed to start payer service ${this.config.payerId}: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info(`Stopping payer service ${this.config.payerId}...`);

    try {
      // Close worker
      await this.worker.close();

      // Close queues
      await this.payerQueue.close();
      await this.remittanceQueue.close();

      // Close Redis
      await this.redis.disconnect();

      logger.info(`Payer service ${this.config.payerId} stopped`);
    } catch (error) {
      logger.error(`Error during shutdown of payer service ${this.config.payerId}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async processClaim(job: any): Promise<void> {
    const claimMessage: ClaimMessage = job.data;
    const startTime = Date.now();
    
    try {
      logger.debug(`Processing claim ${claimMessage.claim.claim_id} for payer ${this.config.payerId}`);

      // Simulate payer-specific processing delay
      await this.adjudicator.simulateProcessingDelay();

      // Adjudicate the claim
      const remittance = await this.adjudicator.adjudicateClaim(
        claimMessage.correlation_id,
        claimMessage.claim
      );

      // Create remittance message
      const remittanceMessage: RemittanceMessage = {
        correlation_id: claimMessage.correlation_id,
        remittance,
      };

      // Send remittance back to clearinghouse
      await this.remittanceQueue.add('process-remittance', remittanceMessage, {
        priority: this.calculateRemittancePriority(remittance),
      });

      // Update metrics
      const processingTime = Date.now() - startTime;
      this.claimsProcessed++;
      this.totalProcessingTime += processingTime;

      logger.debug(`Completed claim ${claimMessage.claim.claim_id} in ${processingTime}ms`);

      if (this.claimsProcessed % 50 === 0) {
        const avgProcessingTime = this.totalProcessingTime / this.claimsProcessed;
        logger.info(`Payer ${this.config.payerId} processed ${this.claimsProcessed} claims (avg: ${avgProcessingTime.toFixed(0)}ms)`);
      }

    } catch (error) {
      this.errors++;
      const processingTime = Date.now() - startTime;
      
      logger.error(`Failed to process claim ${claimMessage.claim.claim_id} for payer ${this.config.payerId}: ${error instanceof Error ? error.message : error}`);
      
      // In a real system, might want to create a rejection remittance
      // For simulation, we'll just re-throw to trigger retry logic
      throw error;
    }
  }

  private calculateConcurrency(): number {
    // Adjust concurrency based on payer processing characteristics
    const avgDelay = (this.config.payerConfig.processing_delay_ms.min + this.config.payerConfig.processing_delay_ms.max) / 2;
    
    // Higher concurrency for payers with longer delays to maintain throughput
    if (avgDelay > 10000) return 20;      // Very slow payers
    if (avgDelay > 5000) return 15;       // Slow payers
    if (avgDelay > 2000) return 10;       // Medium payers
    return 5;                             // Fast payers
  }

  private calculateRemittancePriority(remittance: any): number {
    // Calculate total payment amount for priority
    const totalPaid = remittance.remittance_lines.reduce(
      (sum: number, line: any) => sum + line.payer_paid_amount,
      0
    );
    
    // Higher priority for larger payments
    if (totalPaid > 5000) return 1;       // High priority
    if (totalPaid > 1000) return 5;       // Medium priority
    return 10;                            // Normal priority
  }

  private setupWorkerEventHandlers(): void {
    this.worker.on('completed', (job) => {
      logger.debug(`Job ${job.id} completed for payer ${this.config.payerId}`);
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`Job ${job?.id} failed for payer ${this.config.payerId}: ${err.message}`);
    });

    this.worker.on('error', (err) => {
      logger.error(`Worker error for payer ${this.config.payerId}: ${err.message}`);
    });

    this.worker.on('stalled', (jobId) => {
      logger.warn(`Job ${jobId} stalled for payer ${this.config.payerId}`);
    });
  }

  async getStats() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const avgProcessingTime = this.claimsProcessed > 0 ? this.totalProcessingTime / this.claimsProcessed : 0;

    return {
      payerId: this.config.payerId,
      payerName: this.config.payerConfig.name,
      claimsProcessed: this.claimsProcessed,
      errors: this.errors,
      averageProcessingTimeMs: avgProcessingTime,
      elapsedSeconds: elapsed,
      throughputClaimsPerSecond: elapsed > 0 ? this.claimsProcessed / elapsed : 0,
      queueWaiting: await this.payerQueue.getWaiting(),
      adjudicatorConfig: {
        processingDelayRange: this.config.payerConfig.processing_delay_ms,
        payerPercentage: this.config.payerConfig.adjudication_rules.payer_percentage,
        copayFixed: this.config.payerConfig.adjudication_rules.copay_fixed_amount,
        deductiblePercentage: this.config.payerConfig.adjudication_rules.deductible_percentage,
      },
    };
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const queueHealth = await this.payerQueue.getWaiting();
      const workerHealth = this.worker.isRunning();
      
      return {
        status: workerHealth ? 'healthy' : 'unhealthy',
        details: {
          payerId: this.config.payerId,
          workerRunning: workerHealth,
          queueWaiting: queueHealth.length,
          claimsProcessed: this.claimsProcessed,
          errors: this.errors,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}