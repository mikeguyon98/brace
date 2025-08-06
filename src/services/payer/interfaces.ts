/**
 * Payer Service Interfaces and Types
 * Contains all interface definitions for payer adjudication functionality
 */

import { 
  PayerConfig, 
  RemittanceAdvice, 
  RemittanceLine,
  ClaimStatus,
  DenialInfo,
  PayerClaim
} from '../../shared/types';

export interface PayerStats {
  payerId: string;
  payerName: string;
  claimsProcessed: number;
}

export interface AdjudicationResult {
  remittance: RemittanceAdvice;
  processingTimeMs: number;
  status: ClaimStatus;
}

export interface ServiceLineAdjudicationInput {
  serviceLine: any; // Service line from claim
  adjudicationRules: PayerConfig['adjudication_rules'];
}

export interface ClaimAdjudicationInput {
  correlationId: string;
  claim: PayerClaim;
  config: PayerConfig;
}