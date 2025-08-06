"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ARAgingBucket = exports.SimulatorConfigSchema = exports.PayerConfigSchema = exports.RemittanceMessageSchema = exports.ClaimMessageSchema = exports.RemittanceAdviceSchema = exports.RemittanceLineSchema = exports.PayerClaimSchema = exports.ServiceLineSchema = void 0;
const zod_1 = require("zod");
// Core claim schemas based on the specification
exports.ServiceLineSchema = zod_1.z.object({
    service_line_id: zod_1.z.string(),
    procedure_code: zod_1.z.string(),
    billed_amount: zod_1.z.number().positive(),
    units: zod_1.z.number().int().positive().default(1),
});
exports.PayerClaimSchema = zod_1.z.object({
    claim_id: zod_1.z.string(),
    patient_id: zod_1.z.string(),
    payer_id: zod_1.z.string(),
    provider_id: zod_1.z.string(),
    service_lines: zod_1.z.array(exports.ServiceLineSchema).min(1),
    submission_date: zod_1.z.string().datetime(),
});
// Remittance advice schemas
exports.RemittanceLineSchema = zod_1.z.object({
    service_line_id: zod_1.z.string(),
    billed_amount: zod_1.z.number(),
    payer_paid_amount: zod_1.z.number(),
    coinsurance_amount: zod_1.z.number(),
    copay_amount: zod_1.z.number(),
    deductible_amount: zod_1.z.number(),
    not_allowed_amount: zod_1.z.number(),
});
exports.RemittanceAdviceSchema = zod_1.z.object({
    correlation_id: zod_1.z.string(),
    claim_id: zod_1.z.string(),
    payer_id: zod_1.z.string(),
    remittance_lines: zod_1.z.array(exports.RemittanceLineSchema),
    processed_at: zod_1.z.string().datetime(),
});
// Internal message schemas for queue communication
exports.ClaimMessageSchema = zod_1.z.object({
    correlation_id: zod_1.z.string(),
    claim: exports.PayerClaimSchema,
    ingested_at: zod_1.z.string().datetime(),
});
exports.RemittanceMessageSchema = zod_1.z.object({
    correlation_id: zod_1.z.string(),
    remittance: exports.RemittanceAdviceSchema,
});
// Configuration schemas
exports.PayerConfigSchema = zod_1.z.object({
    payer_id: zod_1.z.string(),
    name: zod_1.z.string(),
    processing_delay_ms: zod_1.z.object({
        min: zod_1.z.number().int().positive(),
        max: zod_1.z.number().int().positive(),
    }),
    adjudication_rules: zod_1.z.object({
        payer_percentage: zod_1.z.number().min(0).max(1),
        copay_fixed_amount: zod_1.z.number().min(0).optional(),
        deductible_percentage: zod_1.z.number().min(0).max(1).optional(),
    }),
});
exports.SimulatorConfigSchema = zod_1.z.object({
    ingestion_rate: zod_1.z.number().positive(),
    payers: zod_1.z.array(exports.PayerConfigSchema),
    redis: zod_1.z.object({
        host: zod_1.z.string(),
        port: zod_1.z.number().int().positive(),
        password: zod_1.z.string().optional(),
    }),
    postgres: zod_1.z.object({
        host: zod_1.z.string(),
        port: zod_1.z.number().int().positive(),
        username: zod_1.z.string(),
        password: zod_1.z.string(),
        database: zod_1.z.string(),
    }),
});
// A/R Aging buckets
var ARAgingBucket;
(function (ARAgingBucket) {
    ARAgingBucket["ZERO_TO_ONE_MIN"] = "0-1min";
    ARAgingBucket["ONE_TO_TWO_MIN"] = "1-2min";
    ARAgingBucket["TWO_TO_THREE_MIN"] = "2-3min";
    ARAgingBucket["THREE_PLUS_MIN"] = "3+min";
})(ARAgingBucket || (exports.ARAgingBucket = ARAgingBucket = {}));
//# sourceMappingURL=types.js.map