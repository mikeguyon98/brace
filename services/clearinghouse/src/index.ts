#!/usr/bin/env node

import { ClearinghouseService } from './clearinghouse-service';
import { createServiceLogger } from '@billing-simulator/shared';

const logger = createServiceLogger('clearinghouse-main');

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
        database: process.env.POSTGRES_DB || 'clearinghouse',
        username: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
        maxConnections: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20'),
      },
      timeoutMinutes: parseInt(process.env.CLAIM_TIMEOUT_MINUTES || '10'),
    };

    // Create and start clearinghouse service
    const service = new ClearinghouseService(config);

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
        logger.info('Clearinghouse stats:', stats);
      } catch (error) {
        logger.error('Failed to get stats:', error);
      }
    }, 30000); // Every 30 seconds

  } catch (error) {
    logger.error(`Failed to start clearinghouse service: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (require.main === module) {
  main();
}