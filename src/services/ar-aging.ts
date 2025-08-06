/**
 * Best-in-class Healthcare AR Aging Report System
 * Implements industry best practices for accurate, real-time aging analysis
 */

import { logger } from '../shared/logger';
import { ClaimMessage, RemittanceMessage, ARAgingBucket } from '../shared/types';

export interface ARClaimRecord {
  correlationId: string;
  claimId: string;
  payerId: string;
  patientId: string;
  submittedAt: Date;
  remittedAt?: Date;
  billedAmount: number;
  paidAmount?: number;
  patientShare?: number;
  notAllowedAmount?: number;
  isOutstanding: boolean;
}

export interface ARAgingMetrics {
  payerId: string;
  payerName: string;
  buckets: Record<ARAgingBucket, number>;
  totalClaims: number;
  totalBilledAmount: number;
  totalPaidAmount: number;
  totalOutstanding: number;
  averageAgeMinutes: number;
  oldestClaimAgeMinutes: number;
}

export interface ARAgingAlert {
  type: 'HIGH_AGING' | 'STUCK_CLAIMS' | 'PAYER_DELAY' | 'DATA_VALIDATION';
  payerId?: string;
  message: string;
  claimCount?: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: Date;
}

export class ARAgingService {
  private claims: Map<string, ARClaimRecord> = new Map(); // correlationId -> claim
  private payerClaims: Map<string, Set<string>> = new Map(); // payerId -> correlationIds
  private reportingInterval?: NodeJS.Timeout;
  private alertThresholds = {
    criticalAgeMinutes: 3, // Claims older than 3 minutes
    highVolumeThreshold: 10, // Alert if more than 10 claims in 3+ bucket
    payerDelayThreshold: 2, // Alert if payer avg > 2 minutes
  };

  constructor(private reportingIntervalSeconds: number = 5) {
    this.startReporting();
    logger.info('AR Aging service initialized with industry best practices');
  }

