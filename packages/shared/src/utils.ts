import { ARAgingBucket } from './types';

/**
 * Utility functions for billing simulator
 */

export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function calculateAge(ingestedAt: string, processedAt: string): number {
  const ingested = new Date(ingestedAt);
  const processed = new Date(processedAt);
  return processed.getTime() - ingested.getTime();
}

export function getARAgingBucket(ageMs: number): ARAgingBucket {
  const ageSeconds = ageMs / 1000;
  
  if (ageSeconds <= 60) {
    return ARAgingBucket.ZERO_TO_ONE_MIN;
  } else if (ageSeconds <= 120) {
    return ARAgingBucket.ONE_TO_TWO_MIN;
  } else if (ageSeconds <= 180) {
    return ARAgingBucket.TWO_TO_THREE_MIN;
  } else {
    return ARAgingBucket.THREE_PLUS_MIN;
  }
}

export function validateAmountSum(
  billedAmount: number,
  paidAmount: number,
  coinsurance: number,
  copay: number,
  deductible: number,
  notAllowed: number
): boolean {
  const sum = paidAmount + coinsurance + copay + deductible + notAllowed;
  // Allow for small floating point rounding errors
  return Math.abs(sum - billedAmount) < 0.01;
}

export function adjustForRoundingError(
  billedAmount: number,
  amounts: number[]
): number[] {
  const sum = amounts.reduce((a, b) => a + b, 0);
  const diff = billedAmount - sum;
  
  if (Math.abs(diff) < 0.01) {
    // Find the largest amount and adjust it
    const maxIndex = amounts.indexOf(Math.max(...amounts));
    const adjusted = [...amounts];
    adjusted[maxIndex] += diff;
    return adjusted;
  }
  
  return amounts;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function parseRate(rateStr: string): number {
  const rate = parseFloat(rateStr);
  if (isNaN(rate) || rate <= 0) {
    throw new Error(`Invalid rate: ${rateStr}. Must be a positive number.`);
  }
  return rate;
}

export function isValidJsonLine(line: string): boolean {
  try {
    JSON.parse(line);
    return true;
  } catch {
    return false;
  }
}

export class MovingAverage {
  private values: number[] = [];
  private maxSize: number;

  constructor(windowSize: number = 100) {
    this.maxSize = windowSize;
  }

  add(value: number): void {
    this.values.push(value);
    if (this.values.length > this.maxSize) {
      this.values.shift();
    }
  }

  getAverage(): number {
    if (this.values.length === 0) return 0;
    return this.values.reduce((a, b) => a + b, 0) / this.values.length;
  }

  getCount(): number {
    return this.values.length;
  }
}