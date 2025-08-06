import { readFileSync } from 'fs';
import { ClaimMessage, PayerClaim, generateCorrelationId } from '../shared/types';
import { logger } from '../shared/logger';
import { InMemoryQueue } from '../queue/in-memory-queue';

export interface IngestionConfig {
  rateLimit?: number; // claims per second, default 1
}

export class IngestionService {
  private claimsQueue: InMemoryQueue<ClaimMessage>;
  private config: IngestionConfig;
  private isRunning = false;
  private claimsIngested = 0;

  constructor(claimsQueue: InMemoryQueue<ClaimMessage>, config: IngestionConfig = {}) {
    this.claimsQueue = claimsQueue;
    this.config = {
      rateLimit: config.rateLimit || 1,
    };
  }

  async ingestFile(filePath: string): Promise<void> {
    if (this.isRunning) {
      throw new Error('Ingestion already in progress');
    }

    this.isRunning = true;
    this.claimsIngested = 0;
    const startTime = Date.now();

    try {
      logger.info(`Starting ingestion from file: ${filePath}`);
      logger.info(`Rate limit: ${this.config.rateLimit} claims/second`);

      const fileContent = readFileSync(filePath, 'utf-8');
      const lines = fileContent.trim().split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        logger.warn('No claims found in file');
        return;
      }

      logger.info(`Found ${lines.length} claims to process`);

      const intervalMs = 1000 / this.config.rateLimit!;
      
      for (let i = 0; i < lines.length; i++) {
        if (!this.isRunning) {
          logger.info('Ingestion stopped by user');
          break;
        }

        try {
          const claim = JSON.parse(lines[i]) as PayerClaim;
          await this.ingestClaim(claim);
          this.claimsIngested++;

          if (this.claimsIngested % 100 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = this.claimsIngested / elapsed;
            logger.info(`Ingested ${this.claimsIngested}/${lines.length} claims (${rate.toFixed(2)} claims/sec)`);
          }

          // Rate limiting
          if (i < lines.length - 1) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
          }
        } catch (error) {
          logger.error(`Failed to parse claim on line ${i + 1}:`, error);
          continue;
        }
      }

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = this.claimsIngested / elapsed;
      logger.info(`Ingestion completed: ${this.claimsIngested} claims in ${elapsed.toFixed(2)}s (${rate.toFixed(2)} claims/sec)`);

    } catch (error) {
      logger.error('Ingestion failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private async ingestClaim(claim: PayerClaim): Promise<void> {
    const correlationId = generateCorrelationId();
    
    const claimMessage: ClaimMessage = {
      correlation_id: correlationId,
      claim,
      ingested_at: new Date().toISOString(),
    };

    await this.claimsQueue.add(claimMessage);
    
    logger.debug(`Ingested claim ${claim.claim_id} with correlation ID ${correlationId}`);
  }

  stop(): void {
    this.isRunning = false;
    logger.info('Stopping ingestion...');
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      claimsIngested: this.claimsIngested,
    };
  }
}