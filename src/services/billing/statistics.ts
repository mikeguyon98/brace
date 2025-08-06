/**
 * Billing Statistics Manager
 * Handles collection, calculation, and management of billing statistics
 */

import { RemittanceMessage, PatientCostShare } from '../../shared/types';
import { BillingStats, PayerBillingStats, BillingSummary, SystemMetrics } from './interfaces';

export class BillingStatisticsManager {
  private stats: BillingStats;

  constructor() {
    this.stats = {
      totalClaims: 0,
      totalBilledAmount: 0,
      totalPaidAmount: 0,
      totalPatientResponsibility: 0,
      payerBreakdown: new Map(),
      patientCostShares: new Map(),
      processingTimes: [],
    };
  }

  /**
   * Process remittance and update statistics
   */
  processRemittance(remittanceMessage: RemittanceMessage, processingTime?: number): {
    claimBilledAmount: number;
    claimPaidAmount: number;
    claimPatientResponsibility: number;
  } {
    const { remittance } = remittanceMessage;
    
    this.stats.totalClaims++;
    
    let claimBilledAmount = 0;
    let claimPaidAmount = 0;
    let claimPatientResponsibility = 0;

    // Process each remittance line
    for (const line of remittance.remittance_lines) {
      claimBilledAmount += line.billed_amount; // This is already calculated in remittance
      claimPaidAmount += line.payer_paid_amount;
      claimPatientResponsibility += line.coinsurance_amount + line.copay_amount + line.deductible_amount;
    }

    // Update totals
    this.stats.totalBilledAmount += claimBilledAmount;
    this.stats.totalPaidAmount += claimPaidAmount;
    this.stats.totalPatientResponsibility += claimPatientResponsibility;

    // Update payer breakdown
    this.updatePayerBreakdown(remittance.payer_id, claimBilledAmount, claimPaidAmount);

    // Update patient cost share
    const patientId = `patient_${remittanceMessage.correlation_id.slice(-6)}`;
    this.updatePatientCostShare(patientId, remittance.remittance_lines);

    // Track processing time if provided
    if (processingTime !== undefined) {
      this.stats.processingTimes.push(processingTime);
      // Keep only last 1000 processing times to avoid memory growth
      if (this.stats.processingTimes.length > 1000) {
        this.stats.processingTimes = this.stats.processingTimes.slice(-1000);
      }
    }

    return {
      claimBilledAmount,
      claimPaidAmount,
      claimPatientResponsibility
    };
  }

  /**
   * Update payer breakdown statistics
   */
  private updatePayerBreakdown(payerId: string, billedAmount: number, paidAmount: number): void {
    const payerStats = this.stats.payerBreakdown.get(payerId) || {
      claimsCount: 0,
      billedAmount: 0,
      paidAmount: 0,
    };
    
    payerStats.claimsCount++;
    payerStats.billedAmount += billedAmount;
    payerStats.paidAmount += paidAmount;
    this.stats.payerBreakdown.set(payerId, payerStats);
  }

  /**
   * Update patient cost share information
   */
  private updatePatientCostShare(patientId: string, remittanceLines: any[]): void {
    const existing = this.stats.patientCostShares.get(patientId) || {
      patient_id: patientId,
      total_copay: 0,
      total_coinsurance: 0,
      total_deductible: 0,
      claim_count: 0,
    };

    for (const line of remittanceLines) {
      existing.total_copay += line.copay_amount;
      existing.total_coinsurance += line.coinsurance_amount;
      existing.total_deductible += line.deductible_amount;
    }
    existing.claim_count++;

    this.stats.patientCostShares.set(patientId, existing);
  }

  /**
   * Generate summary statistics
   */
  generateSummary(): BillingSummary {
    const uptime = process.uptime();
    const throughput = this.stats.totalClaims / uptime;
    const paymentRate = this.stats.totalBilledAmount > 0 
      ? (this.stats.totalPaidAmount / this.stats.totalBilledAmount) * 100 
      : 0;

    return {
      totalClaims: this.stats.totalClaims,
      totalBilledAmount: this.stats.totalBilledAmount,
      totalPaidAmount: this.stats.totalPaidAmount,
      totalPatientResponsibility: this.stats.totalPatientResponsibility,
      paymentRate,
      averageThroughput: throughput,
      systemUptime: uptime
    };
  }

  /**
   * Get system performance metrics
   */
  getSystemMetrics(): SystemMetrics {
    const uptime = process.uptime();
    const throughput = this.stats.totalClaims / uptime;
    
    let averageProcessingTime: number | undefined;
    if (this.stats.processingTimes.length > 0) {
      const total = this.stats.processingTimes.reduce((sum, time) => sum + time, 0);
      averageProcessingTime = total / this.stats.processingTimes.length;
    }

    return {
      uptime,
      throughput,
      averageProcessingTime
    };
  }

  /**
   * Get top patients by cost share
   */
  getTopPatients(limit: number = 5): PatientCostShare[] {
    return Array.from(this.stats.patientCostShares.values())
      .sort((a, b) => {
        const totalA = a.total_copay + a.total_coinsurance + a.total_deductible;
        const totalB = b.total_copay + b.total_coinsurance + b.total_deductible;
        return totalB - totalA;
      })
      .slice(0, limit);
  }

  /**
   * Get payer breakdown as array
   */
  getPayerBreakdownArray(): (PayerBillingStats & { payerId: string })[] {
    return Array.from(this.stats.payerBreakdown.entries()).map(([payerId, stats]) => ({
      payerId,
      ...stats
    }));
  }

  /**
   * Get all statistics
   */
  getAllStats(): BillingStats {
    return {
      ...this.stats,
      payerBreakdown: new Map(this.stats.payerBreakdown),
      patientCostShares: new Map(this.stats.patientCostShares),
      processingTimes: [...this.stats.processingTimes]
    };
  }

  /**
   * Reset all statistics
   */
  reset(): void {
    this.stats = {
      totalClaims: 0,
      totalBilledAmount: 0,
      totalPaidAmount: 0,
      totalPatientResponsibility: 0,
      payerBreakdown: new Map(),
      patientCostShares: new Map(),
      processingTimes: [],
    };
  }

  /**
   * Get specific payer statistics
   */
  getPayerStats(payerId: string): PayerBillingStats | undefined {
    return this.stats.payerBreakdown.get(payerId);
  }

  /**
   * Get specific patient cost share
   */
  getPatientCostShare(patientId: string): PatientCostShare | undefined {
    return this.stats.patientCostShares.get(patientId);
  }
}