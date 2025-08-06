/**
 * Billing Service Interfaces and Types
 * Contains all interface definitions for billing functionality
 */

import { PatientCostShare } from '../../shared/types';

export interface BillingStats {
  totalClaims: number;
  totalBilledAmount: number;
  totalPaidAmount: number;
  totalPatientResponsibility: number;
  payerBreakdown: Map<string, PayerBillingStats>;
  patientCostShares: Map<string, PatientCostShare>;
  processingTimes: number[];
}

export interface PayerBillingStats {
  claimsCount: number;
  billedAmount: number;
  paidAmount: number;
}

export interface BillingServiceConfig {
  reportingIntervalSeconds?: number;
}

export interface BillingReport {
  summary: BillingSummary;
  payerBreakdown: (PayerBillingStats & { payerId: string })[];
  topPatients: PatientCostShare[];
  systemMetrics: SystemMetrics;
}

export interface BillingSummary {
  totalClaims: number;
  totalBilledAmount: number;
  totalPaidAmount: number;
  totalPatientResponsibility: number;
  paymentRate: number;
  averageThroughput: number;
  systemUptime: number;
}

export interface SystemMetrics {
  uptime: number;
  throughput: number;
  averageProcessingTime?: number;
}

export interface RemittanceProcessingResult {
  success: boolean;
  claimId: string;
  billedAmount: number;
  paidAmount: number;
  patientResponsibility: number;
  processingTime?: number;
}