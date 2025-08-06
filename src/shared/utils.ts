/**
 * Generate a unique correlation ID for tracking claims through the system
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomPart}`;
}

/**
 * Validate that remittance amounts sum correctly to billed amount
 */
export function validateAmountSum(
  billedAmount: number,
  payerPaidAmount: number,
  coinsuranceAmount: number,
  copayAmount: number,
  deductibleAmount: number,
  notAllowedAmount: number
): boolean {
  const totalAccountedFor = payerPaidAmount + coinsuranceAmount + copayAmount + deductibleAmount + notAllowedAmount;
  const tolerance = 0.01; // Allow 1 cent difference due to rounding
  return Math.abs(billedAmount - totalAccountedFor) <= tolerance;
}

/**
 * Adjust amounts to correct for rounding errors while maintaining exact sum
 */
export function adjustForRoundingError(targetSum: number, amounts: number[]): number[] {
  const currentSum = amounts.reduce((sum, amount) => sum + amount, 0);
  const difference = targetSum - currentSum;
  
  if (Math.abs(difference) < 0.001) {
    return amounts; // No significant difference
  }
  
  // Adjust the largest amount to make the sum exact
  const adjusted = [...amounts];
  let largestIndex = 0;
  let largestValue = 0;
  
  for (let i = 0; i < adjusted.length; i++) {
    if (adjusted[i] > largestValue) {
      largestValue = adjusted[i];
      largestIndex = i;
    }
  }
  
  adjusted[largestIndex] += difference;
  return adjusted;
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format a number as currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Format a duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Calculate percentage with proper rounding
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100 * 100) / 100; // Round to 2 decimal places
}