/**
 * In-memory queue system to replace Redis/BullMQ
 * Provides similar API but runs in a single process with optional worker threads
 */

import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import { logger } from '../shared/logger';
import os from 'os';

export interface QueueJob<T = any> {
  id: string;
  data: T;
  attempts: number;
  maxAttempts: number;
  delay?: number;
  addedAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: Error;
}

export interface QueueOptions {
  maxAttempts?: number;
  delay?: number;
  concurrency?: number;
  retryDelay?: number;
  useWorkerThreads?: boolean;
  workerScript?: string;
}

export interface JobProcessor<T> {
  (job: QueueJob<T>): Promise<void>;
}

export class InMemoryQueue<T = any> extends EventEmitter {
  private jobs: Map<string, QueueJob<T>> = new Map();
  private pendingJobs: QueueJob<T>[] = [];
  private processingJobs: Set<string> = new Set();
  private completedJobs: QueueJob<T>[] = [];
  private failedJobs: QueueJob<T>[] = [];
  private processors: JobProcessor<T>[] = [];
  private isProcessing = false;
  private options: Required<QueueOptions>;
  private jobIdCounter = 0;
  private workers: Worker[] = [];
  private workerIndex = 0;

  constructor(public name: string, options: QueueOptions = {}) {
    super();
    this.options = {
      maxAttempts: options.maxAttempts ?? 3,
      delay: options.delay ?? 0,
      concurrency: options.concurrency ?? 1,
      retryDelay: options.retryDelay ?? 1000,
      useWorkerThreads: options.useWorkerThreads ?? false,
      workerScript: options.workerScript ?? '',
    };

    if (this.options.useWorkerThreads && this.options.workerScript) {
      this.initializeWorkers();
    }
  }

  /**
   * Initialize worker threads for parallel processing
   */
  private initializeWorkers(): void {
    const workerCount = Math.min(this.options.concurrency, os.cpus().length - 1);
    
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(this.options.workerScript, {
        workerData: { 
          queueName: this.name,
          workerId: i,
          options: this.options 
        }
      });

      worker.on('message', (message) => {
        this.handleWorkerMessage(message);
      });

      worker.on('error', (error) => {
        logger.error(`Worker ${i} error:`, error);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          logger.warn(`Worker ${i} stopped with exit code ${code}`);
        }
      });

