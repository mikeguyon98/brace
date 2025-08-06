/**
 * Payer Adjudicator - Core Business Logic
 * Handles claim adjudication, denial logic, and remittance generation
 */

import { 
  PayerConfig, 
  RemittanceAdvice, 
  RemittanceLine,
  ClaimStatus,
  PayerClaim
} from '../../shared/types';
import { logger } from '../../shared/logger';
import { 
  selectRandomDenialReason, 
  selectDenialReasonByCategory 
} from '../../shared/denial-reasons';
import { generateEDI835Response } from '../../shared/edi-835-generator';
import { AdjudicationResult, ServiceLineAdjudicationInput } from './interfaces';

export class PayerAdjudicator {
  private config: PayerConfig;

  constructor(config: PayerConfig) {
    this.config = config;
  }

  /**
   * Main adjudication entry point
   */
  async adjudicateClaim(
    correlationId: string,
    claim: PayerClaim
  ): Promise<RemittanceAdvice> {
    logger.debug(`Adjudicating claim ${claim.claim_id} for payer ${this.config.payer_id}`);

    // First, check if the entire claim should be denied
    const shouldDenyClaim = this.shouldDenyClaim();
    
    if (shouldDenyClaim) {
      logger.info(`🚫 Claim ${claim.claim_id} DENIED by ${this.config.name}`);
      return this.createDeniedClaimRemittance(correlationId, claim);
    }

    const remittanceLines: RemittanceLine[] = [];

    for (const serviceLine of claim.service_lines) {
      const remittanceLine = this.adjudicateServiceLine({
        serviceLine,
        adjudicationRules: this.config.adjudication_rules
      });
      remittanceLines.push(remittanceLine);
    }

    // Calculate overall claim status
    const overallStatus = this.calculateOverallStatus(remittanceLines);
    const totalDeniedAmount = this.calculateTotalDeniedAmount(remittanceLines);

    const remittance: RemittanceAdvice = {
      correlation_id: correlationId,
      claim_id: claim.claim_id,
      payer_id: this.config.payer_id,
      remittance_lines: remittanceLines,
      processed_at: new Date().toISOString(),
      overall_status: overallStatus,
      total_denied_amount: totalDeniedAmount > 0 ? totalDeniedAmount : undefined,
    };

    // Generate EDI-835 response
    remittance.edi_835_response = generateEDI835Response(remittance, claim, {
      payerName: this.config.name,
      payerContactInfo: `Contact: 1-800-${this.config.payer_id.slice(-3)}-HELP`
    });

    logger.debug(`Adjudicated claim ${claim.claim_id}: ${remittanceLines.length} lines processed, status: ${overallStatus}`);
    return remittance;
  }

  /**
   * Adjudicate individual service line
   */
  private adjudicateServiceLine(input: ServiceLineAdjudicationInput): RemittanceLine {
    const { serviceLine, adjudicationRules } = input;
    const billedAmount = serviceLine.unit_charge_amount * serviceLine.units;
    
    // Handle zero or negative amounts
    if (billedAmount <= 0) {
      return this.createZeroAmountRemittanceLine(serviceLine, billedAmount);
    }

    // Check if this service line should be denied
    const shouldDenyLine = this.shouldDenyServiceLine();
    
    if (shouldDenyLine) {
      return this.createDeniedServiceLineRemittance(serviceLine, billedAmount);
    }

    // Apply adjudication rules for approved service line
    return this.applyAdjudicationRules(serviceLine, billedAmount, adjudicationRules);
  }

  /**
   * Create remittance line for zero or negative amounts
   */
  private createZeroAmountRemittanceLine(serviceLine: any, billedAmount: number): RemittanceLine {
    return {
      service_line_id: serviceLine.service_line_id,
      billed_amount: billedAmount,
      payer_paid_amount: 0,
      coinsurance_amount: 0,
      copay_amount: 0,
      deductible_amount: 0,
      not_allowed_amount: billedAmount < 0 ? Math.abs(billedAmount) : 0,
      status: ClaimStatus.DENIED,
    };
  }

  /**
   * Create remittance line for denied service line
   */
  private createDeniedServiceLineRemittance(serviceLine: any, billedAmount: number): RemittanceLine {
    const denialReason = selectRandomDenialReason();
    logger.debug(`Service line ${serviceLine.service_line_id} denied: ${denialReason.description}`);
    
    return {
      service_line_id: serviceLine.service_line_id,
      billed_amount: billedAmount,
      payer_paid_amount: 0,
      coinsurance_amount: 0,
      copay_amount: 0,
      deductible_amount: 0,
      not_allowed_amount: billedAmount,
      status: ClaimStatus.DENIED,
      denial_info: {
        denial_code: denialReason.code,
        group_code: denialReason.group_code,
        reason_code: denialReason.reason_code,
        category: denialReason.category,
        severity: denialReason.severity,
        description: denialReason.description,
        explanation: denialReason.explanation,
      },
    };
  }

