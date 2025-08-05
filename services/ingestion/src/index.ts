#!/usr/bin/env node

import { parseCLIArgs } from './cli';
import { IngestionService } from './ingestion-service';
import { createServiceLogger } from '@billing-simulator/shared';

const logger = createServiceLogger('ingestion-main');

async function main() {
  try {
    // Parse command line arguments
    const args = parseCLIArgs();
    
    // Get Redis configuration from environment
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    };

    // Create and start ingestion service
    const service = new IngestionService({
      filePath: args.filePath,
      rate: args.rate,
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

  } catch (error) {
    logger.error(`Failed to start ingestion service: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (require.main === module) {
  main();
}