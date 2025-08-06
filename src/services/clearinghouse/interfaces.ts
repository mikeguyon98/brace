/**
 * Clearinghouse Service Interfaces and Types
 * Contains all interface definitions for clearinghouse functionality
 */

export interface StoredClaim {
  correlation_id: string;
  claim_id: string;
  payer_id: string;
  ingested_at: string;
  submitted_at: string;
  claim_data: any;
}

export interface ClearinghouseStats {
  claimsProcessed: number;
  storedClaimsCount: number;
}

export interface PayerRouting {
  targetPayerId: string;
  fallbackUsed: boolean;
  payerQueue: any; // InMemoryQueue type
}

export interface ClaimRoutingResult {
  success: boolean;
  targetPayerId: string;
  payerName: string;
  queueStats: {
    pending: number;
    processing: number;
  };
  fallbackUsed?: boolean;
}