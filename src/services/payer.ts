import { ClaimMessage, RemittanceMessage, PayerConfig, RemittanceAdvice, RemittanceLine } from '../shared/types';
import { logger } from '../shared/logger';
import { InMemoryQueue } from '../queue/in-memory-queue';

export class PayerAdjudicator {
  private config: PayerConfig;

  constructor(config: PayerConfig) {
    this.config = config;
  }

  async adjudicateClaim(
    correlationId: string,
    claim: any
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
    
    // Simple rounding to avoid precision issues
    const result: RemittanceLine = {
      service_line_id: serviceLine.service_line_id,
      billed_amount: Math.round(billedAmount * 100) / 100,
      payer_paid_amount: Math.round(payerPaidAmount * 100) / 100,
      coinsurance_amount: Math.round(coinsuranceAmount * 100) / 100,
      copay_amount: Math.round(copayAmount * 100) / 100,
      deductible_amount: Math.round(deductibleAmount * 100) / 100,
      not_allowed_amount: Math.round(notAllowedAmount * 100) / 100,
    };

    return result;
  }

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

export class PayerService {
  private adjudicator: PayerAdjudicator;
  private payerQueue: InMemoryQueue<ClaimMessage>;
  private remittanceQueue: InMemoryQueue<RemittanceMessage>;
  private config: PayerConfig;
  private claimsProcessed = 0;

  constructor(
    config: PayerConfig,
    payerQueue: InMemoryQueue<ClaimMessage>,
    remittanceQueue: InMemoryQueue<RemittanceMessage>
  ) {
    this.config = config;
    this.adjudicator = new PayerAdjudicator(config);
    this.payerQueue = payerQueue;
    this.remittanceQueue = remittanceQueue;

    this.setupProcessor();
  }

  private setupProcessor(): void {
    this.payerQueue.process(async (job) => {
      await this.processClaim(job.data);
    });

    logger.info(`Payer service initialized for ${this.config.name} (${this.config.payer_id})`);
  }

  private async processClaim(claimMessage: ClaimMessage): Promise<void> {
    try {
      const startTime = Date.now();

      // Simulate processing delay
      await this.adjudicator.simulateProcessingDelay();

      // Adjudicate the claim
      const remittance = await this.adjudicator.adjudicateClaim(
        claimMessage.correlation_id,
        claimMessage.claim
      );

      // Send remittance back to clearinghouse
      const remittanceMessage: RemittanceMessage = {
        correlation_id: claimMessage.correlation_id,
        remittance,
      };

      await this.remittanceQueue.add(remittanceMessage);

      this.claimsProcessed++;
      const processingTime = Date.now() - startTime;

      logger.debug(`Processed claim ${claimMessage.claim.claim_id} in ${processingTime}ms`);

      if (this.claimsProcessed % 50 === 0) {
        logger.info(`${this.config.name} processed ${this.claimsProcessed} claims`);
      }

    } catch (error) {
      logger.error(`Error processing claim ${claimMessage.claim.claim_id} for payer ${this.config.payer_id}:`, error);
      throw error;
    }
  }

  getStats() {
    return {
      payerId: this.config.payer_id,
      payerName: this.config.name,
      claimsProcessed: this.claimsProcessed,
    };
  }
}