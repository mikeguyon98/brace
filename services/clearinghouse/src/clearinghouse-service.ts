import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import {
  type ClaimMessage,
  type RemittanceMessage,
  createServiceLogger,
  QUEUE_NAMES,
  QUEUE_CONFIGS,
} from '@billing-simulator/shared';
import { ClearinghouseDatabase, type DatabaseConfig } from './database';
import { PayerRegistry } from './payer-registry';

const logger = createServiceLogger('clearinghouse-service');

export interface ClearinghouseConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  database: DatabaseConfig;
  timeoutMinutes?: number;
}

export class ClearinghouseService {
  private config: ClearinghouseConfig;
  private redis: Redis;
  private database: ClearinghouseDatabase;
  private payerRegistry: PayerRegistry;
  
  // Queues
  private claimsQueue: Queue<ClaimMessage>;
  private remittanceQueue: Queue<RemittanceMessage>;
  private payerQueues = new Map<string, Queue>();
  
  // Workers
  private claimsWorker: Worker<ClaimMessage>;
  private remittanceWorker: Worker<RemittanceMessage>;
  
  // Metrics
  private claimsProcessed = 0;
  private remittancesProcessed = 0;
  private errors = 0;
  private startTime = Date.now();

  constructor(config: ClearinghouseConfig) {
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

    // Initialize database
    this.database = new ClearinghouseDatabase(config.database);
    
    // Initialize payer registry
    this.payerRegistry = new PayerRegistry();

    // Initialize queues with separate connections
    this.claimsQueue = new Queue(QUEUE_NAMES.CLAIMS_INGESTION, {
      connection: redisConfig,
    });

    this.remittanceQueue = new Queue(QUEUE_NAMES.REMITTANCE_RETURN, {
      connection: redisConfig,
      defaultJobOptions: QUEUE_CONFIGS.remittance.defaultJobOptions,
    });

    // Initialize workers with separate connections
    this.claimsWorker = new Worker(
      QUEUE_NAMES.CLAIMS_INGESTION,
      this.processClaim.bind(this),
      {
        connection: redisConfig,
        concurrency: 10, // Process up to 10 claims concurrently
      }
    );

    this.remittanceWorker = new Worker(
      QUEUE_NAMES.REMITTANCE_RETURN,
      this.processRemittance.bind(this),
      {
        connection: redisConfig,
        concurrency: 5, // Process remittances sequentially for data consistency
      }
    );

    this.setupWorkerEventHandlers();
  }

