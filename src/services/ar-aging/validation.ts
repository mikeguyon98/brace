/**
 * AR Aging Data Validation
 * Handles all validation logic for claims and remittance data
 */

import { logger } from '../../shared/logger';
import { ARClaimRecord, ARAgingAlert } from './interfaces';

export class ARDataValidator {
  /**
   * Validate claim data for completeness and accuracy
   */
  static validateClaimData(record: ARClaimRecord): boolean {
    return !!(record.claimId && record.payerId && record.submittedAt && record.billedAmount > 0);
  }

  /**
   * Validate chronological consistency between submission and remittance
   */
  static validateChronology(submittedAt: Date, remittedAt: Date): ARAgingAlert | null {
    if (remittedAt < submittedAt) {
      return {
        type: 'DATA_VALIDATION',
        message: `Chronological error: remitted before submitted`,
        severity: 'HIGH',
        timestamp: new Date(),
      };
    }
    return null;
  }

  /**
   * Validate amount reconciliation between adjudicated amounts and billed amount
   */
  static validateAmountReconciliation(
    adjudicatedBilledAmount: number,
    paidAmount: number,
    patientShare: number,
    notAllowedAmount: number,
    claimId: string,
    payerId: string
  ): ARAgingAlert | null {
    const totalAccountedFor = paidAmount + patientShare + notAllowedAmount;
    const tolerance = 0.03; // 3 cents tolerance for floating-point precision
    
    if (Math.abs(adjudicatedBilledAmount - totalAccountedFor) > tolerance) {
      return {
        type: 'DATA_VALIDATION',
        payerId,
        message: `Amount reconciliation error for claim ${claimId}: adjudicated billed $${adjudicatedBilledAmount.toFixed(2)} vs accounted $${totalAccountedFor.toFixed(2)}`,
        severity: 'MEDIUM',
        timestamp: new Date(),
      };
    }
    
    return null;
  }

  /**
   * Check for significant differences between original and adjudicated billed amounts
   */
  static validateBilledAmountConsistency(
    originalBilledAmount: number,
    adjudicatedBilledAmount: number,
    claimId: string
  ): void {
    const billedAmountDifference = Math.abs(originalBilledAmount - adjudicatedBilledAmount);
    if (billedAmountDifference > Math.max(0.05, originalBilledAmount * 0.001)) {
      logger.debug(`Payer adjusted billed amount for claim ${claimId}: original $${originalBilledAmount.toFixed(2)} vs adjudicated $${adjudicatedBilledAmount.toFixed(2)}`);
    }
  }
}