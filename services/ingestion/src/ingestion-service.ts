import { Queue } from 'bullmq';
import Redis from 'ioredis';
import {
  type PayerClaim,
  type ClaimMessage,
  generateCorrelationId,
  createServiceLogger,
  QUEUE_NAMES,
  QUEUE_CONFIGS,
} from '@billing-simulator/shared';
import { ClaimsFileReader } from './file-reader';
import { createRateLimiter } from './rate-limiter';

const logger = createServiceLogger('ingestion-service');

export interface IngestionServiceConfig {
  filePath: string;
  rate: number;
  redis: {
    host: string;
    port: number;
    password?: string;
  };
}

export class IngestionService {
  private config: IngestionServiceConfig;
  private redis: Redis;
  private claimsQueue: Queue<ClaimMessage>;
  private rateLimiter: ReturnType<typeof createRateLimiter>;
  private fileReader: ClaimsFileReader;
  private isRunning = false;
  private claimsIngested = 0;
  private startTime = 0;

  constructor(config: IngestionServiceConfig) {
    this.config = config;
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.claimsQueue = new Queue(QUEUE_NAMES.CLAIMS_INGESTION, {
      connection: this.redis,
      defaultJobOptions: QUEUE_CONFIGS.ingestion.defaultJobOptions,
    });

    this.rateLimiter = createRateLimiter(config.rate);

    this.fileReader = new ClaimsFileReader({
      filePath: config.filePath,
      onClaim: this.handleClaim.bind(this),
      onError: this.handleError.bind(this),
      onComplete: this.handleComplete.bind(this),
    });

    logger.info(`Ingestion service initialized for file: ${config.filePath} at rate: ${config.rate} claims/sec`);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Ingestion service is already running');
    }

    try {
      await this.redis.connect();
      logger.info('Connected to Redis');

      this.isRunning = true;
      this.startTime = Date.now();
      this.claimsIngested = 0;

      logger.info('Starting claims ingestion...');
      await this.fileReader.start();

    } catch (error) {
      logger.error(`Failed to start ingestion service: ${error instanceof Error ? error.message : error}`);
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('Stopping ingestion service...');
    this.isRunning = false;

    try {
      await this.claimsQueue.close();
      await this.redis.disconnect();
      logger.info('Ingestion service stopped');
    } catch (error) {
      logger.error(`Error during shutdown: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async handleClaim(claim: PayerClaim, lineNumber: number): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Apply rate limiting
      await this.rateLimiter.waitForToken();

      // Create correlation ID and message
      const correlationId = generateCorrelationId();
      const claimMessage: ClaimMessage = {
        correlation_id: correlationId,
        claim,
        ingested_at: new Date().toISOString(),
      };

      // Add to queue
      await this.claimsQueue.add('process-claim', claimMessage, {
        priority: 0, // Could prioritize based on claim value or urgency
        delay: 0,
      });

      this.claimsIngested++;

      if (this.claimsIngested % 100 === 0) {
        const elapsed = (Date.now() - this.startTime) / 1000;
        const actualRate = this.claimsIngested / elapsed;
        logger.info(`Ingested ${this.claimsIngested} claims (${actualRate.toFixed(2)} claims/sec actual rate)`);
      }

    } catch (error) {
      logger.error(`Failed to enqueue claim from line ${lineNumber}: ${error instanceof Error ? error.message : error}`);
      this.handleError(error instanceof Error ? error : new Error(String(error)), lineNumber, '');
    }
  }

  private handleError(error: Error, lineNumber: number, line: string): void {
    logger.error(`Error processing line ${lineNumber}: ${error.message}`, {
      lineNumber,
      line: line.substring(0, 100), // Log first 100 chars for debugging
      error: error.message,
    });

    // For critical errors, could stop the service
    if (error.message.includes('Redis') || error.message.includes('connection')) {
      logger.error('Critical error detected, stopping service');
      this.stop();
    }
  }

  private handleComplete(): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const actualRate = this.claimsIngested / elapsed;
    const fileStats = this.fileReader.getStats();

    logger.info('File ingestion completed', {
      totalClaims: this.claimsIngested,
      totalLines: fileStats.totalLines,
      invalidClaims: fileStats.invalidClaims,
      elapsedSeconds: elapsed.toFixed(2),
      actualRate: actualRate.toFixed(2),
      configuredRate: this.config.rate,
    });

    // Keep service running to handle any remaining queue operations
    // In a real system, you might want to gracefully shutdown after a delay
    setTimeout(() => {
      logger.info('Ingestion service will remain active for queue processing');
    }, 5000);
  }

  async getStats() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    return {
      claimsIngested: this.claimsIngested,
      elapsedSeconds: elapsed,
      actualRate: elapsed > 0 ? this.claimsIngested / elapsed : 0,
      configuredRate: this.config.rate,
      fileStats: this.fileReader.getStats(),
      queueWaiting: await this.claimsQueue.getWaiting(),
    };
  }
}