import { Pool } from 'pg';
import {
  type RemittanceAdvice,
  type ARAgingReport,
  type PatientCostShare,
  ARAgingBucket,
  getARAgingBucket,
  calculateAge,
  createServiceLogger,
  formatCurrency,
} from '@billing-simulator/shared';

const logger = createServiceLogger('statistics-service');

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  maxConnections?: number;
}

export interface ProcessedClaim {
  correlation_id: string;
  claim_id: string;
  patient_id: string;
  payer_id: string;
  ingested_at: string;
  processed_at: string;
  processing_time_ms: number;
  remittance_data: RemittanceAdvice;
}

export class StatisticsService {
  private pool: Pool;
  private reportInterval: NodeJS.Timeout | null = null;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      max: config.maxConnections || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Create table for processed claims
      await client.query(`
        CREATE TABLE IF NOT EXISTS processed_claims (
          correlation_id VARCHAR(255) PRIMARY KEY,
          claim_id VARCHAR(255) NOT NULL,
          patient_id VARCHAR(255) NOT NULL,
          payer_id VARCHAR(255) NOT NULL,
          ingested_at TIMESTAMPTZ NOT NULL,
          processed_at TIMESTAMPTZ NOT NULL,
          processing_time_ms INTEGER NOT NULL,
          remittance_data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Create indexes for efficient queries
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_processed_claims_payer_id 
        ON processed_claims(payer_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_processed_claims_patient_id 
        ON processed_claims(patient_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_processed_claims_processed_at 
        ON processed_claims(processed_at)
      `);

      // Create table for A/R aging snapshots
      await client.query(`
        CREATE TABLE IF NOT EXISTS ar_aging_snapshots (
          id SERIAL PRIMARY KEY,
          payer_id VARCHAR(255) NOT NULL,
          snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          bucket_0_1_min INTEGER NOT NULL DEFAULT 0,
          bucket_1_2_min INTEGER NOT NULL DEFAULT 0,
          bucket_2_3_min INTEGER NOT NULL DEFAULT 0,
          bucket_3_plus_min INTEGER NOT NULL DEFAULT 0,
          total_claims INTEGER NOT NULL DEFAULT 0,
          average_age_seconds FLOAT NOT NULL DEFAULT 0
        )
      `);

      // Create table for patient cost share snapshots
      await client.query(`
        CREATE TABLE IF NOT EXISTS patient_cost_share_snapshots (
          id SERIAL PRIMARY KEY,
          patient_id VARCHAR(255) NOT NULL,
          snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          total_copay DECIMAL(10,2) NOT NULL DEFAULT 0,
          total_coinsurance DECIMAL(10,2) NOT NULL DEFAULT 0,
          total_deductible DECIMAL(10,2) NOT NULL DEFAULT 0,
          claim_count INTEGER NOT NULL DEFAULT 0
        )
      `);

