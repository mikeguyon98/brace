#!/usr/bin/env node

import { PayerService } from './payer-service';
import { type PayerConfig, createServiceLogger } from '@billing-simulator/shared';

const logger = createServiceLogger('payer-main');

async function main() {
  try {
    // Get payer ID from command line or environment
    const payerId = process.argv[2] || process.env.PAYER_ID;
    if (!payerId) {
      console.error('Usage: node index.js <PAYER_ID>');
      console.error('   or set PAYER_ID environment variable');
      process.exit(1);
    }

    // Get configuration from environment
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    };

    // Get payer configuration (in a real system, this would come from a config service)
    const payerConfig = getPayerConfig(payerId);
    if (!payerConfig) {
      logger.error(`Unknown payer ID: ${payerId}`);
      process.exit(1);
    }

    // Create and start payer service
    const service = new PayerService({
      payerId,
      payerConfig,
      redis: redisConfig,
    });

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await service.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      service.stop().then(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      service.stop().then(() => process.exit(1));
    });

    // Start the service
    await service.start();

    // Log stats periodically
    setInterval(async () => {
      try {
        const stats = await service.getStats();
        logger.info('Payer stats:', stats);
      } catch (error) {
        logger.error('Failed to get stats:', error);
      }
    }, 30000); // Every 30 seconds

  } catch (error) {
    logger.error(`Failed to start payer service: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

function getPayerConfig(payerId: string): PayerConfig | null {
  // In a real system, this would come from a configuration service or database
  const payerConfigs: Record<string, PayerConfig> = {
    'AETNA_001': {
      payer_id: 'AETNA_001',
      name: 'Aetna Health Insurance',
      processing_delay_ms: { min: 1000, max: 5000 },
      adjudication_rules: {
        payer_percentage: 0.8,
        copay_fixed_amount: 25,
        deductible_percentage: 0.1,
      },
    },
    'BCBS_001': {
      payer_id: 'BCBS_001',
      name: 'Blue Cross Blue Shield',
      processing_delay_ms: { min: 2000, max: 8000 },
      adjudication_rules: {
        payer_percentage: 0.75,
        copay_fixed_amount: 30,
        deductible_percentage: 0.15,
      },
    },
    'CIGNA_001': {
      payer_id: 'CIGNA_001',
      name: 'Cigna Healthcare',
      processing_delay_ms: { min: 1500, max: 6000 },
      adjudication_rules: {
        payer_percentage: 0.85,
        copay_fixed_amount: 20,
        deductible_percentage: 0.05,
      },
    },
    'HUMANA_001': {
      payer_id: 'HUMANA_001',
      name: 'Humana Inc.',
      processing_delay_ms: { min: 3000, max: 10000 },
      adjudication_rules: {
        payer_percentage: 0.7,
        copay_fixed_amount: 35,
        deductible_percentage: 0.2,
      },
    },
    'MEDICARE_001': {
      payer_id: 'MEDICARE_001',
      name: 'Medicare',
      processing_delay_ms: { min: 5000, max: 15000 },
      adjudication_rules: {
        payer_percentage: 0.8,
        copay_fixed_amount: 0,
        deductible_percentage: 0.1,
      },
    },
  };

  return payerConfigs[payerId] || null;
}

// Only run main if this file is executed directly
if (require.main === module) {
  main();
}