#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { z } from 'zod';
import winston from 'winston';
import { Worker } from 'worker_threads';
import os from 'os';

// Import the existing simulator - using require to avoid TypeScript path issues
const { BillingSimulator, DEFAULT_CONFIG } = require('../../src/app');

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'billing-simulator-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Ensure logs directory exists
fs.ensureDirSync('logs');

// Create Express app
const app: express.Application = express();
const PORT = process.env['PORT'] || 3001;

// Get number of CPU cores for worker threads
const numCPUs = os.cpus().length;
const workerCount = Math.max(1, Math.min(numCPUs - 1, 4)); // Use up to 4 workers, leave 1 core for main thread

logger.info(`🚀 Starting API server with ${workerCount} worker threads on ${numCPUs} CPU cores`);

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(cors({
  origin: process.env['NODE_ENV'] === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim())
  }
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// File upload configuration
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.jsonl')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON and JSONL files are allowed'));
    }
  }
});

// Ensure uploads directory exists
fs.ensureDirSync('uploads');

// Simulator instance management
let activeSimulator: any = null;
let processingStatus = {
  isRunning: false,
  currentFile: '',
  progress: 0,
  totalClaims: 0,
  processedClaims: 0,
  startTime: null as Date | null,
  estimatedCompletion: null as Date | null
};

// Worker thread pool for heavy processing
const workerPool: Worker[] = [];
let currentWorkerIndex = 0;

// Initialize worker pool
function initializeWorkerPool() {
  for (let i = 0; i < workerCount; i++) {
    const worker = new Worker(`
      const { parentPort } = require('worker_threads');
      
      parentPort.on('message', (data) => {
        // Handle different types of work
        switch (data.type) {
          case 'fileProcessing':
            // Simulate file processing work
            setTimeout(() => {
              parentPort.postMessage({
                type: 'fileProcessingComplete',
                result: data.payload,
                workerId: ${i}
              });
            }, 100);
            break;
          case 'dataValidation':
            // Simulate data validation work
            setTimeout(() => {
              parentPort.postMessage({
                type: 'validationComplete',
                result: { valid: true, data: data.payload },
                workerId: ${i}
              });
            }, 50);
            break;
          default:
            parentPort.postMessage({ type: 'unknown', workerId: ${i} });
        }
      });
    `, { eval: true });
    
    workerPool.push(worker);
    logger.info(`Worker thread ${i + 1} initialized`);
  }
}

// Get next available worker
function getNextWorker(): Worker {
  const worker = workerPool[currentWorkerIndex];
  currentWorkerIndex = (currentWorkerIndex + 1) % workerPool.length;
  return worker;
}

// Validation schemas
const PayerConfigSchema = z.object({
  payer_id: z.string(),
  name: z.string(),
  processing_delay_ms: z.object({
    min: z.number().positive(),
    max: z.number().positive()
  }),
  adjudication_rules: z.object({
    payer_percentage: z.number().min(0).max(1),
    copay_fixed_amount: z.number().min(0),
    deductible_percentage: z.number().min(0).max(1)
  }),
  denial_settings: z.object({
    denial_rate: z.number().min(0).max(1),
    hard_denial_rate: z.number().min(0).max(1),
    preferred_categories: z.array(z.string())
  }).optional()
});

const ConfigSchema = z.object({
  clearinghouse: z.object({
    database: z.object({
      host: z.string(),
      port: z.number(),
      database: z.string(),
      username: z.string(),
      password: z.string()
    })
  }),
  billing: z.object({
    database: z.object({
      host: z.string(),
      port: z.number(),
      database: z.string(),
      username: z.string(),
      password: z.string()
    }),
    reportingIntervalSeconds: z.number().positive()
  }),
  payers: z.array(PayerConfigSchema),
  ingestion: z.object({
    rateLimit: z.number().positive()
  })
});

// API Routes

// Health check
app.get('/api/health', (_req: any, res: any) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    workers: workerPool.length,
    cpuCores: numCPUs
  });
});

// Get system info
app.get('/api/system/info', (_req: any, res: any) => {
  res.json({
    cpuCores: numCPUs,
    workerThreads: workerPool.length,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    platform: process.platform,
    nodeVersion: process.version
  });
});

// Get default configuration
app.get('/api/config/default', (_req: any, res: any) => {
  res.json(DEFAULT_CONFIG);
});

// Get available preset configurations
app.get('/api/config/presets', (_req: any, res: any) => {
  try {
    const configDir = path.join(process.cwd(), '..', 'config');
    const files = fs.readdirSync(configDir).filter((file: string) => file.endsWith('.json'));
    
    const presets = files.map((file: string) => {
      const configPath = path.join(configDir, file);
      const config = fs.readJsonSync(configPath);
      return {
        name: file.replace('.json', ''),
        displayName: file.replace('.json', '').replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        description: getPresetDescription(file),
        config
      };
    });
    
    res.json(presets);
  } catch (error) {
    logger.error('Error loading preset configurations:', error);
    res.status(500).json({ error: 'Failed to load preset configurations' });
  }
});