  async start(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('Connected to Redis');

      await this.database.initialize();
      logger.info('Database initialized');

      // Initialize payer queues
      await this.initializePayerQueues();

      logger.info('Clearinghouse service started');
    } catch (error) {
      logger.error(`Failed to start clearinghouse service: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping clearinghouse service...');

    try {
      // Close workers
      await this.claimsWorker.close();
      await this.remittanceWorker.close();

      // Close queues
      await this.claimsQueue.close();
      await this.remittanceQueue.close();
      
      for (const queue of this.payerQueues.values()) {
        await queue.close();
      }

      // Close database
      await this.database.close();

      // Close Redis
      await this.redis.disconnect();

      logger.info('Clearinghouse service stopped');
    } catch (error) {
      logger.error(`Error during shutdown: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async initializePayerQueues(): Promise<void> {
    const payers = this.payerRegistry.getAllPayers();
    
    for (const payer of payers) {
      const queue = new Queue(payer.queue_name, {
        connection: this.redis,
        defaultJobOptions: QUEUE_CONFIGS.payer.defaultJobOptions,
      });
      
      this.payerQueues.set(payer.payer_id, queue);
      logger.info(`Initialized queue for payer: ${payer.name} (${payer.queue_name})`);
    }
  }

  private async processClaim(job: any): Promise<void> {
    const claimMessage: ClaimMessage = job.data;
    
    try {
      logger.debug(`Processing claim ${claimMessage.claim.claim_id} from correlation ${claimMessage.correlation_id}`);

      // Look up payer configuration
      const payer = this.payerRegistry.getPayerOrFallback(claimMessage.claim.payer_id);
      if (!payer) {
        throw new Error(`No payer configuration found for ${claimMessage.claim.payer_id} and no fallback available`);
      }

      // Store claim in database for correlation tracking
      await this.database.storeClaim({
        correlation_id: claimMessage.correlation_id,
        claim_id: claimMessage.claim.claim_id,
        payer_id: payer.payer_id,
        ingested_at: claimMessage.ingested_at,
        submitted_at: new Date().toISOString(),
        claim_data: claimMessage.claim,
      });

      // Forward to appropriate payer queue
      const payerQueue = this.payerQueues.get(payer.payer_id);
      if (!payerQueue) {
        throw new Error(`Payer queue not found for ${payer.payer_id}`);
      }

      await payerQueue.add('adjudicate-claim', claimMessage, {
        priority: this.calculatePriority(claimMessage.claim),
      });

      this.claimsProcessed++;
      
      if (this.claimsProcessed % 100 === 0) {
        logger.info(`Processed ${this.claimsProcessed} claims`);
      }

    } catch (error) {
      this.errors++;
      logger.error(`Failed to process claim ${claimMessage.claim.claim_id}: ${error instanceof Error ? error.message : error}`);
      throw error; // Re-throw to trigger retry logic
    }
  }

  private async processRemittance(job: any): Promise<void> {
    const remittanceMessage: RemittanceMessage = job.data;
    
    try {
      logger.debug(`Processing remittance for correlation ${remittanceMessage.correlation_id}`);

      // Look up original claim
      const inFlightClaim = await this.database.getClaim(remittanceMessage.correlation_id);
      if (!inFlightClaim) {
        logger.warn(`Received remittance for unknown correlation ID: ${remittanceMessage.correlation_id}`);
        return;
      }

      // Remove from in-flight tracking
      await this.database.removeClaim(remittanceMessage.correlation_id);

      // Forward to billing service (this would be another queue in a real system)
      // For now, just log the successful processing
      logger.info(`Remittance processed for claim ${inFlightClaim.claim_id}, correlation ${remittanceMessage.correlation_id}`);

      this.remittancesProcessed++;

    } catch (error) {
      this.errors++;
      logger.error(`Failed to process remittance ${remittanceMessage.correlation_id}: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  private calculatePriority(claim: any): number {
    // Higher priority for claims with higher dollar amounts
    const totalAmount = claim.service_lines?.reduce((sum: number, line: any) => sum + line.billed_amount, 0) || 0;
    
    if (totalAmount > 10000) return 1;      // High priority
    if (totalAmount > 1000) return 5;       // Medium priority
    return 10;                              // Normal priority
  }

  private setupWorkerEventHandlers(): void {
    this.claimsWorker.on('completed', (job) => {
      logger.debug(`Claim job ${job.id} completed`);
    });

    this.claimsWorker.on('failed', (job, err) => {
      logger.error(`Claim job ${job?.id} failed: ${err.message}`);
    });

    this.remittanceWorker.on('completed', (job) => {
      logger.debug(`Remittance job ${job.id} completed`);
    });

    this.remittanceWorker.on('failed', (job, err) => {
      logger.error(`Remittance job ${job?.id} failed: ${err.message}`);
    });
  }

  async getStats() {
    const inFlightStats = await this.database.getInFlightStats();
    const elapsed = (Date.now() - this.startTime) / 1000;

    return {
      claimsProcessed: this.claimsProcessed,
      remittancesProcessed: this.remittancesProcessed,
      errors: this.errors,
      inFlightClaims: inFlightStats.total,
      inFlightByPayer: inFlightStats.byPayer,
      elapsedSeconds: elapsed,
      throughputClaimsPerSecond: elapsed > 0 ? this.claimsProcessed / elapsed : 0,
      throughputRemittancesPerSecond: elapsed > 0 ? this.remittancesProcessed / elapsed : 0,
      payerRegistry: this.payerRegistry.getStats(),
    };
  }

  async getOldClaims(olderThanMinutes: number = 5) {
    return await this.database.getOldClaims(olderThanMinutes);
  }
}