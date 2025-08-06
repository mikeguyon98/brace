/**
 * PostgreSQL-based claim storage service
 * Handles all database operations for storing and retrieving processed claims
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../../shared/logger';
import { ClaimMessage, PayerClaim } from '../../shared/types';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  max?: number; // max connections in pool
}

export interface ClaimRecord {
  id?: number;
  claim_id: string;
  correlation_id: string;
  original_claim: any;
  status: 'received' | 'ingested' | 'routed' | 'adjudicated' | 'billed';
  created_at?: Date;
  ingested_at?: Date;
  routed_at?: Date;
  adjudicated_at?: Date;
  billed_at?: Date;
  payer_id?: string;
  payer_name?: string;
  total_amount?: number;
  paid_amount?: number;
  patient_responsibility?: number;
  adjudication_status?: 'paid' | 'denied' | 'partial';
  denial_reason?: string;
  denial_code?: string;
  processing_time_ms?: number;
  retry_count?: number;
  error_message?: string;
}

export interface ProcessingStats {
  total_claims: number;
  received_claims: number;
  ingested_claims: number;
  routed_claims: number;
  adjudicated_claims: number;
  completed_claims: number;
  paid_claims: number;
  denied_claims: number;
  total_billed_amount: number;
  total_paid_amount: number;
  total_patient_responsibility: number;
  avg_processing_time_ms: number;
  unique_payers: number;
  first_claim_time?: Date;
  last_processed_time?: Date;
}

export interface PayerStats {
  payer_id: string;
  payer_name: string;
  total_claims: number;
  paid_claims: number;
  denied_claims: number;
  total_amount: number;
  paid_amount: number;
  patient_responsibility: number;
  payment_rate_percent: number;
  avg_processing_time_ms: number;
}

export interface AgingStats {
  payer_id: string;
  payer_name: string;
  bucket_0_1_min: number;
  bucket_1_2_min: number;
  bucket_2_3_min: number;
  bucket_3_plus_min: number;
  outstanding_claims: number;
  avg_age_minutes: number;
  oldest_claim_minutes: number;
  total_billed_amount: number;
  total_paid_amount: number;
  outstanding_amount: number;
}

export class ClaimStore {
  private pool: Pool;
  private isConnected = false;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      max: config.max || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });
  }

  /**
   * Initialize the database connection and ensure schema exists
   */
  async initialize(): Promise<void> {
    try {
      const client = await this.pool.connect();
      
      // Test the connection
      const result = await client.query('SELECT NOW()');
      logger.info(`Connected to PostgreSQL at ${result.rows[0].now}`);
      
      client.release();
      this.isConnected = true;
      
      logger.info('Database connection initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database connection:', error);
      throw error;
    }
  }

  /**
   * Store a new claim when it's first received
   */
  async storeNewClaim(claimMessage: ClaimMessage): Promise<void> {
    const client = await this.pool.connect();
    try {
      const claim = claimMessage.claim;
      
      // Calculate total amount from service lines
      const totalAmount = claim.service_lines.reduce(
        (sum, line) => sum + (line.unit_charge_amount * line.units), 
        0
      );

      await client.query(
        `INSERT INTO claims (
          claim_id, correlation_id, original_claim, status, 
          created_at, total_amount
        ) VALUES ($1, $2, $3, $4, NOW(), $5)
        ON CONFLICT (claim_id) DO NOTHING`,
        [
          claim.claim_id,
          claimMessage.correlation_id,
          JSON.stringify(claim),
          'received',
          totalAmount
        ]
      );

      logger.debug(`Stored new claim: ${claim.claim_id}`);
    } catch (error) {
      logger.error(`Error storing new claim ${claimMessage.claim.claim_id}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update claim status when it's ingested
   */
  async markClaimIngested(claimId: string): Promise<void> {
    await this.updateClaimStatus(claimId, 'ingested', { ingested_at: new Date() });
  }

  /**
   * Update claim when it's routed to a payer
   */
  async markClaimRouted(claimId: string, payerId: string, payerName: string): Promise<void> {
    await this.updateClaimStatus(claimId, 'routed', {
      routed_at: new Date(),
      payer_id: payerId,
      payer_name: payerName
    });
  }

  /**
   * Update claim with adjudication results
   */
  async markClaimAdjudicated(
    claimId: string, 
    adjudicationResult: {
      status: 'paid' | 'denied' | 'partial';
      paidAmount: number;
      patientResponsibility: number;
      denialReason?: string;
      denialCode?: string;
      processingTimeMs: number;
    }
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE claims SET 
          status = $1,
          adjudicated_at = NOW(),
          adjudication_status = $2,
          paid_amount = $3,
          patient_responsibility = $4,
          denial_reason = $5,
          denial_code = $6,
          processing_time_ms = $7
        WHERE claim_id = $8`,
        [
          'adjudicated',
          adjudicationResult.status,
          adjudicationResult.paidAmount,
          adjudicationResult.patientResponsibility,
          adjudicationResult.denialReason,
          adjudicationResult.denialCode,
          adjudicationResult.processingTimeMs,
          claimId
        ]
      );

      logger.debug(`Marked claim adjudicated: ${claimId}, status: ${adjudicationResult.status}`);
    } catch (error) {
      logger.error(`Error marking claim adjudicated ${claimId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Mark claim as fully processed (billed)
   */
  async markClaimBilled(claimId: string): Promise<void> {
    await this.updateClaimStatus(claimId, 'billed', { billed_at: new Date() });
  }

  /**
   * Generic method to update claim status
   */
  private async updateClaimStatus(
    claimId: string, 
    status: string, 
    additionalFields: Record<string, any> = {}
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const fieldNames = Object.keys(additionalFields);
      const fieldValues = Object.values(additionalFields);
      
      let query = `UPDATE claims SET status = $1`;
      const values = [status];
      
      fieldNames.forEach((field, index) => {
        query += `, ${field} = $${index + 2}`;
        values.push(fieldValues[index]);
      });
      
      query += ` WHERE claim_id = $${values.length + 1}`;
      values.push(claimId);

      await client.query(query, values);
      
      logger.debug(`Updated claim ${claimId} status to ${status}`);
    } catch (error) {
      logger.error(`Error updating claim status ${claimId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get overall processing statistics
   */
  async getProcessingStats(): Promise<ProcessingStats> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM processing_stats');
      return result.rows[0] || {
        total_claims: 0,
        received_claims: 0,
        ingested_claims: 0,
        routed_claims: 0,
        adjudicated_claims: 0,
        completed_claims: 0,
        paid_claims: 0,
        denied_claims: 0,
        total_billed_amount: 0,
        total_paid_amount: 0,
        total_patient_responsibility: 0,
        avg_processing_time_ms: 0,
        unique_payers: 0
      };
    } catch (error) {
      logger.error('Error getting processing stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get payer-specific statistics
   */
  async getPayerStats(): Promise<PayerStats[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM payer_stats');
      return result.rows;
    } catch (error) {
      logger.error('Error getting payer stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get AR aging statistics for all payers
   */
  async getAgingStats(): Promise<AgingStats[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM aging_stats');
      return result.rows;
    } catch (error) {
      logger.error('Error getting aging stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get recent activity for monitoring
   */
  async getRecentActivity(limit: number = 50): Promise<ClaimRecord[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM recent_activity LIMIT $1',
        [limit]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting recent activity:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get claims by status for monitoring
   */
  async getClaimsByStatus(status?: string): Promise<ClaimRecord[]> {
    const client = await this.pool.connect();
    try {
      let query = 'SELECT * FROM claims';
      const values: any[] = [];
      
      if (status) {
        query += ' WHERE status = $1';
        values.push(status);
      }
      
      query += ' ORDER BY created_at DESC LIMIT 100';
      
      const result = await client.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error getting claims by status:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.isConnected = false;
    logger.info('Database connection closed');
  }

  /**
   * Check if database is connected
   */
  isReady(): boolean {
    return this.isConnected;
  }
}