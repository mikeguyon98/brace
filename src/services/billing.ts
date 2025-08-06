import { RemittanceMessage, ARAgingBucket, ARAgingReport, PatientCostShare } from '../shared/types';
import { logger } from '../shared/logger';
import { InMemoryQueue } from '../queue/in-memory-queue';
import { ARAgingService } from './ar-aging';

interface BillingStats {
  totalClaims: number;
  totalBilledAmount: number;
  totalPaidAmount: number;
  totalPatientResponsibility: number;
  payerBreakdown: Map<string, {
    claimsCount: number;
    billedAmount: number;
    paidAmount: number;
  }>;
  patientCostShares: Map<string, PatientCostShare>;
  processingTimes: number[];
}

export interface BillingServiceConfig {
  reportingIntervalSeconds?: number;
}

export class BillingService {
  private remittanceQueue: InMemoryQueue<RemittanceMessage>;
  private stats: BillingStats;
  private config: BillingServiceConfig;
  private reportingInterval?: NodeJS.Timeout;
  private remittancesProcessed = 0;
  private arAgingService?: ARAgingService;
  private onClaimProcessed?: () => void;

  constructor(
    remittanceQueue: InMemoryQueue<RemittanceMessage>,
    config: BillingServiceConfig = {},
    arAgingService?: ARAgingService,
    onClaimProcessed?: () => void
  ) {
    this.remittanceQueue = remittanceQueue;
    this.config = {
      reportingIntervalSeconds: config.reportingIntervalSeconds || 30,
    };
    this.arAgingService = arAgingService;
    this.onClaimProcessed = onClaimProcessed;

    this.stats = {
      totalClaims: 0,
      totalBilledAmount: 0,
      totalPaidAmount: 0,
      totalPatientResponsibility: 0,
      payerBreakdown: new Map(),
      patientCostShares: new Map(),
      processingTimes: [],
    };

    this.setupProcessor();
    this.startReporting();
  }

  private setupProcessor(): void {
    this.remittanceQueue.process(async (job) => {
      await this.processRemittance(job.data);
    });

    logger.info('Billing service processor initialized');
  }

  private async processRemittance(remittanceMessage: RemittanceMessage): Promise<void> {
    try {
      const { remittance } = remittanceMessage;
      
      this.stats.totalClaims++;
      
      let claimBilledAmount = 0;
      let claimPaidAmount = 0;
      let claimPatientResponsibility = 0;

      // Process each remittance line
      for (const line of remittance.remittance_lines) {
        claimBilledAmount += line.billed_amount;
        claimPaidAmount += line.payer_paid_amount;
        claimPatientResponsibility += line.coinsurance_amount + line.copay_amount + line.deductible_amount;
      }

      this.stats.totalBilledAmount += claimBilledAmount;
      this.stats.totalPaidAmount += claimPaidAmount;
      this.stats.totalPatientResponsibility += claimPatientResponsibility;

      // Update payer breakdown
      const payerId = remittance.payer_id;
      const payerStats = this.stats.payerBreakdown.get(payerId) || {
        claimsCount: 0,
        billedAmount: 0,
        paidAmount: 0,
      };
      
      payerStats.claimsCount++;
      payerStats.billedAmount += claimBilledAmount;
      payerStats.paidAmount += claimPaidAmount;
      this.stats.payerBreakdown.set(payerId, payerStats);

      // Update patient cost share (using correlation_id for patient tracking)
      const patientId = `patient_${remittanceMessage.correlation_id.slice(-6)}`; // Use correlation ID suffix as patient ID
      this.updatePatientCostShare(patientId, remittance.remittance_lines);

      this.remittancesProcessed++;

      // Record remittance completion for AR Aging
      if (this.arAgingService) {
        this.arAgingService.recordClaimCompletion(remittanceMessage);
      }

      // Notify main app that a claim has been processed
      if (this.onClaimProcessed) {
        this.onClaimProcessed();
      }

      logger.info(`Billing processed remittance for claim ${remittance.claim_id} - $${claimBilledAmount.toFixed(2)} billed, $${claimPaidAmount.toFixed(2)} paid`);

      if (this.remittancesProcessed % 50 === 0) {
        logger.info(`Billing service processed ${this.remittancesProcessed} remittances, $${this.stats.totalBilledAmount.toFixed(2)} total billed`);
      }

    } catch (error) {
      logger.error(`Error processing remittance ${remittanceMessage.correlation_id}:`, error);
      throw error;
    }
  }

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

