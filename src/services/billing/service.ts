/**
 * Billing Service - Main Implementation
 * Orchestrates remittance processing, statistics collection, and reporting
 */

import { RemittanceMessage } from '../../shared/types';
import { logger } from '../../shared/logger';
import { InMemoryQueue } from '../../queue/in-memory-queue';
import { ARAgingService } from '../ar-aging';
import { BillingStatisticsManager } from './statistics';
import { BillingReportGenerator } from './reporting';
import { BillingServiceConfig, RemittanceProcessingResult } from './interfaces';

export class BillingService {
  private remittanceQueue: InMemoryQueue<RemittanceMessage>;
  private statisticsManager: BillingStatisticsManager;
  private reportGenerator: BillingReportGenerator;
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

    this.statisticsManager = new BillingStatisticsManager();
    this.reportGenerator = new BillingReportGenerator(this.statisticsManager);

    this.setupProcessor();
    this.startReporting();
  }

  /**
   * Initialize queue processor
   */
  private setupProcessor(): void {
    this.remittanceQueue.process(async (job) => {
      await this.processRemittance(job.data);
    });

    logger.info('Billing service processor initialized');
  }

  /**
   * Process a single remittance
   */
  private async processRemittance(remittanceMessage: RemittanceMessage): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Process remittance and update statistics
      const result = this.statisticsManager.processRemittance(
        remittanceMessage, 
        Date.now() - startTime
      );

      this.remittancesProcessed++;

      // Record remittance completion for AR Aging
      if (this.arAgingService) {
        this.arAgingService.recordClaimCompletion(remittanceMessage);
      }

      // Notify main app that a claim has been processed
      if (this.onClaimProcessed) {
        this.onClaimProcessed();
      }

      // Log processing result
      this.logProcessingResult(remittanceMessage, result);

      // Periodic progress logging
      if (this.remittancesProcessed % 50 === 0) {
        const summary = this.statisticsManager.generateSummary();
        logger.info(`Billing service processed ${this.remittancesProcessed} remittances, $${summary.totalBilledAmount.toFixed(2)} total billed`);
      }

    } catch (error) {
      logger.error(`Error processing remittance ${remittanceMessage.correlation_id}:`, error);
      throw error;
    }
  }

  /**
   * Log remittance processing result
   */
  private logProcessingResult(
    remittanceMessage: RemittanceMessage,
    result: { claimBilledAmount: number; claimPaidAmount: number; claimPatientResponsibility: number }
  ): void {
    const { remittance } = remittanceMessage;
    logger.info(
      `Billing processed remittance for claim ${remittance.claim_id} - ` +
      `$${result.claimBilledAmount.toFixed(2)} billed, $${result.claimPaidAmount.toFixed(2)} paid`
    );
  }

  /**
   * Start automated reporting
   */
  private startReporting(): void {
    if (this.config.reportingIntervalSeconds && this.config.reportingIntervalSeconds > 0) {
      this.reportingInterval = setInterval(() => {
        this.reportGenerator.printReport();
      }, this.config.reportingIntervalSeconds * 1000);
    }
  }

  /**
   * Stop the service and cleanup
   */
  stop(): void {
    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
    }
    logger.info('Billing service stopped');
  }

  /**
   * Get service statistics
   */
  getStats() {
    const allStats = this.statisticsManager.getAllStats();
    const summary = this.statisticsManager.generateSummary();
    
    return {
      remittancesProcessed: this.remittancesProcessed,
      totalClaims: allStats.totalClaims,
      totalBilledAmount: allStats.totalBilledAmount,
      totalPaidAmount: allStats.totalPaidAmount,
      totalPatientResponsibility: allStats.totalPatientResponsibility,
      payerBreakdown: allStats.payerBreakdown,
      patientCostShares: allStats.patientCostShares,
      payerCount: allStats.payerBreakdown.size,
      patientCount: allStats.patientCostShares.size,
      paymentRate: summary.paymentRate,
      throughput: summary.averageThroughput
    };
  }

  /**
   * Generate and return billing report
   */
  generateReport() {
    return this.reportGenerator.generateReport();
  }

  /**
   * Generate text report
   */
  generateTextReport(): string {
    return this.reportGenerator.generateTextReport();
  }

  /**
   * Generate JSON report
   */
  generateJSONReport(): string {
    return this.reportGenerator.generateJSONReport();
  }

  /**
   * Print report to console
   */
  printReport(): void {
    this.reportGenerator.printReport();
  }

  /**
   * Get dashboard summary
   */
  getDashboardSummary() {
    return this.reportGenerator.generateSummaryForDashboard();
  }

  /**
   * Get payer CSV report
   */
  getPayerCSV(): string {
    return this.reportGenerator.generatePayerCSV();
  }

  /**
   * Get specific payer statistics
   */
  getPayerStats(payerId: string) {
    return this.statisticsManager.getPayerStats(payerId);
  }

  /**
   * Get specific patient cost share
   */
  getPatientCostShare(patientId: string) {
    return this.statisticsManager.getPatientCostShare(patientId);
  }

  /**
   * Get top patients by cost share
   */
  getTopPatients(limit: number = 10) {
    return this.statisticsManager.getTopPatients(limit);
  }

  /**
   * Reset all statistics
   */
  resetStats(): void {
    this.statisticsManager.reset();
    this.remittancesProcessed = 0;
    logger.info('Billing statistics reset');
  }

  /**
   * Update reporting configuration
   */
  updateConfig(newConfig: Partial<BillingServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart reporting with new interval if changed
    if (newConfig.reportingIntervalSeconds !== undefined) {
      if (this.reportingInterval) {
        clearInterval(this.reportingInterval);
      }
      this.startReporting();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): BillingServiceConfig {
    return { ...this.config };
  }
}