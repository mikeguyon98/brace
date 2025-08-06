/**
 * AR Aging Reporting System
 * Handles report generation, formatting, and output
 */

import { ARAgingBucket } from '../../shared/types';
import { ARAgingMetrics, ARClaimRecord } from './interfaces';

export class ARReportGenerator {
  /**
   * Assign aging bucket based on age in minutes
   */
  static assignAgingBucket(ageMinutes: number): ARAgingBucket {
    if (ageMinutes < 1) return ARAgingBucket.ZERO_TO_ONE_MIN;
    if (ageMinutes < 2) return ARAgingBucket.ONE_TO_TWO_MIN;
    if (ageMinutes < 3) return ARAgingBucket.TWO_TO_THREE_MIN;
    return ARAgingBucket.THREE_PLUS_MIN;
  }

  /**
   * Generate comprehensive aging metrics for all payers
   */
  static generateAgingMetrics(
    claims: Map<string, ARClaimRecord>,
    payerClaims: Map<string, Set<string>>,
    getPayerName: (payerId: string) => string
  ): ARAgingMetrics[] {
    const payerMetrics = new Map<string, ARAgingMetrics>();
    const now = new Date();

    // Initialize metrics for all payers
    for (const [payerId, correlationIds] of payerClaims) {
      payerMetrics.set(payerId, {
        payerId,
        payerName: getPayerName(payerId),
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
    for (const record of claims.values()) {
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
      
      if (ageMinutes > metrics.oldestClaimAgeMinutes) {
        metrics.oldestClaimAgeMinutes = ageMinutes;
      }
    }

    // Calculate averages
    for (const metrics of payerMetrics.values()) {
      if (metrics.totalClaims > 0) {
        const payerTotalAge = Array.from(payerClaims.get(metrics.payerId) || [])
          .map(corrId => claims.get(corrId))
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
   * Print formatted aging report with industry best practices
   */
  static printFormattedReport(
    metrics: ARAgingMetrics[],
    pipelineStats?: any,
    alertThresholds?: { highVolumeThreshold: number; payerDelayThreshold: number }
  ): void {
    const now = new Date();

    console.log('\n' + '='.repeat(100));
    console.log('🏥 HEALTHCARE AR AGING REPORT - INDUSTRY BEST PRACTICES');
    console.log(`📅 Generated: ${now.toISOString()}`);
    console.log('='.repeat(100));
    
    // Show pipeline status if provided
    if (pipelineStats) {
      this.printPipelineStatus(pipelineStats);
    }

    // Print aging buckets table
    this.printAgingBucketsTable(metrics, alertThresholds);

    // Print financial summary
    this.printFinancialSummary(metrics);

    // Print critical alerts
    this.printCriticalAlerts(metrics, alertThresholds);

    console.log('\n📋 DRILL-DOWN AVAILABLE:');
    console.log('   • Use getPayerDetails(payerId) for specific payer analysis');
    console.log('   • Use getCriticalClaims() for claims needing immediate attention');
    console.log('='.repeat(100) + '\n');
  }

  private static printPipelineStatus(pipelineStats: any): void {
    console.log('\n🔄 PIPELINE STATUS:');
    console.log('─'.repeat(80));
    console.log(`| Step | Description                               | Count | Status     |`);
    console.log('─'.repeat(80));
    console.log(`| 1️⃣   | Claims Being Ingested                     | ${String(pipelineStats.step1_being_ingested).padStart(5)} | ${pipelineStats.step1_being_ingested === 0 ? '✅ Complete' : '🔄 Processing'} |`);
    console.log(`| 2️⃣   | Claims in Clearinghouse Queue             | ${String(pipelineStats.step2_in_clearinghouse_queue).padStart(5)} | ${pipelineStats.step2_in_clearinghouse_queue === 0 ? '✅ Complete' : '🔄 Processing'} |`);
    console.log(`| 3️⃣   | Claims with Payers (Being Adjudicated)    | ${String(pipelineStats.step3_with_payers).padStart(5)} | ${pipelineStats.step3_with_payers === 0 ? '✅ Complete' : '🔄 Processing'} |`);
    console.log(`| 4️⃣   | Remittances in Billing Queue              | ${String(pipelineStats.step4_remittances_in_billing_queue).padStart(5)} | ${pipelineStats.step4_remittances_in_billing_queue === 0 ? '✅ Complete' : '🔄 Processing'} |`);
    console.log(`| 5️⃣   | Claims Fully Complete                      | ${String(pipelineStats.step5_fully_complete).padStart(5)} | ✅ Done     |`);
    console.log('─'.repeat(80));
  }

  private static printAgingBucketsTable(
    metrics: ARAgingMetrics[],
    alertThresholds?: { highVolumeThreshold: number; payerDelayThreshold: number }
  ): void {
    console.log('\n📊 AGING BUCKETS BY PAYER:');
    console.log('─'.repeat(100));
    console.log('| Payer                    | 0-1 min | 1-2 min | 2-3 min | 3+ min  | Total | Avg Age | Outstanding |');
    console.log('─'.repeat(100));

    for (const payer of metrics) {
      const criticalCount = payer.buckets[ARAgingBucket.THREE_PLUS_MIN];
      const avgAge = payer.averageAgeMinutes.toFixed(2);
      const alertFlag = this.getAlertFlag(criticalCount, alertThresholds?.highVolumeThreshold || 10);

      console.log(
        `| ${payer.payerName.padEnd(24)} | ${String(payer.buckets[ARAgingBucket.ZERO_TO_ONE_MIN]).padStart(7)} | ${String(payer.buckets[ARAgingBucket.ONE_TO_TWO_MIN]).padStart(7)} | ${String(payer.buckets[ARAgingBucket.TWO_TO_THREE_MIN]).padStart(7)} | ${String(criticalCount).padStart(6)}${alertFlag} | ${String(payer.totalClaims).padStart(5)} | ${avgAge.padStart(7)} | ${String(payer.totalOutstanding).padStart(11)} |`
      );
    }
    
    console.log('─'.repeat(100));
  }

  private static printFinancialSummary(metrics: ARAgingMetrics[]): void {
    const totalClaims = metrics.reduce((sum, p) => sum + p.totalClaims, 0);
    const totalBilled = metrics.reduce((sum, p) => sum + p.totalBilledAmount, 0);
    const totalPaid = metrics.reduce((sum, p) => sum + p.totalPaidAmount, 0);
    const totalOutstanding = metrics.reduce((sum, p) => sum + p.totalOutstanding, 0);

    console.log('\n💰 FINANCIAL SUMMARY:');
    console.log(`Total Claims: ${totalClaims.toLocaleString()}`);
    console.log(`Total Billed: $${totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`Total Paid: $${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`Payment Rate: ${((totalPaid / totalBilled) * 100).toFixed(1)}%`);
    console.log(`Outstanding Claims: ${totalOutstanding}`);
  }

  private static printCriticalAlerts(
    metrics: ARAgingMetrics[],
    alertThresholds?: { highVolumeThreshold: number; payerDelayThreshold: number }
  ): void {
    const highVolumeThreshold = alertThresholds?.highVolumeThreshold || 10;
    const payerDelayThreshold = alertThresholds?.payerDelayThreshold || 2;
    
    const criticalAlerts = metrics.filter(payer => 
      payer.buckets[ARAgingBucket.THREE_PLUS_MIN] > highVolumeThreshold ||
      payer.averageAgeMinutes > payerDelayThreshold
    );

    if (criticalAlerts.length > 0) {
      console.log('\n🚨 CRITICAL ALERTS:');
      for (const payer of criticalAlerts) {
        const criticalCount = payer.buckets[ARAgingBucket.THREE_PLUS_MIN];
        if (criticalCount > highVolumeThreshold) {
          console.log(`   • ${payer.payerName}: ${criticalCount} claims in 3+ min bucket (CRITICAL)`);
        }
        if (payer.averageAgeMinutes > payerDelayThreshold) {
          console.log(`   • ${payer.payerName}: Average age ${payer.averageAgeMinutes.toFixed(2)} min (SLOW PAYER)`);
        }
      }
    }
  }

  private static getAlertFlag(criticalCount: number, highVolumeThreshold: number): string {
    if (criticalCount > highVolumeThreshold) return '🚨';
    if (criticalCount > 0) return '⚠️';
    return '✅';
  }
}