/**
 * Centralized queue configuration for BullMQ
 */

export const QUEUE_NAMES = {
  CLAIMS_INGESTION: 'claims-ingestion',
  PAYER_PROCESSING: 'payer-processing',
  REMITTANCE_RETURN: 'remittance-return',
} as const;

export const QUEUE_CONFIGS = {
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs for debugging
    removeOnFail: 50,      // Keep last 50 failed jobs for debugging
    attempts: 3,           // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential' as const,
      delay: 2000,         // Start with 2 second delay
    },
  },
  
  // High-performance ingestion queue
  ingestion: {
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 25,
      attempts: 1, // Don't retry ingestion failures
    },
  },
  
  // Payer processing with retries for reliability
  payer: {
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential' as const,
        delay: 1000,
      },
    },
  },
  
  // Remittance delivery
  remittance: {
    defaultJobOptions: {
      removeOnComplete: 200, // Keep more for auditing
      removeOnFail: 100,
      attempts: 5, // Critical to deliver remittances
      backoff: {
        type: 'exponential' as const,
        delay: 500,
      },
    },
  },
} as const;