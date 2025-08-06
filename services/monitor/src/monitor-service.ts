import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { spawn } from 'child_process';
import { QUEUE_NAMES, MetricsCollector } from '@billing-simulator/shared';
import { createServiceLogger } from '@billing-simulator/shared';

const logger = createServiceLogger('monitor');

export interface MonitorServiceConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
  };
}

export interface QueueMetrics {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface SystemMetrics {
  queues: QueueMetrics[];
  redis: {
    connected: boolean;
    usedMemory?: string;
    connectedClients?: number;
  };
  processingMetrics: {
    totalClaimsIngested: number;
    totalClaimsProcessed: number;
    totalRemittancesGenerated: number;
    totalErrors: number;
    payerBreakdown: Record<string, {
      claimsProcessed: number;
      errors: number;
    }>;
    processingRates: {
      claimsPerSecond: number;
      remittancesPerSecond: number;
    };
    startTime: number;
    elapsedSeconds: number;
  };
  timestamp: number;
}

export class MonitorService {
  private redis: Redis;
  private queues: Map<string, Queue> = new Map();
  private metrics: MetricsCollector;
  private config: MonitorServiceConfig;

  constructor(config: MonitorServiceConfig) {
    this.config = config;
    
    const redisConfig = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    };

    this.redis = new Redis(redisConfig);
    
    // Initialize queues for monitoring
    this.initializeQueues(redisConfig);
    
    // Initialize metrics collector
    this.metrics = new MetricsCollector(this.redis);
  }

  private initializeQueues(redisConfig: any): void {
    // Core queues
    this.queues.set(QUEUE_NAMES.CLAIMS_INGESTION, new Queue(QUEUE_NAMES.CLAIMS_INGESTION, { connection: redisConfig }));
    this.queues.set(QUEUE_NAMES.REMITTANCE_RETURN, new Queue(QUEUE_NAMES.REMITTANCE_RETURN, { connection: redisConfig }));
    
    // Payer queues (using the actual payer IDs)
    const payerIds = ['aetna_001', 'bcbs_001', 'cigna_001', 'humana_001', 'medicare_001'];
    payerIds.forEach(payerId => {
      const queueName = `payer-${payerId}`;
      this.queues.set(queueName, new Queue(queueName, { connection: redisConfig }));
    });
  }

  async start(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('Monitor service connected to Redis');
      
      // Initialize metrics start time if not exists
      await this.metrics.initializeStartTime();
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    // Close all queue connections
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    
    await this.redis.disconnect();
    logger.info('Monitor service disconnected');
  }

  async getMetrics(): Promise<SystemMetrics> {
    const queueMetrics: QueueMetrics[] = [];
    
    // Get metrics for each queue
    for (const [name, queue] of this.queues) {
      try {
        const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
          queue.getWaiting(),
          queue.getActive(),
          queue.getCompleted(),
          queue.getFailed(),
          queue.getDelayed(),
          queue.isPaused()
        ]);

        queueMetrics.push({
          name,
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
          paused: isPaused,
        });
      } catch (error) {
        logger.warn(`Failed to get metrics for queue ${name}:`, error);
        queueMetrics.push({
          name,
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: false,
        });
      }
    }

    // Get Redis info
    let redisInfo: SystemMetrics['redis'] = { connected: true };
    try {
      const info = await this.redis.info('memory');
      const clientInfo = await this.redis.info('clients');
      
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const clientsMatch = clientInfo.match(/connected_clients:(\d+)/);
      
      redisInfo = {
        connected: true,
        usedMemory: memoryMatch ? memoryMatch[1] : undefined,
        connectedClients: clientsMatch ? parseInt(clientsMatch[1]) : undefined,
      };
    } catch (error) {
      logger.warn('Failed to get Redis info:', error);
      redisInfo.connected = false;
    }

    // Get persistent processing metrics
    const processingMetrics = await this.metrics.getMetrics();
    const elapsedSeconds = (Date.now() - processingMetrics.startTime) / 1000;
    
    return {
      queues: queueMetrics,
      redis: redisInfo,
      processingMetrics: {
        totalClaimsIngested: processingMetrics.totalClaimsIngested,
        totalClaimsProcessed: processingMetrics.totalClaimsProcessed,
        totalRemittancesGenerated: processingMetrics.totalRemittancesGenerated,
        totalErrors: processingMetrics.totalErrors,
        payerBreakdown: processingMetrics.payerMetrics,
        processingRates: {
          claimsPerSecond: elapsedSeconds > 0 ? processingMetrics.totalClaimsIngested / elapsedSeconds : 0,
          remittancesPerSecond: elapsedSeconds > 0 ? processingMetrics.totalRemittancesGenerated / elapsedSeconds : 0,
        },
        startTime: processingMetrics.startTime,
        elapsedSeconds,
      },
      timestamp: Date.now(),
    };
  }

  async getQueueJobs(queueName: string, status: 'waiting' | 'active' | 'completed' | 'failed' = 'waiting', limit = 10) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    let jobs;
    switch (status) {
      case 'waiting':
        jobs = await queue.getWaiting(0, limit - 1);
        break;
      case 'active':
        jobs = await queue.getActive(0, limit - 1);
        break;
      case 'completed':
        jobs = await queue.getCompleted(0, limit - 1);
        break;
      case 'failed':
        jobs = await queue.getFailed(0, limit - 1);
        break;
    }

    return jobs.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
    }));
  }

  async triggerIngestion(filePath: string, rate: number): Promise<{ success: boolean; message: string }> {
    try {
      logger.info(`Ingestion trigger requested: file=${filePath}, rate=${rate}`);
      
      // Simplified approach: Read the file and add claims directly to the queue
      // This avoids Docker-in-Docker complexity
      
      const fs = await import('fs');
      const readline = await import('readline');
      
      const actualFilePath = filePath.replace('/data/', '/app/workspace/data/');
      
      if (!fs.existsSync(actualFilePath)) {
        return {
          success: false,
          message: `File not found: ${actualFilePath}`
        };
      }
      
      const fileStream = fs.createReadStream(actualFilePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });
      
      const claimsQueue = this.queues.get(QUEUE_NAMES.CLAIMS_INGESTION);
      if (!claimsQueue) {
        return {
          success: false,
          message: 'Claims ingestion queue not available'
        };
      }
      
      let claimCount = 0;
      const delayMs = Math.floor(1000 / rate); // Convert rate to delay between claims
      
      logger.info(`Starting ingestion with ${delayMs}ms delay between claims`);
      
      // Process file line by line with rate limiting
      setTimeout(async () => {
        for await (const line of rl) {
          if (line.trim()) {
            try {
              const claimData = JSON.parse(line);
              await claimsQueue.add('process-claim', claimData);
              claimCount++;
              
              // Add delay to control rate
              if (delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
              }
            } catch (parseError) {
              logger.warn(`Failed to parse claim line: ${line}`);
            }
          }
        }
        logger.info(`Completed ingestion of ${claimCount} claims from ${filePath}`);
      }, 100); // Small delay to let response return first
      
      return {
        success: true,
        message: `Started ingestion: ${filePath} at ${rate} claims/sec (reading file directly)`
      };
    } catch (error) {
      logger.error('Failed to trigger ingestion:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}