  /**
   * Apply adjudication rules to calculate payment amounts
   */
  private applyAdjudicationRules(serviceLine: any, billedAmount: number, rules: PayerConfig['adjudication_rules']): RemittanceLine {
    // Calculate basic payer payment (percentage of billed amount) with randomization
    const randomFactor = 0.9 + Math.random() * 0.2; // ±10% variation
    let payerPaidAmount = billedAmount * rules.payer_percentage * randomFactor;
    
    // Calculate fixed copay
    let copayAmount = rules.copay_fixed_amount || 0;
    
    // Ensure copay doesn't exceed remaining amount
    copayAmount = Math.min(copayAmount, billedAmount - payerPaidAmount);
    
    // Calculate deductible (percentage of remaining amount)
    const remainingAfterPayerAndCopay = billedAmount - payerPaidAmount - copayAmount;
    let deductibleAmount = remainingAfterPayerAndCopay * (rules.deductible_percentage || 0);
    
    // Calculate coinsurance (remaining patient responsibility after deductible)
    let coinsuranceAmount = remainingAfterPayerAndCopay - deductibleAmount;
    
    // Ensure amounts don't go negative
    payerPaidAmount = Math.max(0, payerPaidAmount);
    copayAmount = Math.max(0, copayAmount);
    deductibleAmount = Math.max(0, deductibleAmount);
    coinsuranceAmount = Math.max(0, coinsuranceAmount);
    
    // Calculate not allowed amount (sometimes payers don't allow full billed amount)
    const allowedAmount = payerPaidAmount + copayAmount + deductibleAmount + coinsuranceAmount;
    let notAllowedAmount = Math.max(0, billedAmount - allowedAmount);
    
    // Simple rounding to avoid precision issues
    return {
      service_line_id: serviceLine.service_line_id,
      billed_amount: Math.round(billedAmount * 100) / 100,
      payer_paid_amount: Math.round(payerPaidAmount * 100) / 100,
      coinsurance_amount: Math.round(coinsuranceAmount * 100) / 100,
      copay_amount: Math.round(copayAmount * 100) / 100,
      deductible_amount: Math.round(deductibleAmount * 100) / 100,
      not_allowed_amount: Math.round(notAllowedAmount * 100) / 100,
      status: ClaimStatus.APPROVED,
    };
  }

  /**
   * Simulate processing delay based on payer configuration
   */
  async simulateProcessingDelay(): Promise<void> {
    const { min, max } = this.config.processing_delay_ms;
    const delay = min + Math.random() * (max - min);
    
    logger.debug(`Simulating processing delay: ${delay.toFixed(0)}ms`);
    
    return new Promise(resolve => {
      setTimeout(resolve, delay);
    });
  }

  /**
   * Determine if an entire claim should be denied
   */
  private shouldDenyClaim(): boolean {
    const denialSettings = this.config.denial_settings;
    if (!denialSettings) {
      return false; // No denial settings, never deny
    }
    
    return Math.random() < denialSettings.denial_rate;
  }

  /**
   * Determine if a service line should be denied (independent of claim-level denial)
   */
  private shouldDenyServiceLine(): boolean {
    const denialSettings = this.config.denial_settings;
    if (!denialSettings) {
      return false;
    }
    
    // Use a lower rate for service-line denials (typically 1/3 of claim denial rate)
    const serviceLineDenialRate = denialSettings.denial_rate * 0.33;
    return Math.random() < serviceLineDenialRate;
  }

  /**
   * Create a complete denial remittance for an entire claim
   */
  private createDeniedClaimRemittance(correlationId: string, claim: PayerClaim): RemittanceAdvice {
    const denialReason = this.selectClaimDenialReason();
    const totalBilledAmount = claim.service_lines.reduce((sum, line) => sum + (line.unit_charge_amount * line.units), 0);

    const remittanceLines: RemittanceLine[] = claim.service_lines.map(serviceLine => ({
      service_line_id: serviceLine.service_line_id,
              billed_amount: serviceLine.unit_charge_amount * serviceLine.units,
      payer_paid_amount: 0,
      coinsurance_amount: 0,
      copay_amount: 0,
      deductible_amount: 0,
              not_allowed_amount: serviceLine.unit_charge_amount * serviceLine.units,
      status: ClaimStatus.DENIED,
      denial_info: {
        denial_code: denialReason.code,
        group_code: denialReason.group_code,
        reason_code: denialReason.reason_code,
        category: denialReason.category,
        severity: denialReason.severity,
        description: denialReason.description,
        explanation: denialReason.explanation,
      },
    }));

    const remittance: RemittanceAdvice = {
      correlation_id: correlationId,
      claim_id: claim.claim_id,
      payer_id: this.config.payer_id,
      remittance_lines: remittanceLines,
      processed_at: new Date().toISOString(),
      overall_status: ClaimStatus.DENIED,
      total_denied_amount: totalBilledAmount,
    };

    // Generate EDI-835 response for denial
    remittance.edi_835_response = generateEDI835Response(remittance, claim, {
      payerName: this.config.name,
      payerContactInfo: `Contact: 1-800-${this.config.payer_id.slice(-3)}-HELP`
    });

    return remittance;
  }

  /**
   * Select appropriate denial reason based on payer preferences
   */
  private selectClaimDenialReason() {
    const denialSettings = this.config.denial_settings;
    
    if (denialSettings?.preferred_categories && denialSettings.preferred_categories.length > 0) {
      // Select from preferred categories
      const preferredCategory = denialSettings.preferred_categories[
        Math.floor(Math.random() * denialSettings.preferred_categories.length)
      ];
      return selectDenialReasonByCategory(preferredCategory);
    }
    
    return selectRandomDenialReason();
  }

  /**
   * Calculate overall claim status based on remittance lines
   */
  private calculateOverallStatus(lines: RemittanceLine[]): ClaimStatus {
    const deniedLines = lines.filter(line => line.status === ClaimStatus.DENIED);
    
    if (deniedLines.length === 0) {
      return ClaimStatus.APPROVED;
    } else if (deniedLines.length === lines.length) {
      return ClaimStatus.DENIED;
    } else {
      return ClaimStatus.PARTIAL_DENIAL;
    }
  }

  /**
   * Calculate total denied amount across all remittance lines
   */
  private calculateTotalDeniedAmount(lines: RemittanceLine[]): number {
    return lines
      .filter(line => line.status === ClaimStatus.DENIED)
      .reduce((sum, line) => sum + line.billed_amount, 0);
  }

  /**
   * Get payer configuration
   */
  getConfig(): PayerConfig {
    return this.config;
  }
}