  private startReporting(): void {
    if (this.config.reportingIntervalSeconds && this.config.reportingIntervalSeconds > 0) {
      this.reportingInterval = setInterval(() => {
        this.generateReport();
      }, this.config.reportingIntervalSeconds * 1000);
    }
  }

  private generateReport(): void {
    const report = this.generateStatisticsReport();
    console.log('\n' + '='.repeat(80));
    console.log('BILLING SIMULATOR STATISTICS REPORT');
    console.log(`Generated at: ${new Date().toISOString()}`);
    console.log('='.repeat(80));
    console.log(report);
    console.log('='.repeat(80) + '\n');
  }

  private generateStatisticsReport(): string {
    const uptime = process.uptime();
    const throughput = this.stats.totalClaims / uptime;
    
    let report = '';
    
    // Summary statistics
    report += `\nSUMMARY STATISTICS:\n`;
    report += `  Total Claims Processed: ${this.stats.totalClaims.toLocaleString()}\n`;
    report += `  Total Billed Amount: $${this.stats.totalBilledAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
    report += `  Total Paid Amount: $${this.stats.totalPaidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
    report += `  Total Patient Responsibility: $${this.stats.totalPatientResponsibility.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
    report += `  Average Throughput: ${throughput.toFixed(2)} claims/second\n`;
    report += `  System Uptime: ${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s\n`;

    // Payer breakdown
    if (this.stats.payerBreakdown.size > 0) {
      report += `\nPAYER BREAKDOWN:\n`;
      for (const [payerId, stats] of this.stats.payerBreakdown.entries()) {
        const paymentRate = (stats.paidAmount / stats.billedAmount) * 100;
        report += `  ${payerId}:\n`;
        report += `    Claims: ${stats.claimsCount.toLocaleString()}\n`;
        report += `    Billed: $${stats.billedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
        report += `    Paid: $${stats.paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${paymentRate.toFixed(1)}%)\n`;
      }
    }

    // Top patient cost shares
    if (this.stats.patientCostShares.size > 0) {
      const topPatients = Array.from(this.stats.patientCostShares.values())
        .sort((a, b) => (b.total_copay + b.total_coinsurance + b.total_deductible) - 
                       (a.total_copay + a.total_coinsurance + a.total_deductible))
        .slice(0, 5);

      report += `\nTOP PATIENT COST SHARES:\n`;
      for (const patient of topPatients) {
        const total = patient.total_copay + patient.total_coinsurance + patient.total_deductible;
        report += `  ${patient.patient_id}: $${total.toFixed(2)} (${patient.claim_count} claims)\n`;
      }
    }

    return report;
  }

  stop(): void {
    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
    }
    logger.info('Billing service stopped');
  }

  getStats() {
    return {
      remittancesProcessed: this.remittancesProcessed,
      totalClaims: this.stats.totalClaims,
      totalBilledAmount: this.stats.totalBilledAmount,
      totalPaidAmount: this.stats.totalPaidAmount,
      totalPatientResponsibility: this.stats.totalPatientResponsibility,
      payerBreakdown: this.stats.payerBreakdown,
      patientCostShares: this.stats.patientCostShares,
      payerCount: this.stats.payerBreakdown.size,
      patientCount: this.stats.patientCostShares.size,
    };
  }

  // Manual report generation
  printReport(): void {
    this.generateReport();
  }
}