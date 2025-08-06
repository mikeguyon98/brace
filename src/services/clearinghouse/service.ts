/**
 * Clearinghouse Service - Main Implementation
 * Orchestrates claim processing, routing, and correlation tracking
 */

import { ClaimMessage, RemittanceMessage } from '../../shared/types';
import { logger } from '../../shared/logger';
import { InMemoryQueue } from '../../queue/in-memory-queue';
import { ARAgingService } from '../ar-aging';
import { ClaimStorage } from './storage';
import { ClaimRouter } from './router';
import { ClearinghouseStats } from './interfaces';
import { ClaimStore } from '../database';

export class ClearinghouseService {
  private claimsQueue: InMemoryQueue<ClaimMessage>;
  private remittanceQueue: InMemoryQueue<RemittanceMessage>;
  private claimStorage: ClaimStorage;
  private claimRouter: ClaimRouter;
  private claimStore: ClaimStore;
  private claimsProcessed = 0;
  private arAgingService?: ARAgingService;

  constructor(
    claimsQueue: InMemoryQueue<ClaimMessage>,
    remittanceQueue: InMemoryQueue<RemittanceMessage>,
    payerQueues: Map<string, InMemoryQueue<ClaimMessage>>,
    payerConfigs: Map<string, any>,
    claimStore: ClaimStore,
    arAgingService?: ARAgingService
  ) {
    this.claimsQueue = claimsQueue;
    this.remittanceQueue = remittanceQueue;
    this.claimStorage = new ClaimStorage();
    this.claimRouter = new ClaimRouter(payerQueues, payerConfigs);
    this.claimStore = claimStore;
    this.arAgingService = arAgingService;

    this.setupProcessors();
  }

  /**
   * Initialize queue processors
   */
  private setupProcessors(): void {
    // Process incoming claims
    this.claimsQueue.process(async (job) => {
      await this.processClaim(job.data);
    });

    // Note: Remittances are processed by the billing service, not here
    // The clearinghouse just handles correlation tracking

    logger.info('Clearinghouse service processors initialized');
  }

  /**
   * Process a single claim through the clearinghouse
   */
  private async processClaim(claimMessage: ClaimMessage): Promise<void> {
    try {
      logger.debug(`Processing claim ${claimMessage.claim.claim_id} from correlation ${claimMessage.correlation_id}`);

      // Route the claim to appropriate payer
      const routingResult = await this.claimRouter.routeClaim(claimMessage);

      if (!routingResult.success) {
        throw new Error(`Failed to route claim ${claimMessage.claim.claim_id}`);
      }

      // Store claim for correlation tracking (legacy)
      this.claimStorage.storeClaim(claimMessage, routingResult.targetPayerId);

      // Update claim status in PostgreSQL
      await this.claimStore.markClaimRouted(
        claimMessage.claim.claim_id,
        routingResult.targetPayerId,
        routingResult.payerName
      );

      // Record claim submission for AR Aging
      if (this.arAgingService) {
        this.arAgingService.recordClaimSubmission(claimMessage, routingResult.payerName);
      }

      this.claimsProcessed++;
      
      // Periodic logging
      if (this.claimsProcessed % 10 === 0) {
        logger.info(`📤 Clearinghouse routed ${this.claimsProcessed} claims to payers`);
      }
      
      if (this.claimsProcessed % 100 === 0) {
        logger.info(`Clearinghouse processed ${this.claimsProcessed} claims`);
      }

    } catch (error) {
      logger.error(`Error processing claim ${claimMessage.claim.claim_id}:`, error);
      throw error;
    }
  }

  /**
   * Get service statistics
   */
  getStats(): ClearinghouseStats {
    return {
      claimsProcessed: this.claimsProcessed,
      storedClaimsCount: this.claimStorage.getStorageStats().totalStored,
    };
  }

  /**
   * Get stored claim by correlation ID
   */
  getStoredClaim(correlationId: string) {
    return this.claimStorage.getClaim(correlationId);
  }

  /**
   * Get all stored claims
   */
  getAllStoredClaims() {
    return this.claimStorage.getAllClaims();
  }

  /**
   * Get claims by payer
   */
  getClaimsByPayer(payerId: string) {
    return this.claimStorage.getClaimsByPayer(payerId);
  }

  /**
   * Get routing statistics
   */
  getRoutingStats() {
    return this.claimRouter.getRoutingStats();
  }

  /**
   * Get storage statistics
   */
  getStorageStats() {
    return this.claimStorage.getStorageStats();
  }

  /**
   * Stop service and cleanup
   */
  stop(): void {
    this.claimStorage.clear();
    logger.info('Clearinghouse service stopped');
  }

  /**
   * Check if a payer is valid
   */
  isValidPayer(payerId: string): boolean {
    return this.claimRouter.isValidPayer(payerId);
  }

  /**
   * Get available payers
   */
  getAvailablePayers(): string[] {
    return this.claimRouter.getAvailablePayers();
  }
}