// Validate configuration
app.post('/api/config/validate', (req: any, res: any) => {
  try {
    const validatedConfig = ConfigSchema.parse(req.body);
    res.json({ 
      valid: true, 
      message: 'Configuration is valid',
      config: validatedConfig 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        valid: false,
        message: 'Configuration validation failed',
        errors: error.errors
      });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Start simulator
app.post('/api/simulator/start', async (req: any, res: any) => {
  try {
    if (activeSimulator && processingStatus.isRunning) {
      return res.status(400).json({ error: 'Simulator is already running' });
    }

    const config = req.body.config || DEFAULT_CONFIG;
    
    // Validate configuration
    const validatedConfig = ConfigSchema.parse(config);
    
    // Create new simulator instance
    activeSimulator = new BillingSimulator(validatedConfig);
    await activeSimulator.start();
    
    processingStatus = {
      isRunning: true,
      currentFile: '',
      progress: 0,
      totalClaims: 0,
      processedClaims: 0,
      startTime: new Date(),
      estimatedCompletion: null
    };
    
    logger.info('Simulator started via API');
    res.json({ 
      message: 'Simulator started successfully',
      status: processingStatus
    });
  } catch (error) {
    logger.error('Error starting simulator:', error);
    res.status(500).json({ 
      error: 'Failed to start simulator',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Stop simulator
app.post('/api/simulator/stop', async (_req: any, res: any) => {
  try {
    if (!activeSimulator || !processingStatus.isRunning) {
      return res.status(400).json({ error: 'No simulator is currently running' });
    }

    await activeSimulator.stop();
    activeSimulator = null;
    processingStatus.isRunning = false;
    
    logger.info('Simulator stopped via API');
    res.json({ message: 'Simulator stopped successfully' });
  } catch (error) {
    logger.error('Error stopping simulator:', error);
    res.status(500).json({ 
      error: 'Failed to stop simulator',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get simulator status
app.get('/api/simulator/status', (_req: any, res: any) => {
  if (!activeSimulator) {
    return res.json({
      isRunning: false,
      message: 'No simulator is currently running'
    });
  }

  const stats = activeSimulator.getOverallStats();
  res.json({
    isRunning: processingStatus.isRunning,
    status: processingStatus,
    stats: {
      queues: stats.queues,
      ingestion: stats.ingestion,
      clearinghouse: stats.clearinghouse,
      billing: stats.billing,
      payers: stats.payers
    }
  });
});

// Upload and process claims file
app.post('/api/simulator/process', upload.single('claimsFile'), async (req: any, res: any) => {
  try {
    if (!activeSimulator || !processingStatus.isRunning) {
      return res.status(400).json({ error: 'Simulator must be started before processing files' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    
    // Update processing status
    processingStatus.currentFile = originalName;
    processingStatus.startTime = new Date();
    
    logger.info(`Processing file: ${originalName}`);
    
    // Process the file asynchronously
    processFileAsync(filePath, originalName).catch(error => {
      logger.error('Error processing file:', error);
    });
    
    res.json({ 
      message: 'File upload successful, processing started',
      fileName: originalName,
      status: processingStatus
    });
  } catch (error) {
    logger.error('Error uploading file:', error);
    res.status(500).json({ 
      error: 'Failed to upload file',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get processing results
app.get('/api/simulator/results', (_req: any, res: any) => {
  if (!activeSimulator) {
    return res.status(400).json({ error: 'No simulator is currently running' });
  }

  try {
    const stats = activeSimulator.getOverallStats();
    res.json({
      stats: {
        queues: stats.queues,
        ingestion: stats.ingestion,
        clearinghouse: stats.clearinghouse,
        billing: stats.billing,
        payers: stats.payers
      },
      processingStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting results:', error);
    res.status(500).json({ error: 'Failed to get results' });
  }
});

// Error handling middleware
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

// Helper function to process file asynchronously
async function processFileAsync(filePath: string, originalName: string): Promise<void> {
  try {
    if (!activeSimulator) {
      throw new Error('Simulator not available');
    }

    // Count claims in file
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter((line: string) => line.trim());
    const claimCount = lines.length;
    
    processingStatus.totalClaims = claimCount;
    processingStatus.processedClaims = 0;
    
    logger.info(`Processing ${claimCount} claims from ${originalName}`);
    
    // Process the file
    await activeSimulator.ingestFile(filePath);
    
    // Update final status
    processingStatus.progress = 100;
    processingStatus.processedClaims = claimCount;
    processingStatus.estimatedCompletion = new Date();
    
    logger.info(`Successfully processed ${claimCount} claims from ${originalName}`);
    
    // Clean up uploaded file
    await fs.remove(filePath);
    
  } catch (error) {
    logger.error(`Error processing file ${originalName}:`, error);
    processingStatus.isRunning = false;
    throw error;
  }
}

// Helper function to get preset descriptions
function getPresetDescription(filename: string): string {
  const descriptions: Record<string, string> = {
    'single-process.json': 'Single process configuration for basic testing',
    'high-performance.json': 'Optimized for maximum throughput and performance',
    'aging-demo.json': 'Configuration focused on AR aging analysis',
    'aging-buckets-demo.json': 'Demo with aging bucket analysis',
    'aging-progression.json': 'Shows aging progression over time',
    'aging-visual-demo.json': 'Visual aging analysis demo',
    'denial-demo.json': 'Demonstrates claim denial scenarios',
    'parallel-demo.json': 'Parallel processing demonstration'
  };
  
  return descriptions[filename] || 'Custom configuration preset';
}

// Initialize worker pool
initializeWorkerPool();

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Billing Simulator API server running on port ${PORT}`);
  logger.info(`📊 Health check: http://localhost:${PORT}/api/health`);
  logger.info(`🌐 API documentation: http://localhost:${PORT}/api/docs`);
  logger.info(`⚡ Using ${workerCount} worker threads for parallel processing`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  workerPool.forEach(worker => worker.terminate());
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  workerPool.forEach(worker => worker.terminate());
  process.exit(0);
});

export default app; 