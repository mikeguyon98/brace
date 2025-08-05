#!/usr/bin/env node

import { BillingService } from './billing-service';
import { createServiceLogger } from '@billing-simulator/shared';

const logger = createServiceLogger('billing-main');

async function main() {
  try {
    // Get configuration from environment
    const config = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
      database: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'billing',
        username: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
        maxConnections: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '10'),
      },
      reportingIntervalSeconds: parseInt(process.env.REPORTING_INTERVAL_SECONDS || '5'),
    };

    // Create and start billing service
    const service = new BillingService(config);

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

    // Log stats periodically (separate from statistics reporting)
    setInterval(async () => {
      try {
        const stats = await service.getStats();
        logger.info('Billing service stats:', stats);
      } catch (error) {
        logger.error('Failed to get stats:', error);
      }
    }, 60000); // Every minute

  } catch (error) {
    logger.error(`Failed to start billing service: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (require.main === module) {
  main();
}