      this.workers.push(worker);
    }

    logger.info(`Initialized ${workerCount} worker threads for queue: ${this.name}`);
  }

  /**
   * Handle messages from worker threads
   */
  private handleWorkerMessage(message: any): void {
    const { type, jobId, result, error } = message;
    const job = this.jobs.get(jobId);

    if (!job) {
      logger.warn(`Received message for unknown job: ${jobId}`);
      return;
    }

    switch (type) {
      case 'completed':
        job.completedAt = new Date();
        this.completedJobs.push(job);
        this.processingJobs.delete(jobId);
        this.emit('job-completed', job);
        break;
      
      case 'failed':
        job.error = new Error(error);
        this.emit('job-failed', job, job.error);
        
        if (job.attempts < job.maxAttempts) {
          // Retry the job
          const retryDelay = this.options.retryDelay * Math.pow(2, job.attempts - 1);
          setTimeout(() => {
            this.pendingJobs.push(job);
            this.processJobs();
          }, retryDelay);
        } else {
          // Job permanently failed
          job.failedAt = new Date();
          this.failedJobs.push(job);
        }
        
        this.processingJobs.delete(jobId);
        break;
    }

    // Continue processing more jobs
    setImmediate(() => this.processJobs());
  }

  /**
   * Add a job to the queue
   */
  async add(data: T, jobOptions?: Partial<QueueOptions>): Promise<string> {
    const job: QueueJob<T> = {
      id: `${this.name}-${++this.jobIdCounter}`,
      data,
      attempts: 0,
      maxAttempts: jobOptions?.maxAttempts ?? this.options.maxAttempts,
      delay: jobOptions?.delay ?? this.options.delay,
      addedAt: new Date(),
    };

    this.jobs.set(job.id, job);
    
    if (job.delay && job.delay > 0) {
      // Schedule delayed job
      setTimeout(() => {
        this.pendingJobs.push(job);
        this.processJobs();
      }, job.delay);
    } else {
      this.pendingJobs.push(job);
      this.processJobs();
    }

    this.emit('job-added', job);
    return job.id;
  }

  /**
   * Add a job processor
   */
  process(processor: JobProcessor<T>): void {
    this.processors.push(processor);
    this.processJobs();
  }

  /**
   * Process pending jobs with concurrency control
   */
  private async processJobs(): Promise<void> {
    if (this.isProcessing || this.processors.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.pendingJobs.length > 0 && this.processingJobs.size < this.options.concurrency) {
      const job = this.pendingJobs.shift()!;
      
      if (this.options.useWorkerThreads && this.workers.length > 0) {
        this.processJobWithWorker(job);
      } else {
        this.processJob(job);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Process a job using worker threads
   */
  private processJobWithWorker(job: QueueJob<T>): void {
    this.processingJobs.add(job.id);
    job.attempts++;
    job.processedAt = new Date();

    this.emit('job-started', job);

    // Send job to next available worker
    const worker = this.workers[this.workerIndex];
    this.workerIndex = (this.workerIndex + 1) % this.workers.length;

    worker.postMessage({
      type: 'process',
      jobId: job.id,
      data: job.data,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts
    });
  }

  /**
   * Process a single job in the main thread
   */
  private async processJob(job: QueueJob<T>): Promise<void> {
    this.processingJobs.add(job.id);
    job.attempts++;
    job.processedAt = new Date();

    this.emit('job-started', job);

    try {
      // Process with all available processors (for now just use the first one)
      if (this.processors.length > 0) {
        await this.processors[0](job);
      }

      // Job completed successfully
      job.completedAt = new Date();
      this.completedJobs.push(job);
      this.emit('job-completed', job);

      // Trim completed jobs to prevent memory leak
      if (this.completedJobs.length > 100) {
        this.completedJobs.splice(0, this.completedJobs.length - 100);
      }

    } catch (error) {
      job.error = error as Error;
      this.emit('job-failed', job, error);

      if (job.attempts < job.maxAttempts) {
        // Retry the job with exponential backoff
        const retryDelay = this.options.retryDelay * Math.pow(2, job.attempts - 1);
        logger.warn(`Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}), retrying in ${retryDelay}ms`, {
          error: error instanceof Error ? error.message : String(error),
          jobId: job.id,
          queue: this.name,
        });

        setTimeout(() => {
          this.pendingJobs.push(job);
          this.processJobs();
        }, retryDelay);
      } else {
        // Job permanently failed
        job.failedAt = new Date();
        this.failedJobs.push(job);
        logger.error(`Job ${job.id} permanently failed after ${job.attempts} attempts`, {
          error: error instanceof Error ? error.message : String(error),
          jobId: job.id,
          queue: this.name,
        });

        // Trim failed jobs to prevent memory leak
        if (this.failedJobs.length > 50) {
          this.failedJobs.splice(0, this.failedJobs.length - 50);
        }
      }
    } finally {
      this.processingJobs.delete(job.id);
      // Continue processing more jobs
      setImmediate(() => this.processJobs());
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      pending: this.pendingJobs.length,
      processing: this.processingJobs.size,
      completed: this.completedJobs.length,
      failed: this.failedJobs.length,
      total: this.jobs.size,
      workers: this.workers.length,
      useWorkerThreads: this.options.useWorkerThreads,
    };
  }

  /**
   * Get all jobs by status
   */
  getJobs() {
    return {
      pending: [...this.pendingJobs],
      processing: Array.from(this.processingJobs).map(id => this.jobs.get(id)!),
      completed: [...this.completedJobs],
      failed: [...this.failedJobs],
    };
  }

  /**
   * Clear all jobs
   */
  clear(): void {
    this.jobs.clear();
    this.pendingJobs.length = 0;
    this.processingJobs.clear();
    this.completedJobs.length = 0;
    this.failedJobs.length = 0;
  }

  /**
   * Pause job processing
   */
  pause(): void {
    this.isProcessing = true; // Prevents new jobs from being processed
    this.emit('paused');
  }

  /**
   * Resume job processing
   */
  resume(): void {
    this.isProcessing = false;
    this.processJobs();
    this.emit('resumed');
  }

  /**
   * Stop all workers and cleanup
   */
  async stop(): Promise<void> {
    // Stop all workers
    const stopPromises = this.workers.map(worker => worker.terminate());
    await Promise.all(stopPromises);
    this.workers = [];
    
    logger.info(`Stopped all workers for queue: ${this.name}`);
  }
}

/**
 * Queue manager to handle multiple queues
 */
export class QueueManager {
  private queues: Map<string, InMemoryQueue> = new Map();

  getQueue<T = any>(name: string, options?: QueueOptions): InMemoryQueue<T> {
    if (!this.queues.has(name)) {
      this.queues.set(name, new InMemoryQueue<T>(name, options));
    }
    return this.queues.get(name)! as InMemoryQueue<T>;
  }

  getAllQueues(): Map<string, InMemoryQueue> {
    return new Map(this.queues);
  }

  getOverallStats() {
    const stats = {
      totalQueues: this.queues.size,
      totalPending: 0,
      totalProcessing: 0,
      totalCompleted: 0,
      totalFailed: 0,
    };

    for (const queue of this.queues.values()) {
      const queueStats = queue.getStats();
      stats.totalPending += queueStats.pending;
      stats.totalProcessing += queueStats.processing;
      stats.totalCompleted += queueStats.completed;
      stats.totalFailed += queueStats.failed;
    }

    return stats;
  }

  clear(): void {
    for (const queue of this.queues.values()) {
      queue.clear();
    }
  }
}

// Global queue manager instance
export const queueManager = new QueueManager();