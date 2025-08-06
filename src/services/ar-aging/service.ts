/**
 * AR Aging Service - Main Implementation
 * Orchestrates all AR aging functionality using modular components
 */

import { logger } from '../../shared/logger';
import { ClaimMessage, RemittanceMessage, ARAgingBucket } from '../../shared/types';
import { 
  ARClaimRecord, 
  ARAgingMetrics, 
  ARAgingThresholds,
  ARClaimStateStats 
} from './interfaces';
import { ARDataValidator } from './validation';
import { ARAlertManager } from './alerting';
import { ARReportGenerator } from './reporting';

export class ARAgingService {
  private claims: Map<string, ARClaimRecord> = new Map(); // correlationId -> claim
  private payerClaims: Map<string, Set<string>> = new Map(); // payerId -> correlationIds
  private reportingInterval?: NodeJS.Timeout;
  private alertManager: ARAlertManager;

  constructor(
    private reportingIntervalSeconds: number = 5,
    alertThresholds: Partial<ARAgingThresholds> = {}
  ) {
    const defaultThresholds: ARAgingThresholds = {
      criticalAgeMinutes: 3, // Claims older than 3 minutes
      highVolumeThreshold: 10, // Alert if more than 10 claims in 3+ bucket
      payerDelayThreshold: 2, // Alert if payer avg > 2 minutes
    };

    this.alertManager = new ARAlertManager({ ...defaultThresholds, ...alertThresholds });
    this.startReporting();
    logger.info('AR Aging service initialized with industry best practices');
  }

  /**
   * Record claim submission with precise timestamp
   */
  recordClaimSubmission(claimMessage: ClaimMessage, payerName: string): void {
    const submittedAt = new Date();
    const billedAmount = claimMessage.claim.service_lines.reduce(
      (sum, line) => sum + (line.unit_charge_amount * line.units), 0
    );

    const record: ARClaimRecord = {
      correlationId: claimMessage.correlation_id,
      claimId: claimMessage.claim.claim_id,
      payerId: claimMessage.claim.insurance.payer_id,
      patientId: `${claimMessage.claim.patient.first_name}_${claimMessage.claim.patient.last_name}`,
      submittedAt,
      billedAmount,
      isOutstanding: true,
    };

    // Data validation
    if (!ARDataValidator.validateClaimData(record)) {
      this.alertManager.generateAlert({
        type: 'DATA_VALIDATION',
        message: `Invalid claim data for ${record.claimId}`,
        severity: 'HIGH',
        timestamp: new Date(),
      });
      return;
    }

    this.claims.set(record.correlationId, record);
    
    // Index by payer for fast lookups
    if (!this.payerClaims.has(record.payerId)) {
      this.payerClaims.set(record.payerId, new Set());
    }
    this.payerClaims.get(record.payerId)!.add(record.correlationId);

    logger.debug(`AR: Recorded claim submission ${record.claimId} for ${payerName} at ${submittedAt.toISOString()}`);
  }

  /**
   * Record claim completion with precise timestamp
   */
  recordClaimCompletion(remittanceMessage: RemittanceMessage): void {
    const remittedAt = new Date();
    const record = this.claims.get(remittanceMessage.correlation_id);
    
    if (!record) {
      logger.warn(`AR: No claim record found for correlation ${remittanceMessage.correlation_id}`);
      return;
    }

    // Calculate payment amounts
    const remittance = remittanceMessage.remittance;
    const paidAmount = remittance.remittance_lines.reduce((sum, line) => sum + line.payer_paid_amount, 0);
    const patientShare = remittance.remittance_lines.reduce((sum, line) => 
      sum + line.coinsurance_amount + line.copay_amount + line.deductible_amount, 0);
    const notAllowedAmount = remittance.remittance_lines.reduce((sum, line) => sum + line.not_allowed_amount, 0);
    
    // Calculate adjudicated billed amount for validation
    const adjudicatedBilledAmount = remittance.remittance_lines.reduce((sum, line) => sum + line.billed_amount, 0); // Already calculated in remittance

    // Update record with completion data
    record.remittedAt = remittedAt;
    record.paidAmount = paidAmount;
    record.patientShare = patientShare;
    record.notAllowedAmount = notAllowedAmount;
    record.isOutstanding = false;
    
    // Calculate age for debug logging  
    const claimAgeMinutes = (remittedAt.getTime() - record.submittedAt.getTime()) / (1000 * 60);
    logger.debug(`AR: Completed claim ${record.claimId}, age: ${claimAgeMinutes.toFixed(2)} minutes`);

    // Perform data validations
    this.performCompletionValidations(record, remittedAt, adjudicatedBilledAmount, paidAmount, patientShare, notAllowedAmount);

    // Check for aging alerts
    const ageMinutes = (remittedAt.getTime() - record.submittedAt.getTime()) / (1000 * 60);
    const alerts = this.alertManager.checkAgingAlerts(record, ageMinutes);
    this.alertManager.processAlerts(alerts);

    logger.debug(`AR: Recorded claim completion ${record.claimId} after ${ageMinutes.toFixed(2)} minutes`);
  }

