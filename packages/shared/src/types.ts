import { z } from 'zod';
import { DenialSeverity, DenialCategory } from './denial-reasons';

// Updated schemas to match the new PayerClaim JSON schema specification
export const ServiceLineSchema = z.object({
  service_line_id: z.string(),
  procedure_code: z.string(),
  modifiers: z.array(z.string()).optional(),
  units: z.number().int().min(1),
  details: z.string(),
  unit_charge_currency: z.string(),
  unit_charge_amount: z.number().min(0),
  do_not_bill: z.boolean().optional(),
});

export const InsuranceSchema = z.object({
  payer_id: z.enum(["medicare", "united_health_group", "anthem"]),
  patient_member_id: z.string(),
});

export const PatientAddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
});

export const PatientSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().optional(),
  gender: z.string().regex(/^(m|f)$/),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // date format YYYY-MM-DD
  address: PatientAddressSchema.optional(),
});

export const OrganizationContactSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone_number: z.string().optional(),
});

export const OrganizationAddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
});

export const OrganizationSchema = z.object({
  name: z.string(),
  billing_npi: z.string().optional(),
  ein: z.string().optional(),
  contact: OrganizationContactSchema.optional(),
  address: OrganizationAddressSchema.optional(),
});

export const RenderingProviderSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  npi: z.string().regex(/^\d{10}$/), // exactly 10 digits
});

export const PayerClaimSchema = z.object({
  claim_id: z.string(),
  place_of_service_code: z.number().int(),
  insurance: InsuranceSchema,
  patient: PatientSchema,
  organization: OrganizationSchema,
  rendering_provider: RenderingProviderSchema,
  service_lines: z.array(ServiceLineSchema).min(1),
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

// Remittance advice schemas
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
  edi_835_response: z.string().optional(), // EDI-835 formatted response
});

// Internal message schemas for queue communication
export const ClaimMessageSchema = z.object({
  correlation_id: z.string(),
  claim: PayerClaimSchema,
  ingested_at: z.string().datetime(),
});

export const RemittanceMessageSchema = z.object({
  correlation_id: z.string(),
  remittance: RemittanceAdviceSchema,
});

// Configuration schemas
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
    denial_rate: z.number().min(0).max(1).default(0.05), // 5% default denial rate
    hard_denial_rate: z.number().min(0).max(1).default(0.7), // 70% of denials are hard denials
    preferred_categories: z.array(z.nativeEnum(DenialCategory)).optional(),
  }).optional(),
});

export const SimulatorConfigSchema = z.object({
  ingestion_rate: z.number().positive(),
  payers: z.array(PayerConfigSchema),
  redis: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    password: z.string().optional(),
  }),
  postgres: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    username: z.string(),
    password: z.string(),
    database: z.string(),
  }),
});

// Type exports
export type ServiceLine = z.infer<typeof ServiceLineSchema>;
export type PayerClaim = z.infer<typeof PayerClaimSchema>;
export type Insurance = z.infer<typeof InsuranceSchema>;
export type Patient = z.infer<typeof PatientSchema>;
export type PatientAddress = z.infer<typeof PatientAddressSchema>;
export type Organization = z.infer<typeof OrganizationSchema>;
export type OrganizationContact = z.infer<typeof OrganizationContactSchema>;
export type OrganizationAddress = z.infer<typeof OrganizationAddressSchema>;
export type RenderingProvider = z.infer<typeof RenderingProviderSchema>;
export type DenialInfo = z.infer<typeof DenialInfoSchema>;
export type RemittanceLine = z.infer<typeof RemittanceLineSchema>;
export type RemittanceAdvice = z.infer<typeof RemittanceAdviceSchema>;
export type ClaimMessage = z.infer<typeof ClaimMessageSchema>;
export type RemittanceMessage = z.infer<typeof RemittanceMessageSchema>;
export type PayerConfig = z.infer<typeof PayerConfigSchema>;
export type SimulatorConfig = z.infer<typeof SimulatorConfigSchema>;

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