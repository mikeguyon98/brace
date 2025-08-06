import { type PayerConfig, createServiceLogger } from '@billing-simulator/shared';

const logger = createServiceLogger('payer-registry');

export interface PayerEndpoint {
  payer_id: string;
  name: string;
  queue_name: string;
  config: PayerConfig;
}

export class PayerRegistry {
  private payers = new Map<string, PayerEndpoint>();
  private fallbackPayer?: PayerEndpoint;

  constructor() {
    this.initializeDefaultPayers();
  }

  private initializeDefaultPayers(): void {
    // Initialize with some default payers for demonstration
    const defaultPayers: PayerConfig[] = [
      {
        payer_id: 'AETNA_001',
        name: 'Aetna Health Insurance',
        processing_delay_ms: { min: 100, max: 500 },
        adjudication_rules: {
          payer_percentage: 0.8,
          copay_fixed_amount: 25,
          deductible_percentage: 0.1,
        },
      },
      {
        payer_id: 'BCBS_001',
        name: 'Blue Cross Blue Shield',
        processing_delay_ms: { min: 200, max: 800 },
        adjudication_rules: {
          payer_percentage: 0.75,
          copay_fixed_amount: 30,
          deductible_percentage: 0.15,
        },
      },
      {
        payer_id: 'CIGNA_001',
        name: 'Cigna Healthcare',
        processing_delay_ms: { min: 150, max: 600 },
        adjudication_rules: {
          payer_percentage: 0.85,
          copay_fixed_amount: 20,
          deductible_percentage: 0.05,
        },
      },
      {
        payer_id: 'HUMANA_001',
        name: 'Humana Inc.',
        processing_delay_ms: { min: 300, max: 1000 },
        adjudication_rules: {
          payer_percentage: 0.7,
          copay_fixed_amount: 35,
          deductible_percentage: 0.2,
        },
      },
      {
        payer_id: 'MEDICARE_001',
        name: 'Medicare',
        processing_delay_ms: { min: 500, max: 1500 },
        adjudication_rules: {
          payer_percentage: 0.8,
          copay_fixed_amount: 0, // Medicare often has no copay
          deductible_percentage: 0.1,
        },
      },
    ];

    defaultPayers.forEach(config => {
      this.registerPayer(config);
    });

    // Set Medicare as fallback for unknown payers
    this.setFallbackPayer('MEDICARE_001');

    logger.info(`Initialized ${defaultPayers.length} default payers`);
  }

  registerPayer(config: PayerConfig): void {
    const endpoint: PayerEndpoint = {
      payer_id: config.payer_id,
      name: config.name,
      queue_name: `payer-${config.payer_id.toLowerCase()}`,
      config,
    };

    this.payers.set(config.payer_id, endpoint);
    logger.info(`Registered payer: ${config.name} (${config.payer_id})`);
  }

  getPayer(payerId: string): PayerEndpoint | null {
    return this.payers.get(payerId) || null;
  }

  getPayerOrFallback(payerId: string): PayerEndpoint | null {
    const payer = this.getPayer(payerId);
    if (payer) {
      return payer;
    }

    if (this.fallbackPayer) {
      logger.warn(`Unknown payer ${payerId}, using fallback: ${this.fallbackPayer.name}`);
      return this.fallbackPayer;
    }

    logger.error(`Unknown payer ${payerId} and no fallback configured`);
    return null;
  }

  setFallbackPayer(payerId: string): void {
    const payer = this.getPayer(payerId);
    if (payer) {
      this.fallbackPayer = payer;
      logger.info(`Set fallback payer to: ${payer.name}`);
    } else {
      logger.error(`Cannot set fallback payer: ${payerId} not found`);
    }
  }

  getAllPayers(): PayerEndpoint[] {
    return Array.from(this.payers.values());
  }

  getPayerIds(): string[] {
    return Array.from(this.payers.keys());
  }

  getStats() {
    return {
      totalPayers: this.payers.size,
      payerIds: this.getPayerIds(),
      fallbackPayer: this.fallbackPayer?.payer_id || null,
    };
  }

  /**
   * Load payer configurations from environment or external source
   */
  loadPayersFromConfig(payerConfigs: PayerConfig[]): void {
    payerConfigs.forEach(config => {
      this.registerPayer(config);
    });
    logger.info(`Loaded ${payerConfigs.length} payers from configuration`);
  }

  /**
   * Validate that all required payers are configured
   */
  validateRequiredPayers(requiredPayerIds: string[]): boolean {
    const missing = requiredPayerIds.filter(id => !this.payers.has(id));
    if (missing.length > 0) {
      logger.error(`Missing required payers: ${missing.join(', ')}`);
      return false;
    }
    return true;
  }
}