  private performCompletionValidations(
    record: ARClaimRecord,
    remittedAt: Date,
    adjudicatedBilledAmount: number,
    paidAmount: number,
    patientShare: number,
    notAllowedAmount: number
  ): void {
    // Amount reconciliation validation
    const reconciliationAlert = ARDataValidator.validateAmountReconciliation(
      adjudicatedBilledAmount,
      paidAmount,
      patientShare,
      notAllowedAmount,
      record.claimId,
      record.payerId
    );
    if (reconciliationAlert) {
      this.alertManager.generateAlert(reconciliationAlert);
    }
    
    // Billed amount consistency check
    ARDataValidator.validateBilledAmountConsistency(
      record.billedAmount,
      adjudicatedBilledAmount,
      record.claimId
    );

    // Chronological validation
    const chronologyAlert = ARDataValidator.validateChronology(record.submittedAt, remittedAt);
    if (chronologyAlert) {
      chronologyAlert.payerId = record.payerId;
      chronologyAlert.message = `Chronological error for claim ${record.claimId}: remitted before submitted`;
      this.alertManager.generateAlert(chronologyAlert);
    }
  }

  /**
   * Generate comprehensive aging report
   */
  generateAgingReport(): ARAgingMetrics[] {
    return ARReportGenerator.generateAgingMetrics(
      this.claims,
      this.payerClaims,
      (payerId) => this.getPayerName(payerId)
    );
  }

  /**
   * Print formatted report with drill-down info
   */
  printFormattedReport(pipelineStats?: any): void {
    const metrics = this.generateAgingReport();
    const thresholds = this.alertManager.getThresholds();
    
    ARReportGenerator.printFormattedReport(metrics, pipelineStats, {
      highVolumeThreshold: thresholds.highVolumeThreshold,
      payerDelayThreshold: thresholds.payerDelayThreshold
    });

    // Check for payer performance alerts
    this.checkPayerPerformanceAlerts(metrics);
  }

  private checkPayerPerformanceAlerts(metrics: ARAgingMetrics[]): void {
    for (const payer of metrics) {
      const criticalCount = payer.buckets[ARAgingBucket.THREE_PLUS_MIN];
      const alerts = this.alertManager.checkPayerPerformanceAlerts(
        payer.payerId,
        payer.payerName,
        payer.averageAgeMinutes,
        criticalCount
      );
      this.alertManager.processAlerts(alerts);
    }
  }

  /**
   * Get detailed information for a specific payer
   */
  getPayerDetails(payerId: string): ARClaimRecord[] {
    const correlationIds = this.payerClaims.get(payerId) || new Set();
    return Array.from(correlationIds)
      .map(id => this.claims.get(id))
      .filter(record => record) as ARClaimRecord[];
  }

  /**
   * Get claims that need immediate attention
   */
  getCriticalClaims(): ARClaimRecord[] {
    const now = new Date();
    const thresholds = this.alertManager.getThresholds();
    
    return Array.from(this.claims.values())
      .filter(record => {
        const endTime = record.remittedAt || now;
        const ageMinutes = (endTime.getTime() - record.submittedAt.getTime()) / (1000 * 60);
        return ageMinutes >= thresholds.criticalAgeMinutes;
      })
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime()); // Oldest first
  }

  /**
   * Get current claim state statistics for live tracking
   */
  getClaimStateStats(): ARClaimStateStats {
    const totalSubmitted = this.claims.size;
    let totalCompleted = 0;
    const byPayer = new Map<string, { submitted: number; completed: number; outstanding: number }>();

    // Count claims by payer and status
    for (const claim of this.claims.values()) {
      const payerName = this.getPayerName(claim.payerId);
      const payerStats = byPayer.get(payerName) || { submitted: 0, completed: 0, outstanding: 0 };
      
      payerStats.submitted++;
      
      if (!claim.isOutstanding) {
        payerStats.completed++;
        totalCompleted++;
      } else {
        payerStats.outstanding++;
      }
      
      byPayer.set(payerName, payerStats);
    }

    return {
      totalSubmitted,
      totalCompleted,
      outstanding: totalSubmitted - totalCompleted,
      byPayer
    };
  }

  /**
   * Start automated reporting
   */
  private startReporting(): void {
    this.reportingInterval = setInterval(() => {
      this.printFormattedReport();
    }, this.reportingIntervalSeconds * 1000);
  }

  /**
   * Stop the service and cleanup
   */
  stop(): void {
    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
    }
    logger.info('AR Aging service stopped');
  }

  /**
   * Get claim data for persistence
   */
  getClaimData(): ARClaimRecord[] {
    return Array.from(this.claims.values());
  }

  /**
   * Get payer display name
   */
  private getPayerName(payerId: string): string {
    const payerNames: Record<string, string> = {
      'anthem': 'Anthem',
      'united_health_group': 'United Health Group',
      'medicare': 'Medicare',
    };
    return payerNames[payerId] || payerId;
  }

  /**
   * Update alert thresholds
   */
  updateAlertThresholds(thresholds: Partial<ARAgingThresholds>): void {
    this.alertManager.updateThresholds(thresholds);
  }

  /**
   * Get current alert thresholds
   */
  getAlertThresholds(): ARAgingThresholds {
    return this.alertManager.getThresholds();
  }
}