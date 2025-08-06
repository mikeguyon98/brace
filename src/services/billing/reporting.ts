/**
 * Billing Report Generator
 * Handles formatting and generation of billing reports
 */

import { BillingReport, BillingSummary, PayerBillingStats } from './interfaces';
import { PatientCostShare } from '../../shared/types';
import { BillingStatisticsManager } from './statistics';

export class BillingReportGenerator {
  private statisticsManager: BillingStatisticsManager;

  constructor(statisticsManager: BillingStatisticsManager) {
    this.statisticsManager = statisticsManager;
  }

  /**
   * Generate comprehensive billing report
   */
  generateReport(): BillingReport {
    const summary = this.statisticsManager.generateSummary();
    const payerBreakdown = this.statisticsManager.getPayerBreakdownArray();
    const topPatients = this.statisticsManager.getTopPatients(5);
    const systemMetrics = this.statisticsManager.getSystemMetrics();

    return {
      summary,
      payerBreakdown,
      topPatients,
      systemMetrics
    };
  }

  /**
   * Generate formatted text report
   */
  generateTextReport(): string {
    const report = this.generateReport();
    let output = '';
    
    // Summary statistics
    output += this.formatSummarySection(report.summary);
    
    // Payer breakdown
    if (report.payerBreakdown.length > 0) {
      output += this.formatPayerBreakdownSection(report.payerBreakdown);
    }

    // Top patient cost shares
    if (report.topPatients.length > 0) {
      output += this.formatTopPatientsSection(report.topPatients);
    }

    return output;
  }

  /**
   * Format summary statistics section
   */
  private formatSummarySection(summary: BillingSummary): string {
    let output = '\nSUMMARY STATISTICS:\n';
    output += `  Total Claims Processed: ${summary.totalClaims.toLocaleString()}\n`;
    output += `  Total Billed Amount: $${summary.totalBilledAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
    output += `  Total Paid Amount: $${summary.totalPaidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
    output += `  Total Patient Responsibility: $${summary.totalPatientResponsibility.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
    output += `  Payment Rate: ${summary.paymentRate.toFixed(1)}%\n`;
    output += `  Average Throughput: ${summary.averageThroughput.toFixed(2)} claims/second\n`;
    output += `  System Uptime: ${Math.floor(summary.systemUptime / 60)}m ${Math.floor(summary.systemUptime % 60)}s\n`;
    
    return output;
  }

  /**
   * Format payer breakdown section
   */
  private formatPayerBreakdownSection(payerBreakdown: (PayerBillingStats & { payerId: string })[]): string {
    let output = '\nPAYER BREAKDOWN:\n';
    
    for (const payer of payerBreakdown) {
      const paymentRate = payer.billedAmount > 0 ? (payer.paidAmount / payer.billedAmount) * 100 : 0;
      output += `  ${payer.payerId}:\n`;
      output += `    Claims: ${payer.claimsCount.toLocaleString()}\n`;
      output += `    Billed: $${payer.billedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
      output += `    Paid: $${payer.paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${paymentRate.toFixed(1)}%)\n`;
    }
    
    return output;
  }

  /**
   * Format top patients section
   */
  private formatTopPatientsSection(topPatients: PatientCostShare[]): string {
    let output = '\nTOP PATIENT COST SHARES:\n';
    
    for (const patient of topPatients) {
      const total = patient.total_copay + patient.total_coinsurance + patient.total_deductible;
      output += `  ${patient.patient_id}: $${total.toFixed(2)} (${patient.claim_count} claims)\n`;
      output += `    Copay: $${patient.total_copay.toFixed(2)}, `;
      output += `Coinsurance: $${patient.total_coinsurance.toFixed(2)}, `;
      output += `Deductible: $${patient.total_deductible.toFixed(2)}\n`;
    }
    
    return output;
  }

  /**
   * Print formatted report to console
   */
  printReport(): void {
  }

  /**
   * Generate JSON report
   */
  generateJSONReport(): string {
    const report = this.generateReport();
    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate CSV-formatted payer breakdown
   */
  generatePayerCSV(): string {
    const payerBreakdown = this.statisticsManager.getPayerBreakdownArray();
    
    let csv = 'PayerID,Claims,BilledAmount,PaidAmount,PaymentRate\n';
    
    for (const payer of payerBreakdown) {
      const paymentRate = payer.billedAmount > 0 ? (payer.paidAmount / payer.billedAmount) * 100 : 0;
      csv += `${payer.payerId},${payer.claimsCount},${payer.billedAmount.toFixed(2)},${payer.paidAmount.toFixed(2)},${paymentRate.toFixed(1)}%\n`;
    }
    
    return csv;
  }

  /**
   * Generate summary for dashboard/monitoring
   */
  generateSummaryForDashboard(): {
    totalClaims: number;
    totalRevenue: number;
    paymentRate: string;
    throughput: string;
    uptime: string;
    topPayer?: string;
  } {
    const summary = this.statisticsManager.generateSummary();
    const payerBreakdown = this.statisticsManager.getPayerBreakdownArray();
    
    // Find top payer by volume
    const topPayer = payerBreakdown.length > 0 
      ? payerBreakdown.reduce((prev, current) => 
          current.claimsCount > prev.claimsCount ? current : prev
        ).payerId
      : undefined;

    return {
      totalClaims: summary.totalClaims,
      totalRevenue: summary.totalPaidAmount,
      paymentRate: `${summary.paymentRate.toFixed(1)}%`,
      throughput: `${summary.averageThroughput.toFixed(2)} claims/sec`,
      uptime: `${Math.floor(summary.systemUptime / 60)}m ${Math.floor(summary.systemUptime % 60)}s`,
      topPayer
    };
  }
}