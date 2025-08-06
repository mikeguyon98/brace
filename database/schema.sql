-- PostgreSQL Schema for Billing Simulator
-- This schema stores all processed claims and their statuses in a single database

-- Create database (run this manually)
-- CREATE DATABASE billing_simulator;

-- Claims table - stores all claims and their processing status
CREATE TABLE IF NOT EXISTS claims (
    id SERIAL PRIMARY KEY,
    claim_id VARCHAR(255) UNIQUE NOT NULL,
    correlation_id VARCHAR(255) NOT NULL,
    
    -- Original claim data (JSON)
    original_claim JSONB NOT NULL,
    
    -- Processing status and timeline
    status VARCHAR(50) NOT NULL DEFAULT 'received', -- received, ingested, routed, adjudicated, billed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ingested_at TIMESTAMP WITH TIME ZONE,
    routed_at TIMESTAMP WITH TIME ZONE,
    adjudicated_at TIMESTAMP WITH TIME ZONE,
    billed_at TIMESTAMP WITH TIME ZONE,
    
    -- Payer information
    payer_id VARCHAR(100),
    payer_name VARCHAR(255),
    
    -- Financial information
    total_amount DECIMAL(10,2),
    paid_amount DECIMAL(10,2),
    patient_responsibility DECIMAL(10,2),
    
    -- Adjudication results
    adjudication_status VARCHAR(50), -- paid, denied, partial
    denial_reason TEXT,
    denial_code VARCHAR(50),
    
    -- Processing metadata
    processing_time_ms INTEGER,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims (status);
CREATE INDEX IF NOT EXISTS idx_claims_payer_id ON claims (payer_id);
CREATE INDEX IF NOT EXISTS idx_claims_created_at ON claims (created_at);
CREATE INDEX IF NOT EXISTS idx_claims_claim_id ON claims (claim_id);
CREATE INDEX IF NOT EXISTS idx_claims_correlation_id ON claims (correlation_id);

-- Processing stats view for dashboard
CREATE OR REPLACE VIEW processing_stats AS
SELECT 
    COUNT(*) as total_claims,
    COUNT(*) FILTER (WHERE status = 'received') as received_claims,
    COUNT(*) FILTER (WHERE status = 'ingested') as ingested_claims,
    COUNT(*) FILTER (WHERE status = 'routed') as routed_claims,
    COUNT(*) FILTER (WHERE status = 'adjudicated') as adjudicated_claims,
    COUNT(*) FILTER (WHERE status = 'billed') as completed_claims,
    COUNT(*) FILTER (WHERE adjudication_status = 'paid') as paid_claims,
    COUNT(*) FILTER (WHERE adjudication_status = 'denied') as denied_claims,
    COALESCE(SUM(total_amount), 0) as total_billed_amount,
    COALESCE(SUM(paid_amount), 0) as total_paid_amount,
    COALESCE(SUM(patient_responsibility), 0) as total_patient_responsibility,
    ROUND(AVG(processing_time_ms)) as avg_processing_time_ms,
    COUNT(DISTINCT payer_id) as unique_payers,
    MIN(created_at) as first_claim_time,
    MAX(billed_at) as last_processed_time
FROM claims;

-- Payer breakdown view
CREATE OR REPLACE VIEW payer_stats AS
SELECT 
    payer_id,
    payer_name,
    COUNT(*) as total_claims,
    COUNT(*) FILTER (WHERE adjudication_status = 'paid') as paid_claims,
    COUNT(*) FILTER (WHERE adjudication_status = 'denied') as denied_claims,
    COALESCE(SUM(total_amount), 0) as total_amount,
    COALESCE(SUM(paid_amount), 0) as paid_amount,
    COALESCE(SUM(patient_responsibility), 0) as patient_responsibility,
    CASE 
        WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE adjudication_status = 'paid') * 100.0 / COUNT(*)), 2)
        ELSE 0 
    END as payment_rate_percent,
    ROUND(AVG(processing_time_ms)) as avg_processing_time_ms
FROM claims 
WHERE payer_id IS NOT NULL
GROUP BY payer_id, payer_name
ORDER BY total_claims DESC;

-- Recent activity view for real-time monitoring
CREATE OR REPLACE VIEW recent_activity AS
SELECT 
    claim_id,
    status,
    payer_name,
    adjudication_status,
    total_amount,
    paid_amount,
    processing_time_ms,
    created_at,
    billed_at
FROM claims 
ORDER BY COALESCE(billed_at, adjudicated_at, routed_at, ingested_at, created_at) DESC
LIMIT 100;

-- Processing throughput view (claims per minute)
CREATE OR REPLACE VIEW throughput_stats AS
SELECT 
    date_trunc('minute', created_at) as minute,
    COUNT(*) as claims_received,
    COUNT(*) FILTER (WHERE status = 'billed') as claims_completed,
    COALESCE(SUM(total_amount), 0) as amount_processed
FROM claims 
WHERE created_at >= NOW() - INTERVAL '1 hour'
GROUP BY date_trunc('minute', created_at)
ORDER BY minute DESC;

-- AR Aging stats view for industry standard aging buckets
CREATE OR REPLACE VIEW aging_stats AS
SELECT 
    payer_id,
    payer_name,
    -- Calculate age in minutes from creation to now (or completion)
    -- Using industry standard aging buckets: 0-1min, 1-2min, 2-3min, 3+min
    COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (COALESCE(billed_at, NOW()) - created_at))/60 < 1
    ) as bucket_0_1_min,
    COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (COALESCE(billed_at, NOW()) - created_at))/60 >= 1 
        AND EXTRACT(EPOCH FROM (COALESCE(billed_at, NOW()) - created_at))/60 < 2
    ) as bucket_1_2_min,
    COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (COALESCE(billed_at, NOW()) - created_at))/60 >= 2 
        AND EXTRACT(EPOCH FROM (COALESCE(billed_at, NOW()) - created_at))/60 < 3
    ) as bucket_2_3_min,
    COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (COALESCE(billed_at, NOW()) - created_at))/60 >= 3
    ) as bucket_3_plus_min,
    -- Outstanding claims (not yet billed)
    COUNT(*) FILTER (WHERE status != 'billed') as outstanding_claims,
    -- Average age for all claims
    ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(billed_at, NOW()) - created_at))/60), 2) as avg_age_minutes,
    -- Oldest claim age
    ROUND(MAX(EXTRACT(EPOCH FROM (COALESCE(billed_at, NOW()) - created_at))/60), 2) as oldest_claim_minutes,
    -- Financial summary
    COALESCE(SUM(total_amount), 0) as total_billed_amount,
    COALESCE(SUM(paid_amount), 0) as total_paid_amount,
    COALESCE(SUM(total_amount) - SUM(COALESCE(paid_amount, 0)), 0) as outstanding_amount
FROM claims 
WHERE payer_id IS NOT NULL
GROUP BY payer_id, payer_name
ORDER BY outstanding_claims DESC, avg_age_minutes DESC;

-- Grant permissions (adjust as needed)
-- GRANT ALL PRIVILEGES ON TABLE claims TO billing_simulator_user;
-- GRANT SELECT ON processing_stats, payer_stats, recent_activity, throughput_stats TO billing_simulator_user;