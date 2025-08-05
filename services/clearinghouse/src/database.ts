import { Pool, PoolClient } from 'pg';
import { createServiceLogger } from '@billing-simulator/shared';

const logger = createServiceLogger('clearinghouse-db');

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  maxConnections?: number;
}

export interface InFlightClaim {
  correlation_id: string;
  claim_id: string;
  payer_id: string;
  ingested_at: string;
  submitted_at: string;
  claim_data: any; // JSON blob
}

export class ClearinghouseDatabase {
  private pool: Pool;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      max: config.maxConnections || 20,
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
      // Create table for tracking in-flight claims
      await client.query(`
        CREATE TABLE IF NOT EXISTS in_flight_claims (
          correlation_id VARCHAR(255) PRIMARY KEY,
          claim_id VARCHAR(255) NOT NULL,
          payer_id VARCHAR(255) NOT NULL,
          ingested_at TIMESTAMPTZ NOT NULL,
          submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          claim_data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Create index for efficient lookups
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_in_flight_claims_payer_id 
        ON in_flight_claims(payer_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_in_flight_claims_submitted_at 
        ON in_flight_claims(submitted_at)
      `);

      // Create table for tracking payer configurations
      await client.query(`
        CREATE TABLE IF NOT EXISTS payer_configs (
          payer_id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          endpoint VARCHAR(255),
          config JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      logger.info('Database schema initialized');
    } finally {
      client.release();
    }
  }

  async storeClaim(inFlightClaim: InFlightClaim): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO in_flight_claims 
         (correlation_id, claim_id, payer_id, ingested_at, submitted_at, claim_data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          inFlightClaim.correlation_id,
          inFlightClaim.claim_id,
          inFlightClaim.payer_id,
          inFlightClaim.ingested_at,
          inFlightClaim.submitted_at,
          JSON.stringify(inFlightClaim.claim_data),
        ]
      );
    } finally {
      client.release();
    }
  }

  async getClaim(correlationId: string): Promise<InFlightClaim | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM in_flight_claims WHERE correlation_id = $1',
        [correlationId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        correlation_id: row.correlation_id,
        claim_id: row.claim_id,
        payer_id: row.payer_id,
        ingested_at: row.ingested_at.toISOString(),
        submitted_at: row.submitted_at.toISOString(),
        claim_data: row.claim_data,
      };
    } finally {
      client.release();
    }
  }

  async removeClaim(correlationId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'DELETE FROM in_flight_claims WHERE correlation_id = $1',
        [correlationId]
      );
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  async getInFlightStats(): Promise<{ total: number; byPayer: Record<string, number> }> {
    const client = await this.pool.connect();
    try {
      const totalResult = await client.query(
        'SELECT COUNT(*) as total FROM in_flight_claims'
      );

      const byPayerResult = await client.query(`
        SELECT payer_id, COUNT(*) as count 
        FROM in_flight_claims 
        GROUP BY payer_id
      `);

      const byPayer: Record<string, number> = {};
      byPayerResult.rows.forEach(row => {
        byPayer[row.payer_id] = parseInt(row.count);
      });

      return {
        total: parseInt(totalResult.rows[0].total),
        byPayer,
      };
    } finally {
      client.release();
    }
  }

  async getOldClaims(olderThanMinutes: number): Promise<InFlightClaim[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM in_flight_claims 
         WHERE submitted_at < NOW() - INTERVAL '${olderThanMinutes} minutes'
         ORDER BY submitted_at ASC`,
      );

      return result.rows.map(row => ({
        correlation_id: row.correlation_id,
        claim_id: row.claim_id,
        payer_id: row.payer_id,
        ingested_at: row.ingested_at.toISOString(),
        submitted_at: row.submitted_at.toISOString(),
        claim_data: row.claim_data,
      }));
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }
}