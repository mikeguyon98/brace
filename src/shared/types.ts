// Import and re-export types from the shared package
import { z } from 'zod';

// Denial categories and severity (copied from shared package)
export enum DenialSeverity {
  HARD_DENIAL = 'hard_denial',
  SOFT_DENIAL = 'soft_denial', 
  ADMINISTRATIVE = 'administrative'
}

export enum DenialCategory {
  MEDICAL_NECESSITY = 'medical_necessity',
  AUTHORIZATION = 'authorization',
  DUPLICATE = 'duplicate', 
  COORDINATION_BENEFITS = 'coordination_benefits',
  ELIGIBILITY = 'eligibility',
  CODING = 'coding',
  DOCUMENTATION = 'documentation',
  TIMELY_FILING = 'timely_filing',
  PROVIDER_ISSUES = 'provider_issues',
  TECHNICAL = 'technical'
}

// Core claim schemas - copied from shared package to avoid path issues
export const ServiceLineSchema = z.object({
  service_line_id: z.string(),
  procedure_code: z.string(),
  billed_amount: z.number().positive(),
  units: z.number().int().positive().default(1),
});

export const PayerClaimSchema = z.object({
  claim_id: z.string(),
  patient_id: z.string(),
  payer_id: z.string(),
  provider_id: z.string(),
  service_lines: z.array(ServiceLineSchema).min(1),
  submission_date: z.string().datetime(),
});

// Denial information schema
export const DenialInfoSchema = z.object({
  denial_code: z.string(),
  group_code: z.string(),
  reason_code: z.string(),
  category: z.nativeEnum(DenialCategory),
  severity: z.nativeEnum(DenialSeverity),
  description: z.string(),
  explanation: z.string(),
});

// Claim status enum
export enum ClaimStatus {
  APPROVED = 'approved',
  DENIED = 'denied',
  PARTIAL_DENIAL = 'partial_denial'
}

export const RemittanceLineSchema = z.object({
  service_line_id: z.string(),
  billed_amount: z.number(),
  payer_paid_amount: z.number(),
  coinsurance_amount: z.number(),
  copay_amount: z.number(),
  deductible_amount: z.number(),
  not_allowed_amount: z.number(),
  status: z.nativeEnum(ClaimStatus),
  denial_info: DenialInfoSchema.optional(),
});

export const RemittanceAdviceSchema = z.object({
  correlation_id: z.string(),
  claim_id: z.string(),
  payer_id: z.string(),
  remittance_lines: z.array(RemittanceLineSchema),
  processed_at: z.string().datetime(),
  overall_status: z.nativeEnum(ClaimStatus),
  total_denied_amount: z.number().optional(),
  edi_835_response: z.string().optional(),
});

export const ClaimMessageSchema = z.object({
  correlation_id: z.string(),
  claim: PayerClaimSchema,
  ingested_at: z.string().datetime(),
});

export const RemittanceMessageSchema = z.object({
  correlation_id: z.string(),
  remittance: RemittanceAdviceSchema,
});

export const PayerConfigSchema = z.object({
  payer_id: z.string(),
  name: z.string(),
  processing_delay_ms: z.object({
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  }),
  adjudication_rules: z.object({
    payer_percentage: z.number().min(0).max(1),
    copay_fixed_amount: z.number().min(0).optional(),
    deductible_percentage: z.number().min(0).max(1).optional(),
  }),
  denial_settings: z.object({
    denial_rate: z.number().min(0).max(1).default(0.05),
    hard_denial_rate: z.number().min(0).max(1).default(0.7),
    preferred_categories: z.array(z.nativeEnum(DenialCategory)).optional(),
  }).optional(),
});

// Type exports
export type ServiceLine = z.infer<typeof ServiceLineSchema>;
export type PayerClaim = z.infer<typeof PayerClaimSchema>;
export type DenialInfo = z.infer<typeof DenialInfoSchema>;
export type RemittanceLine = z.infer<typeof RemittanceLineSchema>;
export type RemittanceAdvice = z.infer<typeof RemittanceAdviceSchema>;
export type ClaimMessage = z.infer<typeof ClaimMessageSchema>;
export type RemittanceMessage = z.infer<typeof RemittanceMessageSchema>;
export type PayerConfig = z.infer<typeof PayerConfigSchema>;

// A/R Aging buckets
export enum ARAgingBucket {
  ZERO_TO_ONE_MIN = '0-1min',
  ONE_TO_TWO_MIN = '1-2min', 
  TWO_TO_THREE_MIN = '2-3min',
  THREE_PLUS_MIN = '3+min',
}

export interface ARAgingReport {
  payer_id: string;
  buckets: Record<ARAgingBucket, number>;
  total_claims: number;
  average_age_seconds: number;
}

export interface PatientCostShare {
  patient_id: string;
  total_copay: number;
  total_coinsurance: number;
  total_deductible: number;
  claim_count: number;
}

// Performance metrics
export interface PerformanceMetrics {
  claims_ingested_total: number;
  claims_processed_total: number;
  claims_in_flight: number;
  average_processing_time_ms: number;
  throughput_claims_per_second: number;
  error_count: number;
  queue_depths: Record<string, number>;
}

export { generateCorrelationId } from './utils';

// Additional types for single-process architecture
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface SingleProcessConfig {
  // Database configs
  clearinghouse: {
    database: DatabaseConfig;
  };
  billing: {
    database: DatabaseConfig;
    reportingIntervalSeconds?: number;
  };
  
  // Payer configurations
  payers: Array<{
    payer_id: string;
    name: string;
    processing_delay_ms: {
      min: number;
      max: number;
    };
    adjudication_rules: {
      payer_percentage: number;
      copay_fixed_amount?: number;
      deductible_percentage?: number;
    };
  }>;
  
  // General settings
  ingestion?: {
    rateLimit?: number; // claims per second
  };
}