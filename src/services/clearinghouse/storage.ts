/**
 * Clearinghouse Claim Storage
 * Handles in-memory storage and correlation tracking of claims
 */

import { ClaimMessage } from '../../shared/types';
import { StoredClaim } from './interfaces';

export class ClaimStorage {
  private storedClaims: Map<string, StoredClaim> = new Map();

  /**
   * Store a claim for correlation tracking
   */
  storeClaim(claimMessage: ClaimMessage, targetPayerId: string): StoredClaim {
    const storedClaim: StoredClaim = {
      correlation_id: claimMessage.correlation_id,
      claim_id: claimMessage.claim.claim_id,
      payer_id: targetPayerId,
      ingested_at: claimMessage.ingested_at,
      submitted_at: new Date().toISOString(),
      claim_data: claimMessage.claim,
    };

    this.storedClaims.set(claimMessage.correlation_id, storedClaim);
    return storedClaim;
  }

  /**
   * Retrieve a stored claim by correlation ID
   */
  getClaim(correlationId: string): StoredClaim | undefined {
    return this.storedClaims.get(correlationId);
  }

  /**
   * Get all stored claims
   */
  getAllClaims(): StoredClaim[] {
    return Array.from(this.storedClaims.values());
  }

  /**
   * Get storage statistics
   */
  getStorageStats() {
    return {
      totalStored: this.storedClaims.size,
      storageKeys: Array.from(this.storedClaims.keys()),
    };
  }

  /**
   * Clear all stored claims (for cleanup)
   */
  clear(): void {
    this.storedClaims.clear();
  }

  /**
   * Remove specific claim from storage
   */
  removeClaim(correlationId: string): boolean {
    return this.storedClaims.delete(correlationId);
  }

  /**
   * Get claims by payer ID
   */
  getClaimsByPayer(payerId: string): StoredClaim[] {
    return Array.from(this.storedClaims.values())
      .filter(claim => claim.payer_id === payerId);
  }
}