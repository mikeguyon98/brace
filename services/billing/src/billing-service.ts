import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import {
  type RemittanceMessage,
  createServiceLogger,
  QUEUE_NAMES,
} from '@billing-simulator/shared';
import { StatisticsService, type DatabaseConfig } from './statistics-service';

const logger = createServiceLogger('billing-service');

export interface BillingServiceConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  database: DatabaseConfig;
  reportingIntervalSeconds?: number;
}

export class BillingService {
  private config: BillingServiceConfig;
  private redis: Redis;
  private statisticsService: StatisticsService;
  
  // Queues
  private remittanceQueue: Queue<RemittanceMessage>;
  
  // Workers
  private remittanceWorker: Worker<RemittanceMessage>;
  
  // Metrics
  private remittancesProcessed = 0;
  private errors = 0;
  private startTime = Date.now();

  constructor(config: BillingServiceConfig) {
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

    // Initialize statistics service
    this.statisticsService = new StatisticsService(config.database);

    // Initialize queue with separate connection
    this.remittanceQueue = new Queue(QUEUE_NAMES.REMITTANCE_RETURN, {
      connection: redisConfig,
    });

    // Initialize worker with separate connection
    this.remittanceWorker = new Worker(
      QUEUE_NAMES.REMITTANCE_RETURN,
      this.processRemittance.bind(this),
      {
        connection: redisConfig,
        concurrency: 5, // Process remittances with moderate concurrency
      }
    );

    this.setupWorkerEventHandlers();
  }

  async start(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('Connected to Redis');

      await this.statisticsService.initialize();
      logger.info('Statistics service initialized');

      // Start periodic reporting
      const intervalSeconds = this.config.reportingIntervalSeconds || 5;
      this.statisticsService.startPeriodicReporting(intervalSeconds);

      logger.info('Billing service started and ready to process remittances');
    } catch (error) {
      logger.error(`Failed to start billing service: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping billing service...');

    try {
      // Stop periodic reporting
      this.statisticsService.stopPeriodicReporting();

      // Close worker
      await this.remittanceWorker.close();

      // Close queue
      await this.remittanceQueue.close();

      // Close statistics service
      await this.statisticsService.close();

      // Close Redis
      await this.redis.disconnect();

      logger.info('Billing service stopped');
    } catch (error) {
      logger.error(`Error during shutdown: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async processRemittance(job: any): Promise<void> {
    const remittanceMessage: RemittanceMessage = job.data;
    
    try {
      logger.debug(`Processing remittance for correlation ${remittanceMessage.correlation_id}`);

      const remittance = remittanceMessage.remittance;
      
      // Extract patient ID and other details from the remittance
      // In a real system, this would come from the correlation tracking
      const patientId = this.extractPatientIdFromRemittance(remittance);
      const ingestedAt = this.extractIngestedTimeFromRemittance(remittance);

      // Record the processed claim in statistics
      await this.statisticsService.recordProcessedClaim(
        remittance.correlation_id,
        remittance.claim_id,
        patientId,
        remittance.payer_id,
        ingestedAt,
        remittance
      );

      this.remittancesProcessed++;

      if (this.remittancesProcessed % 50 === 0) {
        logger.info(`Processed ${this.remittancesProcessed} remittances`);
      }

    } catch (error) {
      this.errors++;
      logger.error(`Failed to process remittance ${remittanceMessage.correlation_id}: ${error instanceof Error ? error.message : error}`);
      throw error; // Re-throw to trigger retry logic
    }
  }

  private extractPatientIdFromRemittance(remittance: any): string {
    // In a real system, this would be extracted from the original claim data
    // For simulation, we'll generate a patient ID based on claim ID
    return `PAT_${remittance.claim_id.slice(-6)}`;
  }

  private extractIngestedTimeFromRemittance(remittance: any): string {
    // In a real system, this would come from correlation tracking
    // For simulation, we'll estimate based on processing time
    const processedAt = new Date(remittance.processed_at);
    const estimatedIngestionTime = new Date(processedAt.getTime() - (5000 + Math.random() * 10000));
    return estimatedIngestionTime.toISOString();
  }

  private setupWorkerEventHandlers(): void {
    this.remittanceWorker.on('completed', (job) => {
      logger.debug(`Remittance job ${job.id} completed`);
    });

    this.remittanceWorker.on('failed', (job, err) => {
      logger.error(`Remittance job ${job?.id} failed: ${err.message}`);
    });

    this.remittanceWorker.on('error', (err) => {
      logger.error(`Worker error: ${err.message}`);
    });

    this.remittanceWorker.on('stalled', (jobId) => {
      logger.warn(`Job ${jobId} stalled`);
    });
  }

  async getStats() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const overallStats = await this.statisticsService.getOverallStats();

    return {
      remittancesProcessed: this.remittancesProcessed,
      errors: this.errors,
      elapsedSeconds: elapsed,
      throughputRemittancesPerSecond: elapsed > 0 ? this.remittancesProcessed / elapsed : 0,
      queueWaiting: await this.remittanceQueue.getWaiting(),
      overallStats,
    };
  }

  async printCurrentStatistics(): Promise<void> {
    await this.statisticsService.printStatistics();
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const queueHealth = await this.remittanceQueue.getWaiting();
      const workerHealth = this.remittanceWorker.isRunning();
      
      return {
        status: workerHealth ? 'healthy' : 'unhealthy',
        details: {
          workerRunning: workerHealth,
          queueWaiting: queueHealth.length,
          remittancesProcessed: this.remittancesProcessed,
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