/**
 * Payer Service - Main Implementation
 * Orchestrates payer operations including claim processing and queue management
 */

import { ClaimMessage, RemittanceMessage, PayerConfig } from '../../shared/types';
import { logger } from '../../shared/logger';
import { InMemoryQueue } from '../../queue/in-memory-queue';
import { PayerAdjudicator } from './adjudicator';
import { PayerStats } from './interfaces';
import { ClaimStore } from '../database';

export class PayerService {
  private adjudicator: PayerAdjudicator;
  private payerQueue: InMemoryQueue<ClaimMessage>;
  private remittanceQueue: InMemoryQueue<RemittanceMessage>;
  private config: PayerConfig;
  private claimStore: ClaimStore;
  private claimsProcessed = 0;

  constructor(
    config: PayerConfig,
    payerQueue: InMemoryQueue<ClaimMessage>,
    remittanceQueue: InMemoryQueue<RemittanceMessage>,
    claimStore: ClaimStore
  ) {
    this.config = config;
    this.adjudicator = new PayerAdjudicator(config);
    this.payerQueue = payerQueue;
    this.remittanceQueue = remittanceQueue;
    this.claimStore = claimStore;

    this.setupProcessor();
  }

  /**
   * Initialize queue processors
   */
  private setupProcessor(): void {
    this.payerQueue.process(async (job) => {
      await this.processClaim(job.data);
    });

    logger.info(`Payer service initialized for ${this.config.name} (${this.config.payer_id})`);
  }

  /**
   * Process a single claim through the adjudication pipeline
   */
  private async processClaim(claimMessage: ClaimMessage): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Log when claim processing starts (immediate)
      logger.info(`⚡ ${this.config.name} STARTED processing claim ${claimMessage.claim.claim_id}`);

      // Simulate processing delay
      await this.adjudicator.simulateProcessingDelay();

      // Adjudicate the claim
      const remittance = await this.adjudicator.adjudicateClaim(
        claimMessage.correlation_id,
        claimMessage.claim
      );

      const processingTime = Date.now() - startTime;

      // Calculate totals from remittance lines
      const totalPaidAmount = remittance.remittance_lines.reduce(
        (sum: number, line: any) => sum + line.payer_paid_amount, 
        0
      );
      const totalPatientResponsibility = remittance.remittance_lines.reduce(
        (sum: number, line: any) => sum + (line.copay_amount || 0) + (line.deductible_amount || 0), 
        0
      );
      
      // Get denial info from first denied line (if any)
      const deniedLine = remittance.remittance_lines.find((line: any) => line.denial_info);
      
      // Update claim status in PostgreSQL with adjudication results
      await this.claimStore.markClaimAdjudicated(claimMessage.claim.claim_id, {
        status: totalPaidAmount > 0 ? 'paid' : 'denied',
        paidAmount: totalPaidAmount,
        patientResponsibility: totalPatientResponsibility,
        denialReason: deniedLine?.denial_info?.description,
        denialCode: deniedLine?.denial_info?.denial_code,
        processingTimeMs: processingTime
      });

      // Send remittance back to clearinghouse
      const remittanceMessage: RemittanceMessage = {
        correlation_id: claimMessage.correlation_id,
        remittance,
      };

      await this.remittanceQueue.add(remittanceMessage);

      this.claimsProcessed++;
      
      // Log when claim processing completes (after delay)
      logger.info(`✅ ${this.config.name} COMPLETED claim ${claimMessage.claim.claim_id} after ${(processingTime/1000).toFixed(1)}s`);

      logger.debug(`Processed claim ${claimMessage.claim.claim_id} in ${processingTime}ms`);

      if (this.claimsProcessed % 50 === 0) {
        logger.info(`${this.config.name} processed ${this.claimsProcessed} claims`);
      }

    } catch (error) {
      logger.error(`Error processing claim ${claimMessage.claim.claim_id} for payer ${this.config.payer_id}:`, error);
      throw error;
    }
  }

  /**
   * Get service statistics
   */
  getStats(): PayerStats {
    return {
      payerId: this.config.payer_id,
      payerName: this.config.name,
      claimsProcessed: this.claimsProcessed,
    };
  }

  /**
   * Get payer configuration
   */
  getConfig(): PayerConfig {
    return this.config;
  }

  /**
   * Get current queue statistics
   */
  getQueueStats() {
    return this.payerQueue.getStats();
  }

  /**
   * Stop processing (cleanup method)
   */
  stop(): void {
    // Stop queue processing if needed
    logger.info(`${this.config.name} payer service stopped`);
  }
}