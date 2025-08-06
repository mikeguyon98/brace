/**
 * AR Aging Service Interfaces and Types
 * Contains all interface definitions for the AR aging functionality
 */

import { ARAgingBucket } from '../../shared/types';

export interface ARClaimRecord {
  correlationId: string;
  claimId: string;
  payerId: string;
  patientId: string;
  submittedAt: Date;
  remittedAt?: Date;
  billedAmount: number;
  paidAmount?: number;
  patientShare?: number;
  notAllowedAmount?: number;
  isOutstanding: boolean;
}

export interface ARAgingMetrics {
  payerId: string;
  payerName: string;
  buckets: Record<ARAgingBucket, number>;
  totalClaims: number;
  totalBilledAmount: number;
  totalPaidAmount: number;
  totalOutstanding: number;
  averageAgeMinutes: number;
  oldestClaimAgeMinutes: number;
}

export interface ARAgingAlert {
  type: 'HIGH_AGING' | 'STUCK_CLAIMS' | 'PAYER_DELAY' | 'DATA_VALIDATION';
  payerId?: string;
  message: string;
  claimCount?: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: Date;
}

export interface ARClaimStateStats {
  totalSubmitted: number;
  totalCompleted: number;
  outstanding: number;
  byPayer: Map<string, { submitted: number; completed: number; outstanding: number }>;
}

export interface ARAgingThresholds {
  criticalAgeMinutes: number;
  highVolumeThreshold: number;
  payerDelayThreshold: number;
}