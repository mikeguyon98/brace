/**
 * Ingestion Service - Main Implementation
 * Orchestrates file processing, rate limiting, and claim ingestion
 */

import { ClaimMessage, PayerClaim, generateCorrelationId } from '../../shared/types';
import { logger } from '../../shared/logger';
import { InMemoryQueue } from '../../queue/in-memory-queue';
import { FileProcessor } from './file-processor';
import { RateLimiter } from './rate-limiter';
import { IngestionConfig, IngestionStats, FileProcessingResult } from './interfaces';
import { ClaimStore } from '../database';

export class IngestionService {
  private claimsQueue: InMemoryQueue<ClaimMessage>;
  private config: IngestionConfig;
  private rateLimiter: RateLimiter;
  private claimStore: ClaimStore;
  private isRunning = false;
  private claimsIngested = 0;
  private startTime = 0;
  private totalClaims = 0;

  constructor(
    claimsQueue: InMemoryQueue<ClaimMessage>, 
    claimStore: ClaimStore,
    config: IngestionConfig = {}
  ) {
    this.claimsQueue = claimsQueue;
    this.claimStore = claimStore;
    this.config = {
      rateLimit: config.rateLimit || 1,
    };
    this.rateLimiter = new RateLimiter(this.config.rateLimit);
  }

  /**
   * Ingest claims from a file
   */
  async ingestFile(filePath: string): Promise<FileProcessingResult> {
    if (this.isRunning) {
      throw new Error('Ingestion already in progress');
    }

    this.isRunning = true;
    this.claimsIngested = 0;
    this.startTime = Date.now();

    try {
      logger.info(`Starting ingestion from file: ${filePath}`);
      logger.info(`Rate limit: ${this.config.rateLimit} claims/second`);

      // Validate file format first
      const formatValidation = FileProcessor.validateFileFormat(filePath);
      if (!formatValidation.isValid) {
        throw new Error(`Invalid file format: ${formatValidation.errors.join(', ')}`);
      }

      const claims = await FileProcessor.readClaimsFromFile(filePath);
      this.totalClaims = claims.length;

      if (claims.length === 0) {
        logger.warn('No valid claims found in file');
        return this.createProcessingResult(0, 0);
      }

      logger.info(`Processing ${claims.length} claims`);

      let successfulClaims = 0;
      let failedClaims = 0;

      for (let i = 0; i < claims.length; i++) {
        if (!this.isRunning) {
          logger.info('Ingestion stopped by user');
          break;
        }

        try {
          await this.ingestClaim(claims[i]);
          successfulClaims++;
          this.claimsIngested++;

          // Periodic progress logging
          if (this.claimsIngested % 100 === 0) {
            this.logProgress();
          }

          // Apply rate limiting (except for last claim)
          if (i < claims.length - 1) {
            await this.rateLimiter.waitForRate();
          }

        } catch (error) {
          logger.error(`Failed to ingest claim ${claims[i].claim_id}:`, error);
          failedClaims++;
          continue;
        }
      }

      const result = this.createProcessingResult(successfulClaims, failedClaims);
      this.logCompletion(result);
      return result;

    } catch (error) {
      logger.error('Ingestion failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
      this.rateLimiter.reset();
    }
  }

  /**
   * Ingest a single claim
   */
  private async ingestClaim(claim: PayerClaim): Promise<void> {
    const correlationId = generateCorrelationId();
    
    const claimMessage: ClaimMessage = {
      correlation_id: correlationId,
      claim,
      ingested_at: new Date().toISOString(),
    };

    try {
      // Store the claim in PostgreSQL
      await this.claimStore.storeNewClaim(claimMessage);
      
      // Mark it as ingested
      await this.claimStore.markClaimIngested(claim.claim_id);
      
      // Add to clearinghouse processing queue directly
      await this.claimsQueue.add(claimMessage);
      
      logger.debug(`Ingested claim ${claim.claim_id} with correlation ID ${correlationId}`);
    } catch (error) {
      logger.error(`Failed to store claim ${claim.claim_id} in database:`, error);
      throw error;
    }
  }

  /**
   * Create processing result summary
   */
  private createProcessingResult(successfulClaims: number, failedClaims: number): FileProcessingResult {
    const processingTime = Date.now() - this.startTime;
    const averageRate = processingTime > 0 ? (successfulClaims * 1000) / processingTime : 0;

    return {
      totalClaims: this.totalClaims,
      successfulClaims,
      failedClaims,
      processingTime,
      averageRate
    };
  }

  /**
   * Log processing progress
   */
  private logProgress(): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = this.rateLimiter.getCurrentRate(elapsed * 1000);
    logger.info(`Ingested ${this.claimsIngested}/${this.totalClaims} claims (${rate.toFixed(2)} claims/sec)`);
  }

  /**
   * Log completion summary
   */
  private logCompletion(result: FileProcessingResult): void {
    const elapsed = result.processingTime / 1000;
    logger.info(
      `Ingestion completed: ${result.successfulClaims} successful, ${result.failedClaims} failed ` +
      `in ${elapsed.toFixed(2)}s (${result.averageRate.toFixed(2)} claims/sec)`
    );
  }

  /**
   * Stop ingestion process
   */
  stop(): void {
    this.isRunning = false;
    logger.info('Stopping ingestion...');
  }

  /**
   * Get current ingestion statistics
   */
  getStats(): IngestionStats {
    const elapsed = this.isRunning ? Date.now() - this.startTime : 0;
    const currentRate = this.isRunning ? this.rateLimiter.getCurrentRate(elapsed) : 0;

    return {
      isRunning: this.isRunning,
      claimsIngested: this.claimsIngested,
      totalClaims: this.totalClaims,
      currentRate,
      elapsedTime: elapsed
    };
  }

  /**
   * Update rate limit during processing
   */
  setRateLimit(newRate: number): void {
    this.config.rateLimit = newRate;
    this.rateLimiter.setRateLimit(newRate);
  }

  /**
   * Get rate limiter statistics
   */
  getRateLimiterStats() {
    return this.rateLimiter.getStats();
  }

  /**
   * Check if ingestion is currently running
   */
  isIngestionRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get configuration
   */
  getConfig(): IngestionConfig {
    return { ...this.config };
  }
}