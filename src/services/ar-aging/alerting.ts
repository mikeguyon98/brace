/**
 * AR Aging Alerting System
 * Handles alert generation, threshold checking, and notification logic
 */

import { logger } from '../../shared/logger';
import { ARAgingAlert, ARAgingThresholds, ARClaimRecord } from './interfaces';

export class ARAlertManager {
  private alertThresholds: ARAgingThresholds;

  constructor(thresholds: ARAgingThresholds) {
    this.alertThresholds = thresholds;
  }

  /**
   * Check if a claim should trigger aging alerts
   */
  checkAgingAlerts(record: ARClaimRecord, ageMinutes: number): ARAgingAlert[] {
    const alerts: ARAgingAlert[] = [];

    if (ageMinutes > this.alertThresholds.criticalAgeMinutes) {
      alerts.push({
        type: 'HIGH_AGING',
        payerId: record.payerId,
        message: `Claim ${record.claimId} aged ${ageMinutes.toFixed(1)} minutes`,
        severity: 'HIGH',
        timestamp: new Date(),
      });
    }

    return alerts;
  }

  /**
   * Check for payer-level performance alerts
   */
  checkPayerPerformanceAlerts(
    payerId: string,
    payerName: string,
    averageAgeMinutes: number,
    criticalClaimsCount: number
  ): ARAgingAlert[] {
    const alerts: ARAgingAlert[] = [];

    // Check for high volume of critical claims
    if (criticalClaimsCount > this.alertThresholds.highVolumeThreshold) {
      alerts.push({
        type: 'STUCK_CLAIMS',
        payerId,
        message: `${payerName}: ${criticalClaimsCount} claims in 3+ min bucket (CRITICAL)`,
        claimCount: criticalClaimsCount,
        severity: 'CRITICAL',
        timestamp: new Date(),
      });
    }

    // Check for slow payer performance
    if (averageAgeMinutes > this.alertThresholds.payerDelayThreshold) {
      alerts.push({
        type: 'PAYER_DELAY',
        payerId,
        message: `${payerName}: Average age ${averageAgeMinutes.toFixed(2)} min (SLOW PAYER)`,
        severity: 'HIGH',
        timestamp: new Date(),
      });
    }

    return alerts;
  }

  /**
   * Generate and log an alert
   */
  generateAlert(alert: ARAgingAlert): void {
    logger.warn(`AR AGING ALERT [${alert.severity}]: ${alert.message}`, {
      type: alert.type,
      payerId: alert.payerId,
      claimCount: alert.claimCount,
    });
  }

  /**
   * Process multiple alerts
   */
  processAlerts(alerts: ARAgingAlert[]): void {
    alerts.forEach(alert => this.generateAlert(alert));
  }

  /**
   * Get current alert thresholds
   */
  getThresholds(): ARAgingThresholds {
    return { ...this.alertThresholds };
  }

  /**
   * Update alert thresholds
   */
  updateThresholds(newThresholds: Partial<ARAgingThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...newThresholds };
  }
}