      logger.info('Statistics database schema initialized');
    } finally {
      client.release();
    }
  }

  async recordProcessedClaim(
    correlationId: string,
    claimId: string,
    patientId: string,
    payerId: string,
    ingestedAt: string,
    remittance: RemittanceAdvice
  ): Promise<void> {
    const processedAt = remittance.processed_at;
    const processingTimeMs = calculateAge(ingestedAt, processedAt);

    const processedClaim: ProcessedClaim = {
      correlation_id: correlationId,
      claim_id: claimId,
      patient_id: patientId,
      payer_id: payerId,
      ingested_at: ingestedAt,
      processed_at: processedAt,
      processing_time_ms: processingTimeMs,
      remittance_data: remittance,
    };

    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO processed_claims 
         (correlation_id, claim_id, patient_id, payer_id, ingested_at, processed_at, processing_time_ms, remittance_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (correlation_id) DO NOTHING`,
        [
          processedClaim.correlation_id,
          processedClaim.claim_id,
          processedClaim.patient_id,
          processedClaim.payer_id,
          processedClaim.ingested_at,
          processedClaim.processed_at,
          processedClaim.processing_time_ms,
          JSON.stringify(processedClaim.remittance_data),
        ]
      );

      logger.debug(`Recorded processed claim ${claimId} with processing time ${processingTimeMs}ms`);
    } finally {
      client.release();
    }
  }

  async generateARAgingReport(): Promise<ARAgingReport[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          payer_id,
          processing_time_ms,
          COUNT(*) as claim_count
        FROM processed_claims 
        WHERE processed_at > NOW() - INTERVAL '1 hour'  -- Only recent claims
        GROUP BY payer_id, processing_time_ms
        ORDER BY payer_id
      `);

      const reportMap = new Map<string, ARAgingReport>();

      result.rows.forEach(row => {
        const payerId = row.payer_id;
        const processingTimeMs = parseInt(row.processing_time_ms);
        const claimCount = parseInt(row.claim_count);
        
        if (!reportMap.has(payerId)) {
          reportMap.set(payerId, {
            payer_id: payerId,
            buckets: {
              [ARAgingBucket.ZERO_TO_ONE_MIN]: 0,
              [ARAgingBucket.ONE_TO_TWO_MIN]: 0,
              [ARAgingBucket.TWO_TO_THREE_MIN]: 0,
              [ARAgingBucket.THREE_PLUS_MIN]: 0,
            },
            total_claims: 0,
            average_age_seconds: 0,
          });
        }

        const report = reportMap.get(payerId)!;
        const bucket = getARAgingBucket(processingTimeMs);
        
        report.buckets[bucket] += claimCount;
        report.total_claims += claimCount;
        report.average_age_seconds += (processingTimeMs / 1000) * claimCount;
      });

      // Calculate average age
      reportMap.forEach(report => {
        if (report.total_claims > 0) {
          report.average_age_seconds = report.average_age_seconds / report.total_claims;
        }
      });

      return Array.from(reportMap.values());
    } finally {
      client.release();
    }
  }

  async generatePatientCostShareReport(): Promise<PatientCostShare[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          patient_id,
          SUM((remittance_data->'remittance_lines'->0->>'copay_amount')::DECIMAL) as total_copay,
          SUM((remittance_data->'remittance_lines'->0->>'coinsurance_amount')::DECIMAL) as total_coinsurance,
          SUM((remittance_data->'remittance_lines'->0->>'deductible_amount')::DECIMAL) as total_deductible,
          COUNT(*) as claim_count
        FROM processed_claims
        WHERE processed_at > NOW() - INTERVAL '1 hour'  -- Only recent claims
        GROUP BY patient_id
        ORDER BY patient_id
      `);

      return result.rows.map(row => ({
        patient_id: row.patient_id,
        total_copay: parseFloat(row.total_copay || '0'),
        total_coinsurance: parseFloat(row.total_coinsurance || '0'),
        total_deductible: parseFloat(row.total_deductible || '0'),
        claim_count: parseInt(row.claim_count),
      }));
    } finally {
      client.release();
    }
  }

  startPeriodicReporting(intervalSeconds: number = 5): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
    }

    this.reportInterval = setInterval(async () => {
      try {
        await this.printStatistics();
      } catch (error) {
        logger.error(`Error generating periodic report: ${error instanceof Error ? error.message : error}`);
      }
    }, intervalSeconds * 1000);

    logger.info(`Started periodic reporting every ${intervalSeconds} seconds`);
  }

  stopPeriodicReporting(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
      logger.info('Stopped periodic reporting');
    }
  }

  async printStatistics(): Promise<void> {
    console.log('\n' + '='.repeat(80));
    console.log('BILLING SIMULATOR STATISTICS REPORT');
    console.log('Generated at:', new Date().toISOString());
    console.log('='.repeat(80));

    // A/R Aging Report
    console.log('\nA/R AGING REPORT BY PAYER:');
    console.log('-'.repeat(80));
    
    const arReports = await this.generateARAgingReport();
    
    if (arReports.length === 0) {
      console.log('No claims processed yet.');
    } else {
      console.log(sprintf('%-15s %8s %8s %8s %8s %8s %10s', 
        'Payer ID', '0-1 min', '1-2 min', '2-3 min', '3+ min', 'Total', 'Avg Age'));
      console.log('-'.repeat(80));
      
      for (const report of arReports) {
        console.log(sprintf('%-15s %8d %8d %8d %8d %8d %10.1fs',
          report.payer_id,
          report.buckets[ARAgingBucket.ZERO_TO_ONE_MIN],
          report.buckets[ARAgingBucket.ONE_TO_TWO_MIN],
          report.buckets[ARAgingBucket.TWO_TO_THREE_MIN],
          report.buckets[ARAgingBucket.THREE_PLUS_MIN],
          report.total_claims,
          report.average_age_seconds
        ));
      }
    }

    // Patient Cost Share Report
    console.log('\nPER-PATIENT COST-SHARE SUMMARY:');
    console.log('-'.repeat(80));
    
    const costShareReports = await this.generatePatientCostShareReport();
    
    if (costShareReports.length === 0) {
      console.log('No patient cost-sharing data available yet.');
    } else {
      console.log(sprintf('%-15s %12s %15s %12s %8s', 
        'Patient ID', 'Copay', 'Coinsurance', 'Deductible', 'Claims'));
      console.log('-'.repeat(80));
      
      for (const report of costShareReports.slice(0, 20)) { // Show first 20 patients
        console.log(sprintf('%-15s %12s %15s %12s %8d',
          report.patient_id,
          formatCurrency(report.total_copay),
          formatCurrency(report.total_coinsurance),
          formatCurrency(report.total_deductible),
          report.claim_count
        ));
      }
      
      if (costShareReports.length > 20) {
        console.log(`... and ${costShareReports.length - 20} more patients`);
      }
    }

    console.log('='.repeat(80) + '\n');
  }

  async getOverallStats() {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as total_claims,
          COUNT(DISTINCT payer_id) as unique_payers,
          COUNT(DISTINCT patient_id) as unique_patients,
          AVG(processing_time_ms) as avg_processing_time_ms,
          MIN(processing_time_ms) as min_processing_time_ms,
          MAX(processing_time_ms) as max_processing_time_ms
        FROM processed_claims
        WHERE processed_at > NOW() - INTERVAL '1 hour'
      `);

      return {
        total_claims: parseInt(result.rows[0].total_claims),
        unique_payers: parseInt(result.rows[0].unique_payers),
        unique_patients: parseInt(result.rows[0].unique_patients),
        avg_processing_time_ms: parseFloat(result.rows[0].avg_processing_time_ms || '0'),
        min_processing_time_ms: parseInt(result.rows[0].min_processing_time_ms || '0'),
        max_processing_time_ms: parseInt(result.rows[0].max_processing_time_ms || '0'),
      };
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    this.stopPeriodicReporting();
    await this.pool.end();
    logger.info('Statistics service database connection pool closed');
  }
}

// Simple sprintf implementation for table formatting
function sprintf(format: string, ...args: any[]): string {
  let i = 0;
  return format.replace(/%[-+]?(\d+)?(?:\.(\d+))?[sd]/g, (match, width, precision) => {
    const value = args[i++];
    const isString = match.endsWith('s');
    
    let str = isString ? String(value) : Number(value).toFixed(precision ? parseInt(precision) : (match.includes('.') ? 1 : 0));
    
    if (width) {
      const w = parseInt(width);
      if (match.includes('-')) {
        str = str.padEnd(w);
      } else {
        str = str.padStart(w);
      }
    }
    
    return str;
  });
}