  /**
   * 1.1 Timestamp Accuracy: Record precise submission timestamp
   */
  recordClaimSubmission(claimMessage: ClaimMessage, payerName: string): void {
    const submittedAt = new Date();
    const billedAmount = claimMessage.claim.service_lines.reduce(
      (sum, line) => sum + line.billed_amount, 0
    );

    const record: ARClaimRecord = {
      correlationId: claimMessage.correlation_id,
      claimId: claimMessage.claim.claim_id,
      payerId: claimMessage.claim.payer_id,
      patientId: claimMessage.claim.patient_id,
      submittedAt,
      billedAmount,
      isOutstanding: true,
    };

    // Data validation
    if (!this.validateClaimData(record)) {
      this.generateAlert({
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
   * 1.1 Timestamp Accuracy: Record precise completion timestamp
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

    // Update record with completion data
    record.remittedAt = remittedAt;
    record.paidAmount = paidAmount;
    record.patientShare = patientShare;
    record.notAllowedAmount = notAllowedAmount;
    record.isOutstanding = false;

    // Data validation: amounts should reconcile
    const totalAccountedFor = paidAmount + patientShare + notAllowedAmount;
    if (Math.abs(record.billedAmount - totalAccountedFor) > 0.01) {
      this.generateAlert({
        type: 'DATA_VALIDATION',
        payerId: record.payerId,
        message: `Amount reconciliation error for claim ${record.claimId}: billed $${record.billedAmount} vs accounted $${totalAccountedFor}`,
        severity: 'MEDIUM',
        timestamp: new Date(),
      });
    }

    // Chronological validation
    if (remittedAt < record.submittedAt) {
      this.generateAlert({
        type: 'DATA_VALIDATION',
        payerId: record.payerId,
        message: `Chronological error for claim ${record.claimId}: remitted before submitted`,
        severity: 'HIGH',
        timestamp: new Date(),
      });
    }

    const ageMinutes = (remittedAt.getTime() - record.submittedAt.getTime()) / (1000 * 60);
    logger.debug(`AR: Recorded claim completion ${record.claimId} after ${ageMinutes.toFixed(2)} minutes`);

    // Check for aging alerts
    this.checkAgingAlerts(record, ageMinutes);
  }

  /**
   * 3.1 Real-Time Logic: Automated bucket assignment
   */
  private assignAgingBucket(ageMinutes: number): ARAgingBucket {
    if (ageMinutes < 1) return ARAgingBucket.ZERO_TO_ONE_MIN;
    if (ageMinutes < 2) return ARAgingBucket.ONE_TO_TWO_MIN;
    if (ageMinutes < 3) return ARAgingBucket.TWO_TO_THREE_MIN;
    return ARAgingBucket.THREE_PLUS_MIN;
  }

  /**
   * 4.1 Console Output: Generate comprehensive aging report
   */
  generateAgingReport(): ARAgingMetrics[] {
    const payerMetrics = new Map<string, ARAgingMetrics>();
    const now = new Date();

    // Initialize metrics for all payers
    for (const [payerId, correlationIds] of this.payerClaims) {
      payerMetrics.set(payerId, {
        payerId,
        payerName: this.getPayerName(payerId),
        buckets: {
          [ARAgingBucket.ZERO_TO_ONE_MIN]: 0,
          [ARAgingBucket.ONE_TO_TWO_MIN]: 0,
          [ARAgingBucket.TWO_TO_THREE_MIN]: 0,
          [ARAgingBucket.THREE_PLUS_MIN]: 0,
        },
        totalClaims: 0,
        totalBilledAmount: 0,
        totalPaidAmount: 0,
        totalOutstanding: 0,
        averageAgeMinutes: 0,
        oldestClaimAgeMinutes: 0,
      });
    }

    // Process all claims and calculate metrics
    let totalAgeMinutes = 0;
    let totalClaims = 0;

    for (const record of this.claims.values()) {
      const metrics = payerMetrics.get(record.payerId);
      if (!metrics) continue;

      // Calculate age (completed or outstanding)
      const endTime = record.remittedAt || now;
      const ageMinutes = (endTime.getTime() - record.submittedAt.getTime()) / (1000 * 60);
      const bucket = this.assignAgingBucket(ageMinutes);

      // Update metrics
      metrics.buckets[bucket]++;
      metrics.totalClaims++;
      metrics.totalBilledAmount += record.billedAmount;
      
      if (record.paidAmount !== undefined) {
        metrics.totalPaidAmount += record.paidAmount;
      }
      
      if (record.isOutstanding) {
        metrics.totalOutstanding++;
      }

      // Track ages for averages
      totalAgeMinutes += ageMinutes;
      totalClaims++;
      
      if (ageMinutes > metrics.oldestClaimAgeMinutes) {
        metrics.oldestClaimAgeMinutes = ageMinutes;
      }
    }

    // Calculate averages
    for (const metrics of payerMetrics.values()) {
      if (metrics.totalClaims > 0) {
        const payerTotalAge = Array.from(this.payerClaims.get(metrics.payerId) || [])
          .map(corrId => this.claims.get(corrId))
          .filter(record => record)
          .reduce((sum, record) => {
            const endTime = record!.remittedAt || now;
            const age = (endTime.getTime() - record!.submittedAt.getTime()) / (1000 * 60);
            return sum + age;
          }, 0);
        
        metrics.averageAgeMinutes = payerTotalAge / metrics.totalClaims;
      }
    }

    return Array.from(payerMetrics.values()).sort((a, b) => a.payerName.localeCompare(b.payerName));
  }

  /**
   * 4.1 & 4.2: Print formatted report with drill-down info
   */
  printFormattedReport(): void {
    const metrics = this.generateAgingReport();
    const now = new Date();

    console.log('\n' + '='.repeat(100));
    console.log('🏥 HEALTHCARE AR AGING REPORT - INDUSTRY BEST PRACTICES');
    console.log(`📅 Generated: ${now.toISOString()}`);
    console.log('='.repeat(100));

    // Header
    console.log('\n📊 AGING BUCKETS BY PAYER:');
    console.log('─'.repeat(100));
    console.log('| Payer                    | 0-1 min | 1-2 min | 2-3 min | 3+ min  | Total | Avg Age | Outstanding |');
    console.log('─'.repeat(100));

    let totalOutstanding = 0;
    let criticalAlerts = 0;

    for (const payer of metrics) {
      const outstanding = payer.totalOutstanding;
      totalOutstanding += outstanding;
      
      const criticalCount = payer.buckets[ARAgingBucket.THREE_PLUS_MIN];
      if (criticalCount > 0) criticalAlerts++;

      const avgAge = payer.averageAgeMinutes.toFixed(1);
      const alertFlag = criticalCount > this.alertThresholds.highVolumeThreshold ? '🚨' : 
                       criticalCount > 0 ? '⚠️' : '✅';

      console.log(
        `| ${payer.payerName.padEnd(24)} | ${String(payer.buckets[ARAgingBucket.ZERO_TO_ONE_MIN]).padStart(7)} | ${String(payer.buckets[ARAgingBucket.ONE_TO_TWO_MIN]).padStart(7)} | ${String(payer.buckets[ARAgingBucket.TWO_TO_THREE_MIN]).padStart(7)} | ${String(criticalCount).padStart(6)}${alertFlag} | ${String(payer.totalClaims).padStart(5)} | ${avgAge.padStart(7)} | ${String(outstanding).padStart(11)} |`
      );
    }
    
    console.log('─'.repeat(100));

    // Summary statistics
    const totalClaims = metrics.reduce((sum, p) => sum + p.totalClaims, 0);
    const totalBilled = metrics.reduce((sum, p) => sum + p.totalBilledAmount, 0);
    const totalPaid = metrics.reduce((sum, p) => sum + p.totalPaidAmount, 0);

    console.log('\n💰 FINANCIAL SUMMARY:');
    console.log(`Total Claims: ${totalClaims.toLocaleString()}`);
    console.log(`Total Billed: $${totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`Total Paid: $${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`Payment Rate: ${((totalPaid / totalBilled) * 100).toFixed(1)}%`);
    console.log(`Outstanding Claims: ${totalOutstanding}`);

    // Alerts section
    if (criticalAlerts > 0) {
      console.log('\n🚨 CRITICAL ALERTS:');
      for (const payer of metrics) {
        const criticalCount = payer.buckets[ARAgingBucket.THREE_PLUS_MIN];
        if (criticalCount > this.alertThresholds.highVolumeThreshold) {
          console.log(`   • ${payer.payerName}: ${criticalCount} claims in 3+ min bucket (CRITICAL)`);
        }
        if (payer.averageAgeMinutes > this.alertThresholds.payerDelayThreshold) {
          console.log(`   • ${payer.payerName}: Average age ${payer.averageAgeMinutes.toFixed(1)} min (SLOW PAYER)`);
        }
      }
    }

    console.log('\n📋 DRILL-DOWN AVAILABLE:');
    console.log('   • Use getPayerDetails(payerId) for specific payer analysis');
    console.log('   • Use getCriticalClaims() for claims needing immediate attention');
    console.log('='.repeat(100) + '\n');
  }

  /**
   * 4.2 Drill-down capabilities
   */
  getPayerDetails(payerId: string): ARClaimRecord[] {
    const correlationIds = this.payerClaims.get(payerId) || new Set();
    return Array.from(correlationIds)
      .map(id => this.claims.get(id))
      .filter(record => record) as ARClaimRecord[];
  }

  getCriticalClaims(): ARClaimRecord[] {
    const now = new Date();
    return Array.from(this.claims.values())
      .filter(record => {
        const endTime = record.remittedAt || now;
        const ageMinutes = (endTime.getTime() - record.submittedAt.getTime()) / (1000 * 60);
        return ageMinutes >= this.alertThresholds.criticalAgeMinutes;
      })
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime()); // Oldest first
  }

  /**
   * 5.1 Performance: Start automated reporting
   */
  private startReporting(): void {
    this.reportingInterval = setInterval(() => {
      this.printFormattedReport();
    }, this.reportingIntervalSeconds * 1000);
  }

  /**
   * Data validation helper
   */
  private validateClaimData(record: ARClaimRecord): boolean {
    return !!(record.claimId && record.payerId && record.submittedAt && record.billedAmount > 0);
  }

  /**
   * Alert generation and handling
   */
  private checkAgingAlerts(record: ARClaimRecord, ageMinutes: number): void {
    if (ageMinutes > this.alertThresholds.criticalAgeMinutes) {
      this.generateAlert({
        type: 'HIGH_AGING',
        payerId: record.payerId,
        message: `Claim ${record.claimId} aged ${ageMinutes.toFixed(1)} minutes`,
        severity: 'HIGH',
        timestamp: new Date(),
      });
    }
  }

  private generateAlert(alert: ARAgingAlert): void {
    logger.warn(`AR AGING ALERT [${alert.severity}]: ${alert.message}`, {
      type: alert.type,
      payerId: alert.payerId,
      claimCount: alert.claimCount,
    });
  }

  private getPayerName(payerId: string): string {
    const payerNames: Record<string, string> = {
      'AETNA_001': 'Aetna',
      'BCBS_001': 'Blue Cross Blue Shield',
      'CIGNA_001': 'Cigna',
      'HUMANA_001': 'Humana',
      'MEDICARE_001': 'Medicare',
    };
    return payerNames[payerId] || payerId;
  }

  /**
   * Get current claim state statistics for live tracking
   */
  getClaimStateStats(): {
    totalSubmitted: number;
    totalCompleted: number;
    outstanding: number;
    byPayer: Map<string, { submitted: number; completed: number; outstanding: number }>;
  } {
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
   * Cleanup and persistence
   */
  stop(): void {
    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
    }
    logger.info('AR Aging service stopped');
  }

  // 5.2 Fault-tolerance: Get claim data for persistence
  getClaimData(): ARClaimRecord[] {
    return Array.from(this.claims.values());
  }
}