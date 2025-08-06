#!/usr/bin/env node

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { MonitorService } from './monitor-service';
import { createServiceLogger } from '@billing-simulator/shared';

const logger = createServiceLogger('monitor-api');

async function main() {
  const fastify = Fastify({
    logger: false, // Use our custom logger
  });

  // CORS for development
  await fastify.register(async function (fastify) {
    fastify.addHook('preHandler', async (request, reply) => {
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type');
      
      if (request.method === 'OPTIONS') {
        reply.code(200).send();
      }
    });
  });

  // Serve static files (React app)
  const publicPath = path.join(__dirname, 'public');
  await fastify.register(fastifyStatic, {
    root: publicPath,
    prefix: '/',
  });

  // Initialize monitor service
  const monitorService = new MonitorService({
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    },
  });

  await monitorService.start();

  // API Routes
  fastify.get('/api/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  fastify.get('/api/metrics', async () => {
    try {
      const metrics = await monitorService.getMetrics();
      return { success: true, data: metrics };
    } catch (error) {
      logger.error('Failed to get metrics:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  fastify.get('/api/queues/:queueName/jobs', async (request: any) => {
    try {
      const { queueName } = request.params;
      const { status = 'waiting', limit = 10 } = request.query;
      
      const jobs = await monitorService.getQueueJobs(queueName, status, parseInt(limit));
      return { success: true, data: jobs };
    } catch (error) {
      logger.error('Failed to get queue jobs:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  fastify.post('/api/ingestion/trigger', async (request: any) => {
    try {
      const { filePath, rate } = request.body;
      
      if (!filePath || !rate) {
        return {
          success: false,
          error: 'filePath and rate are required'
        };
      }

      const result = await monitorService.triggerIngestion(filePath, rate);
      return result;
    } catch (error) {
      logger.error('Failed to trigger ingestion:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Fallback to serve React app for client-side routing
  fastify.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api')) {
      reply.code(404).send({ error: 'API endpoint not found' });
      return;
    }
    
    // Serve index.html for client-side routing
    reply.sendFile('index.html');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await monitorService.stop();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start server
  const port = parseInt(process.env.PORT || '3001');
  const host = process.env.HOST || '0.0.0.0';

  try {
    await fastify.listen({ port, host });
    logger.info(`Monitor dashboard running on http://${host}:${port}`);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main };