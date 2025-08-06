/**
 * Ingestion Rate Limiter
 * Handles rate limiting and throttling of claim processing
 */

import { logger } from '../../shared/logger';

export class RateLimiter {
  private rateLimit: number; // claims per second
  private lastProcessTime: number = 0;
  private processedCount: number = 0;

  constructor(rateLimit: number = 1) {
    this.rateLimit = rateLimit;
  }

  /**
   * Calculate delay needed to maintain rate limit
   */
  calculateDelay(): number {
    const intervalMs = 1000 / this.rateLimit;
    const now = Date.now();
    const timeSinceLastProcess = now - this.lastProcessTime;
    
    if (timeSinceLastProcess < intervalMs) {
      return intervalMs - timeSinceLastProcess;
    }
    
    return 0;
  }

  /**
   * Wait for appropriate delay to maintain rate limit
   */
  async waitForRate(): Promise<void> {
    const delay = this.calculateDelay();
    
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastProcessTime = Date.now();
    this.processedCount++;
  }

  /**
   * Get current processing rate
   */
  getCurrentRate(elapsedTimeMs: number): number {
    if (elapsedTimeMs === 0) return 0;
    return (this.processedCount * 1000) / elapsedTimeMs;
  }

  /**
   * Check if rate limiting is active
   */
  isRateLimited(): boolean {
    return this.rateLimit > 0;
  }

  /**
   * Update rate limit
   */
  setRateLimit(newRate: number): void {
    this.rateLimit = newRate;
    logger.debug(`Rate limit updated to ${newRate} claims/second`);
  }

  /**
   * Get rate limit configuration
   */
  getRateLimit(): number {
    return this.rateLimit;
  }

  /**
   * Reset rate limiter state
   */
  reset(): void {
    this.lastProcessTime = 0;
    this.processedCount = 0;
  }

  /**
   * Get processing statistics
   */
  getStats() {
    return {
      rateLimit: this.rateLimit,
      processedCount: this.processedCount,
      lastProcessTime: this.lastProcessTime
    };
  }
}