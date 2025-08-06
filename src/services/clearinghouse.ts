import { ClaimMessage, RemittanceMessage } from '../shared/types';
import { logger } from '../shared/logger';
import { InMemoryQueue } from '../queue/in-memory-queue';
import { ARAgingService } from './ar-aging';

interface StoredClaim {
  correlation_id: string;
  claim_id: string;
  payer_id: string;
  ingested_at: string;
  submitted_at: string;
  claim_data: any;
}

export class ClearinghouseService {
  private claimsQueue: InMemoryQueue<ClaimMessage>;
  private remittanceQueue: InMemoryQueue<RemittanceMessage>;
  private payerQueues: Map<string, InMemoryQueue<ClaimMessage>>;
  private payerConfigs: Map<string, any>;
  private storedClaims: Map<string, StoredClaim> = new Map(); // In-memory storage instead of DB
  private claimsProcessed = 0;
  private arAgingService?: ARAgingService;

  constructor(
    claimsQueue: InMemoryQueue<ClaimMessage>,
    remittanceQueue: InMemoryQueue<RemittanceMessage>,
    payerQueues: Map<string, InMemoryQueue<ClaimMessage>>,
    payerConfigs: Map<string, any>,
    arAgingService?: ARAgingService,
    private onStep3Complete?: () => void
  ) {
    this.claimsQueue = claimsQueue;
    this.remittanceQueue = remittanceQueue;
    this.payerQueues = payerQueues;
    this.payerConfigs = payerConfigs;
    this.arAgingService = arAgingService;

    this.setupProcessors();
  }

  private setupProcessors(): void {
    // Process incoming claims
    this.claimsQueue.process(async (job) => {
      await this.processClaim(job.data);
    });

    // Note: Remittances are processed by the billing service, not here
    // The clearinghouse just handles correlation tracking

    logger.info('Clearinghouse service processors initialized');
  }

  private async processClaim(claimMessage: ClaimMessage): Promise<void> {
    try {
      logger.debug(`Processing claim ${claimMessage.claim.claim_id} from correlation ${claimMessage.correlation_id}`);

      // Find the appropriate payer or use fallback
      const payerId = claimMessage.claim.payer_id;
      let targetPayerId = payerId;
      
      if (!this.payerConfigs.has(payerId)) {
        // Use first available payer as fallback
        const fallbackPayer = this.payerConfigs.keys().next().value;
        if (!fallbackPayer) {
          throw new Error(`No payer configuration found for ${payerId} and no fallback available`);
        }
        targetPayerId = fallbackPayer;
        logger.warn(`Using fallback payer ${targetPayerId} for unknown payer ${payerId}`);
      }

      // Store claim for correlation tracking (in-memory)
      this.storedClaims.set(claimMessage.correlation_id, {
        correlation_id: claimMessage.correlation_id,
        claim_id: claimMessage.claim.claim_id,
        payer_id: targetPayerId,
        ingested_at: claimMessage.ingested_at,
        submitted_at: new Date().toISOString(),
        claim_data: claimMessage.claim,
      });

      // Forward to appropriate payer queue
      const payerQueue = this.payerQueues.get(targetPayerId);
      if (!payerQueue) {
        throw new Error(`Payer queue not found for ${targetPayerId}`);
      }

      await payerQueue.add(claimMessage);

      // Track Step 3: Claims Forwarded to Payers
      if (this.onStep3Complete) {
        this.onStep3Complete();
      }

      // Record claim submission for AR Aging
      if (this.arAgingService) {
        const payerConfig = this.payerConfigs.get(targetPayerId);
        const payerName = payerConfig?.name || targetPayerId;
        this.arAgingService.recordClaimSubmission(claimMessage, payerName);
      }

      this.claimsProcessed++;
      
      // Log claim routing to show parallel submission
      const payerConfig = this.payerConfigs.get(targetPayerId);
      const payerName = payerConfig?.name || targetPayerId;
      const queueStats = payerQueue.getStats();
      logger.info(`🚀 Routed claim ${claimMessage.claim.claim_id} to ${payerName} (Queue: ${queueStats.pending} pending, ${queueStats.processing} processing)`);

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

  getStats() {
    return {
      claimsProcessed: this.claimsProcessed,
      storedClaimsCount: this.storedClaims.size,
    };
  }

  getStoredClaim(correlationId: string): StoredClaim | undefined {
    return this.storedClaims.get(correlationId);
  }
}