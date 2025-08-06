/**
 * Clearinghouse Claim Router
 * Handles payer routing logic and queue management
 */

import { ClaimMessage } from '../../shared/types';
import { InMemoryQueue } from '../../queue/in-memory-queue';
import { logger } from '../../shared/logger';
import { ClaimRoutingResult } from './interfaces';

export class ClaimRouter {
  private payerQueues: Map<string, InMemoryQueue<ClaimMessage>>;
  private payerConfigs: Map<string, any>;

  constructor(
    payerQueues: Map<string, InMemoryQueue<ClaimMessage>>,
    payerConfigs: Map<string, any>
  ) {
    this.payerQueues = payerQueues;
    this.payerConfigs = payerConfigs;
  }

  /**
   * Route a claim to the appropriate payer queue
   */
  async routeClaim(claimMessage: ClaimMessage): Promise<ClaimRoutingResult> {
    const payerId = claimMessage.claim.insurance.payer_id;
    const routingInfo = this.determinePayer(payerId);

    if (!routingInfo.payerQueue) {
      throw new Error(`Payer queue not found for ${routingInfo.targetPayerId}`);
    }

    // Add claim to payer queue
    await routingInfo.payerQueue.add(claimMessage);

    // Get queue statistics for logging
    const queueStats = routingInfo.payerQueue.getStats();
    const payerConfig = this.payerConfigs.get(routingInfo.targetPayerId);
    const payerName = payerConfig?.name || routingInfo.targetPayerId;

    const result: ClaimRoutingResult = {
      success: true,
      targetPayerId: routingInfo.targetPayerId,
      payerName,
      queueStats: {
        pending: queueStats.pending,
        processing: queueStats.processing
      },
      fallbackUsed: routingInfo.fallbackUsed
    };

    this.logRouting(claimMessage, result);
    return result;
  }

  /**
   * Determine which payer to route the claim to
   */
  private determinePayer(requestedPayerId: string): {
    targetPayerId: string;
    fallbackUsed: boolean;
    payerQueue: InMemoryQueue<ClaimMessage> | undefined;
  } {
    // First, try to find the requested payer
    if (this.payerConfigs.has(requestedPayerId)) {
      return {
        targetPayerId: requestedPayerId,
        fallbackUsed: false,
        payerQueue: this.payerQueues.get(requestedPayerId)
      };
    }

    // Use first available payer as fallback
    const fallbackPayer = this.payerConfigs.keys().next().value;
    if (!fallbackPayer) {
      return {
        targetPayerId: requestedPayerId,
        fallbackUsed: false,
        payerQueue: undefined
      };
    }

    logger.warn(`Using fallback payer ${fallbackPayer} for unknown payer ${requestedPayerId}`);
    return {
      targetPayerId: fallbackPayer,
      fallbackUsed: true,
      payerQueue: this.payerQueues.get(fallbackPayer)
    };
  }

  /**
   * Log routing information
   */
  private logRouting(claimMessage: ClaimMessage, result: ClaimRoutingResult): void {
    const fallbackText = result.fallbackUsed ? ' (FALLBACK)' : '';
    logger.info(
      `🚀 Routed claim ${claimMessage.claim.claim_id} to ${result.payerName}${fallbackText} ` +
      `(Queue: ${result.queueStats.pending} pending, ${result.queueStats.processing} processing)`
    );
  }

  /**
   * Get routing statistics
   */
  getRoutingStats() {
    const payerStats = new Map();
    
    for (const [payerId, queue] of this.payerQueues) {
      const stats = queue.getStats();
      const config = this.payerConfigs.get(payerId);
      payerStats.set(payerId, {
        payerName: config?.name || payerId,
        queueStats: stats
      });
    }

    return {
      totalPayers: this.payerQueues.size,
      payerStats
    };
  }

  /**
   * Check if a payer exists in configuration
   */
  isValidPayer(payerId: string): boolean {
    return this.payerConfigs.has(payerId);
  }

  /**
   * Get all available payer IDs
   */
  getAvailablePayers(): string[] {
    return Array.from(this.payerConfigs.keys());
  }

  /**
   * Get payer configuration
   */
  getPayerConfig(payerId: string): any {
    return this.payerConfigs.get(payerId);
  }
}