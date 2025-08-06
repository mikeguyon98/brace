import { z } from 'zod';
export declare const ServiceLineSchema: z.ZodObject<{
    service_line_id: z.ZodString;
    procedure_code: z.ZodString;
    billed_amount: z.ZodNumber;
    units: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    service_line_id: string;
    procedure_code: string;
    billed_amount: number;
    units: number;
}, {
    service_line_id: string;
    procedure_code: string;
    billed_amount: number;
    units?: number | undefined;
}>;
export declare const PayerClaimSchema: z.ZodObject<{
    claim_id: z.ZodString;
    patient_id: z.ZodString;
    payer_id: z.ZodString;
    provider_id: z.ZodString;
    service_lines: z.ZodArray<z.ZodObject<{
        service_line_id: z.ZodString;
        procedure_code: z.ZodString;
        billed_amount: z.ZodNumber;
        units: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        service_line_id: string;
        procedure_code: string;
        billed_amount: number;
        units: number;
    }, {
        service_line_id: string;
        procedure_code: string;
        billed_amount: number;
        units?: number | undefined;
    }>, "many">;
    submission_date: z.ZodString;
}, "strip", z.ZodTypeAny, {
    claim_id: string;
    patient_id: string;
    payer_id: string;
    provider_id: string;
    service_lines: {
        service_line_id: string;
        procedure_code: string;
        billed_amount: number;
        units: number;
    }[];
    submission_date: string;
}, {
    claim_id: string;
    patient_id: string;
    payer_id: string;
    provider_id: string;
    service_lines: {
        service_line_id: string;
        procedure_code: string;
        billed_amount: number;
        units?: number | undefined;
    }[];
    submission_date: string;
}>;
export declare const RemittanceLineSchema: z.ZodObject<{
    service_line_id: z.ZodString;
    billed_amount: z.ZodNumber;
    payer_paid_amount: z.ZodNumber;
    coinsurance_amount: z.ZodNumber;
    copay_amount: z.ZodNumber;
    deductible_amount: z.ZodNumber;
    not_allowed_amount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    service_line_id: string;
    billed_amount: number;
    payer_paid_amount: number;
    coinsurance_amount: number;
    copay_amount: number;
    deductible_amount: number;
    not_allowed_amount: number;
}, {
    service_line_id: string;
    billed_amount: number;
    payer_paid_amount: number;
    coinsurance_amount: number;
    copay_amount: number;
    deductible_amount: number;
    not_allowed_amount: number;
}>;
export declare const RemittanceAdviceSchema: z.ZodObject<{
    correlation_id: z.ZodString;
    claim_id: z.ZodString;
    payer_id: z.ZodString;
    remittance_lines: z.ZodArray<z.ZodObject<{
        service_line_id: z.ZodString;
        billed_amount: z.ZodNumber;
        payer_paid_amount: z.ZodNumber;
        coinsurance_amount: z.ZodNumber;
        copay_amount: z.ZodNumber;
        deductible_amount: z.ZodNumber;
        not_allowed_amount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        service_line_id: string;
        billed_amount: number;
        payer_paid_amount: number;
        coinsurance_amount: number;
        copay_amount: number;
        deductible_amount: number;
        not_allowed_amount: number;
    }, {
        service_line_id: string;
        billed_amount: number;
        payer_paid_amount: number;
        coinsurance_amount: number;
        copay_amount: number;
        deductible_amount: number;
        not_allowed_amount: number;
    }>, "many">;
    processed_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    claim_id: string;
    payer_id: string;
    correlation_id: string;
    remittance_lines: {
        service_line_id: string;
        billed_amount: number;
        payer_paid_amount: number;
        coinsurance_amount: number;
        copay_amount: number;
        deductible_amount: number;
        not_allowed_amount: number;
    }[];
    processed_at: string;
}, {
    claim_id: string;
    payer_id: string;
    correlation_id: string;
    remittance_lines: {
        service_line_id: string;
        billed_amount: number;
        payer_paid_amount: number;
        coinsurance_amount: number;
        copay_amount: number;
        deductible_amount: number;
        not_allowed_amount: number;
    }[];
    processed_at: string;
}>;
export declare const ClaimMessageSchema: z.ZodObject<{
    correlation_id: z.ZodString;
    claim: z.ZodObject<{
        claim_id: z.ZodString;
        patient_id: z.ZodString;
        payer_id: z.ZodString;
        provider_id: z.ZodString;
        service_lines: z.ZodArray<z.ZodObject<{
            service_line_id: z.ZodString;
            procedure_code: z.ZodString;
            billed_amount: z.ZodNumber;
            units: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            service_line_id: string;
            procedure_code: string;
            billed_amount: number;
            units: number;
        }, {
            service_line_id: string;
            procedure_code: string;
            billed_amount: number;
            units?: number | undefined;
        }>, "many">;
        submission_date: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        claim_id: string;
        patient_id: string;
        payer_id: string;
        provider_id: string;
        service_lines: {
            service_line_id: string;
            procedure_code: string;
            billed_amount: number;
            units: number;
        }[];
        submission_date: string;
    }, {
        claim_id: string;
        patient_id: string;
        payer_id: string;
        provider_id: string;
        service_lines: {
            service_line_id: string;
            procedure_code: string;
            billed_amount: number;
            units?: number | undefined;
        }[];
        submission_date: string;
    }>;
    ingested_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    correlation_id: string;
    claim: {
        claim_id: string;
        patient_id: string;
        payer_id: string;
        provider_id: string;
        service_lines: {
            service_line_id: string;
            procedure_code: string;
            billed_amount: number;
            units: number;
        }[];
        submission_date: string;
    };
    ingested_at: string;
}, {
    correlation_id: string;
    claim: {
        claim_id: string;
        patient_id: string;
        payer_id: string;
        provider_id: string;
        service_lines: {
            service_line_id: string;
            procedure_code: string;
            billed_amount: number;
            units?: number | undefined;
        }[];
        submission_date: string;
    };
    ingested_at: string;
}>;
export declare const RemittanceMessageSchema: z.ZodObject<{
    correlation_id: z.ZodString;
    remittance: z.ZodObject<{
        correlation_id: z.ZodString;
        claim_id: z.ZodString;
        payer_id: z.ZodString;
        remittance_lines: z.ZodArray<z.ZodObject<{
            service_line_id: z.ZodString;
            billed_amount: z.ZodNumber;
            payer_paid_amount: z.ZodNumber;
            coinsurance_amount: z.ZodNumber;
            copay_amount: z.ZodNumber;
            deductible_amount: z.ZodNumber;
            not_allowed_amount: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            service_line_id: string;
            billed_amount: number;
            payer_paid_amount: number;
            coinsurance_amount: number;
            copay_amount: number;
            deductible_amount: number;
            not_allowed_amount: number;
        }, {
            service_line_id: string;
            billed_amount: number;
            payer_paid_amount: number;
            coinsurance_amount: number;
            copay_amount: number;
            deductible_amount: number;
            not_allowed_amount: number;
        }>, "many">;
        processed_at: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        claim_id: string;
        payer_id: string;
        correlation_id: string;
        remittance_lines: {
            service_line_id: string;
            billed_amount: number;
            payer_paid_amount: number;
            coinsurance_amount: number;
            copay_amount: number;
            deductible_amount: number;
            not_allowed_amount: number;
        }[];
        processed_at: string;
    }, {
        claim_id: string;
        payer_id: string;
        correlation_id: string;
        remittance_lines: {
            service_line_id: string;
            billed_amount: number;
            payer_paid_amount: number;
            coinsurance_amount: number;
            copay_amount: number;
            deductible_amount: number;
            not_allowed_amount: number;
        }[];
        processed_at: string;
    }>;
}, "strip", z.ZodTypeAny, {
    correlation_id: string;
    remittance: {
        claim_id: string;
        payer_id: string;
        correlation_id: string;
        remittance_lines: {
            service_line_id: string;
            billed_amount: number;
            payer_paid_amount: number;
            coinsurance_amount: number;
            copay_amount: number;
            deductible_amount: number;
            not_allowed_amount: number;
        }[];
        processed_at: string;
    };
}, {
    correlation_id: string;
    remittance: {
        claim_id: string;
        payer_id: string;
        correlation_id: string;
        remittance_lines: {
            service_line_id: string;
            billed_amount: number;
            payer_paid_amount: number;
            coinsurance_amount: number;
            copay_amount: number;
            deductible_amount: number;
            not_allowed_amount: number;
        }[];
        processed_at: string;
    };
}>;
export declare const PayerConfigSchema: z.ZodObject<{
    payer_id: z.ZodString;
    name: z.ZodString;
    processing_delay_ms: z.ZodObject<{
        min: z.ZodNumber;
        max: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        min: number;
        max: number;
    }, {
        min: number;
        max: number;
    }>;
    adjudication_rules: z.ZodObject<{
        payer_percentage: z.ZodNumber;
        copay_fixed_amount: z.ZodOptional<z.ZodNumber>;
        deductible_percentage: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        payer_percentage: number;
        copay_fixed_amount?: number | undefined;
        deductible_percentage?: number | undefined;
    }, {
        payer_percentage: number;
        copay_fixed_amount?: number | undefined;
        deductible_percentage?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    payer_id: string;
    name: string;
    processing_delay_ms: {
        min: number;
        max: number;
    };
    adjudication_rules: {
        payer_percentage: number;
        copay_fixed_amount?: number | undefined;
        deductible_percentage?: number | undefined;
    };
}, {
    payer_id: string;
    name: string;
    processing_delay_ms: {
        min: number;
        max: number;
    };
    adjudication_rules: {
        payer_percentage: number;
        copay_fixed_amount?: number | undefined;
        deductible_percentage?: number | undefined;
    };
}>;
export declare const SimulatorConfigSchema: z.ZodObject<{
    ingestion_rate: z.ZodNumber;
    payers: z.ZodArray<z.ZodObject<{
        payer_id: z.ZodString;
        name: z.ZodString;
        processing_delay_ms: z.ZodObject<{
            min: z.ZodNumber;
            max: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            min: number;
            max: number;
        }, {
            min: number;
            max: number;
        }>;
        adjudication_rules: z.ZodObject<{
            payer_percentage: z.ZodNumber;
            copay_fixed_amount: z.ZodOptional<z.ZodNumber>;
            deductible_percentage: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            payer_percentage: number;
            copay_fixed_amount?: number | undefined;
            deductible_percentage?: number | undefined;
        }, {
            payer_percentage: number;
            copay_fixed_amount?: number | undefined;
            deductible_percentage?: number | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        payer_id: string;
        name: string;
        processing_delay_ms: {
            min: number;
            max: number;
        };
        adjudication_rules: {
            payer_percentage: number;
            copay_fixed_amount?: number | undefined;
            deductible_percentage?: number | undefined;
        };
    }, {
        payer_id: string;
        name: string;
        processing_delay_ms: {
            min: number;
            max: number;
        };
        adjudication_rules: {
            payer_percentage: number;
            copay_fixed_amount?: number | undefined;
            deductible_percentage?: number | undefined;
        };
    }>, "many">;
    redis: z.ZodObject<{
        host: z.ZodString;
        port: z.ZodNumber;
        password: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        host: string;
        port: number;
        password?: string | undefined;
    }, {
        host: string;
        port: number;
        password?: string | undefined;
    }>;
    postgres: z.ZodObject<{
        host: z.ZodString;
        port: z.ZodNumber;
        username: z.ZodString;
        password: z.ZodString;
        database: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        host: string;
        port: number;
        password: string;
        username: string;
        database: string;
    }, {
        host: string;
        port: number;
        password: string;
        username: string;
        database: string;
    }>;
}, "strip", z.ZodTypeAny, {
    ingestion_rate: number;
    payers: {
        payer_id: string;
        name: string;
        processing_delay_ms: {
            min: number;
            max: number;
        };
        adjudication_rules: {
            payer_percentage: number;
            copay_fixed_amount?: number | undefined;
            deductible_percentage?: number | undefined;
        };
    }[];
    redis: {
        host: string;
        port: number;
        password?: string | undefined;
    };
    postgres: {
        host: string;
        port: number;
        password: string;
        username: string;
        database: string;
    };
}, {
    ingestion_rate: number;
    payers: {
        payer_id: string;
        name: string;
        processing_delay_ms: {
            min: number;
            max: number;
        };
        adjudication_rules: {
            payer_percentage: number;
            copay_fixed_amount?: number | undefined;
            deductible_percentage?: number | undefined;
        };
    }[];
    redis: {
        host: string;
        port: number;
        password?: string | undefined;
    };
    postgres: {
        host: string;
        port: number;
        password: string;
        username: string;
        database: string;
    };
}>;
export type ServiceLine = z.infer<typeof ServiceLineSchema>;
export type PayerClaim = z.infer<typeof PayerClaimSchema>;
export type RemittanceLine = z.infer<typeof RemittanceLineSchema>;
export type RemittanceAdvice = z.infer<typeof RemittanceAdviceSchema>;
export type ClaimMessage = z.infer<typeof ClaimMessageSchema>;
export type RemittanceMessage = z.infer<typeof RemittanceMessageSchema>;
export type PayerConfig = z.infer<typeof PayerConfigSchema>;
export type SimulatorConfig = z.infer<typeof SimulatorConfigSchema>;
export declare enum ARAgingBucket {
    ZERO_TO_ONE_MIN = "0-1min",
    ONE_TO_TWO_MIN = "1-2min",
    TWO_TO_THREE_MIN = "2-3min",
    THREE_PLUS_MIN = "3+min"
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
export interface PerformanceMetrics {
    claims_ingested_total: number;
    claims_processed_total: number;
    claims_in_flight: number;
    average_processing_time_ms: number;
    throughput_claims_per_second: number;
    error_count: number;
    queue_depths: Record<string, number>;
}
//# sourceMappingURL=types.d.ts.map