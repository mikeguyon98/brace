/**
 * Worker script for processing claims in parallel
 * This runs in a separate thread to handle claim processing
 */

import { parentPort, workerData } from 'worker_threads';
import { ClaimMessage } from '../../shared/types';

interface WorkerMessage {
  type: string;
  jobId: string;
  data: any;
  attempts: number;
  maxAttempts: number;
}

interface WorkerResponse {
  type: 'completed' | 'failed';
  jobId: string;
  result?: any;
  error?: string;
}

// Worker configuration
const { queueName, workerId, options } = workerData;

console.log(`Worker ${workerId} started for queue: ${queueName}`);

// Listen for messages from the main thread
parentPort?.on('message', async (message: WorkerMessage) => {
  const { type, jobId, data, attempts, maxAttempts } = message;
  
  if (type === 'process') {
    try {
      // Process the claim based on queue type
      const result = await processClaim(data, queueName);
      
      const response: WorkerResponse = {
        type: 'completed',
        jobId,
        result
      };
      
      parentPort?.postMessage(response);
      
    } catch (error) {
      const response: WorkerResponse = {
        type: 'failed',
        jobId,
        error: error instanceof Error ? error.message : String(error)
      };
      
      parentPort?.postMessage(response);
    }
  }
});

/**
 * Process a claim based on the queue type
 */
async function processClaim(data: any, queueName: string): Promise<any> {
  switch (queueName) {
    case 'claims':
      return await processIngestionClaim(data);
    case 'clearinghouse':
      return await processClearinghouseClaim(data);
    case 'payer-anthem':
    case 'payer-united_health_group':
    case 'payer-medicare':
      return await processPayerClaim(data, queueName);
    case 'remittance':
      return await processRemittanceClaim(data);
    default:
      throw new Error(`Unknown queue type: ${queueName}`);
  }
}

/**
 * Process claim during ingestion phase
 */
async function processIngestionClaim(claimMessage: ClaimMessage): Promise<any> {
  // Simulate ingestion processing
  await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10));
  
  return {
    processed: true,
    claimId: claimMessage.claim.claim_id,
    correlationId: claimMessage.correlation_id
  };
}

/**
 * Process claim through clearinghouse
 */
async function processClearinghouseClaim(claimMessage: ClaimMessage): Promise<any> {
  // Simulate clearinghouse processing (routing, validation, etc.)
  await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
  
  // Determine target payer based on claim data
  const payers = ['anthem', 'united_health_group', 'medicare'];
  const targetPayer = payers[Math.floor(Math.random() * payers.length)];
  
  return {
    routed: true,
    claimId: claimMessage.claim.claim_id,
    targetPayer,
    correlationId: claimMessage.correlation_id
  };
}

/**
 * Process claim through payer adjudication
 */
async function processPayerClaim(claimMessage: ClaimMessage, queueName: string): Promise<any> {
  const payerId = queueName.replace('payer-', '');
  
  // Simulate payer-specific processing delays
  const delays = {
    anthem: { min: 100, max: 500 },
    united_health_group: { min: 150, max: 600 },
    medicare: { min: 300, max: 1000 }
  };
  
  const delay = delays[payerId as keyof typeof delays] || { min: 200, max: 400 };
  const processingTime = Math.random() * (delay.max - delay.min) + delay.min;
  
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
  // Simulate adjudication logic
  const adjudicationResult = simulateAdjudication(claimMessage, payerId);
  
  return {
    adjudicated: true,
    claimId: claimMessage.claim.claim_id,
    payerId,
    result: adjudicationResult,
    correlationId: claimMessage.correlation_id
  };
}

/**
 * Process remittance claim
 */
async function processRemittanceClaim(remittanceMessage: any): Promise<any> {
  // Simulate remittance processing
  await new Promise(resolve => setTimeout(resolve, Math.random() * 75 + 25));
  
  return {
    processed: true,
    remittanceId: remittanceMessage.remittance_id,
    correlationId: remittanceMessage.correlation_id
  };
}

/**
 * Simulate payer adjudication logic
 */
function simulateAdjudication(claimMessage: ClaimMessage, payerId: string): any {
  const claim = claimMessage.claim;
  const totalAmount = claim.service_lines.reduce((sum: number, item: any) => sum + (item.unit_charge_amount * item.units), 0);
  
  // Simulate different denial rates and payment percentages by payer
  const payerConfigs = {
    anthem: { denialRate: 0.05, paymentPercentage: 0.80 },
    united_health_group: { denialRate: 0.15, paymentPercentage: 0.75 },
    medicare: { denialRate: 0.10, paymentPercentage: 0.70 }
  };
  
  const config = payerConfigs[payerId as keyof typeof payerConfigs] || payerConfigs.anthem;
  
  // Determine if claim is denied
  const isDenied = Math.random() < config.denialRate;
  
  if (isDenied) {
    return {
      status: 'denied',
      reason: getRandomDenialReason(),
      amount: 0
    };
  }
  
  // Calculate payment amount
  const paymentAmount = totalAmount * config.paymentPercentage;
  
  return {
    status: 'paid',
    amount: paymentAmount,
    patientResponsibility: totalAmount - paymentAmount
  };
}

/**
 * Get a random denial reason
 */
function getRandomDenialReason(): string {
  const reasons = [
    'Missing documentation',
    'Service not covered',
    'Duplicate claim',
    'Invalid diagnosis code',
    'Out of network provider',
    'Pre-authorization required',
    'Exceeds benefit limit'
  ];
  
  return reasons[Math.floor(Math.random() * reasons.length)];
}

// Handle worker shutdown
process.on('SIGTERM', () => {
  console.log(`Worker ${workerId} shutting down gracefully`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`Worker ${workerId} shutting down gracefully`);
  process.exit(0);
}); 