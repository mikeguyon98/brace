import {
  type PayerClaim,
  type RemittanceAdvice,
  type RemittanceLine,
  type PayerConfig,
  validateAmountSum,
  adjustForRoundingError,
  createServiceLogger,
} from '@billing-simulator/shared';

const logger = createServiceLogger('adjudicator');

export class PayerAdjudicator {
  private config: PayerConfig;

  constructor(config: PayerConfig) {
    this.config = config;
  }

  async adjudicateClaim(
    correlationId: string,
    claim: PayerClaim
  ): Promise<RemittanceAdvice> {
    logger.debug(`Adjudicating claim ${claim.claim_id} for payer ${this.config.payer_id}`);

    const remittanceLines: RemittanceLine[] = [];

    for (const serviceLine of claim.service_lines) {
      const remittanceLine = this.adjudicateServiceLine(serviceLine);
      remittanceLines.push(remittanceLine);
    }

    const remittance: RemittanceAdvice = {
      correlation_id: correlationId,
      claim_id: claim.claim_id,
      payer_id: this.config.payer_id,
      remittance_lines: remittanceLines,
      processed_at: new Date().toISOString(),
    };

    logger.debug(`Adjudicated claim ${claim.claim_id}: ${remittanceLines.length} lines processed`);
    return remittance;
  }

  private adjudicateServiceLine(serviceLine: any): RemittanceLine {
    const billedAmount = serviceLine.billed_amount;
    
    // Handle zero or negative amounts
    if (billedAmount <= 0) {
      return {
        service_line_id: serviceLine.service_line_id,
        billed_amount: billedAmount,
        payer_paid_amount: 0,
        coinsurance_amount: 0,
        copay_amount: 0,
        deductible_amount: 0,
        not_allowed_amount: billedAmount < 0 ? Math.abs(billedAmount) : 0,
      };
    }

    // Apply adjudication rules
    const rules = this.config.adjudication_rules;
    
    // Calculate basic payer payment (percentage of billed amount)
    let payerPaidAmount = billedAmount * rules.payer_percentage;
    
    // Calculate fixed copay
    let copayAmount = rules.copay_fixed_amount || 0;
    
    // Ensure copay doesn't exceed remaining amount
    copayAmount = Math.min(copayAmount, billedAmount - payerPaidAmount);
    
    // Calculate deductible (percentage of remaining amount)
    const remainingAfterPayerAndCopay = billedAmount - payerPaidAmount - copayAmount;
    let deductibleAmount = remainingAfterPayerAndCopay * (rules.deductible_percentage || 0);
    
    // Calculate coinsurance (remaining patient responsibility after deductible)
    let coinsuranceAmount = remainingAfterPayerAndCopay - deductibleAmount;
    
    // Add some randomization for simulation realism
    const randomFactor = 0.9 + Math.random() * 0.2; // ±10% variation
    payerPaidAmount *= randomFactor;
    
    // Ensure amounts don't go negative
    payerPaidAmount = Math.max(0, payerPaidAmount);
    copayAmount = Math.max(0, copayAmount);
    deductibleAmount = Math.max(0, deductibleAmount);
    coinsuranceAmount = Math.max(0, coinsuranceAmount);
    
    // Calculate not allowed amount (sometimes payers don't allow full billed amount)
    const allowedAmount = payerPaidAmount + copayAmount + deductibleAmount + coinsuranceAmount;
    let notAllowedAmount = Math.max(0, billedAmount - allowedAmount);
    
    // Apply rounding error correction to ensure exact sum
    const amounts = [payerPaidAmount, coinsuranceAmount, copayAmount, deductibleAmount, notAllowedAmount];
    const adjustedAmounts = adjustForRoundingError(billedAmount, amounts);
    
    const result: RemittanceLine = {
      service_line_id: serviceLine.service_line_id,
      billed_amount: billedAmount,
      payer_paid_amount: Math.round(adjustedAmounts[0] * 100) / 100,
      coinsurance_amount: Math.round(adjustedAmounts[1] * 100) / 100,
      copay_amount: Math.round(adjustedAmounts[2] * 100) / 100,
      deductible_amount: Math.round(adjustedAmounts[3] * 100) / 100,
      not_allowed_amount: Math.round(adjustedAmounts[4] * 100) / 100,
    };

    // Validate the sum constraint
    if (!validateAmountSum(
      result.billed_amount,
      result.payer_paid_amount,
      result.coinsurance_amount,
      result.copay_amount,
      result.deductible_amount,
      result.not_allowed_amount
    )) {
      logger.warn(`Amount sum validation failed for service line ${serviceLine.service_line_id}`);
    }

    return result;
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

  getConfig(): PayerConfig {
    return this.config;
  }
}