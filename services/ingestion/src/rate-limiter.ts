import { sleep, createServiceLogger } from '@billing-simulator/shared';

const logger = createServiceLogger('rate-limiter');

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second
  private readonly refillInterval: number; // ms between refills

  constructor(rate: number) {
    this.capacity = Math.max(1, Math.ceil(rate));
    this.refillRate = rate;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
    
    // For high rates, refill more frequently with smaller amounts
    // For low rates, refill less frequently with larger amounts
    if (rate >= 10) {
      this.refillInterval = 100; // 10 times per second
    } else if (rate >= 1) {
      this.refillInterval = 1000; // once per second
    } else {
      this.refillInterval = 1000 / rate; // based on rate
    }

    logger.info(`Rate limiter initialized: ${rate} claims/sec, capacity: ${this.capacity}, refill interval: ${this.refillInterval}ms`);
  }

  async waitForToken(): Promise<void> {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Calculate how long to wait for the next token
    const tokensNeeded = 1 - this.tokens;
    const waitTimeMs = (tokensNeeded / this.refillRate) * 1000;
    
    logger.debug(`Waiting ${waitTimeMs.toFixed(2)}ms for next token`);
    await sleep(waitTimeMs);
    
    // Recursively wait if we still don't have enough tokens
    await this.waitForToken();
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    
    if (timePassed >= this.refillInterval) {
      const tokensToAdd = (timePassed / 1000) * this.refillRate;
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  getStatus() {
    this.refillTokens();
    return {
      tokens: this.tokens,
      capacity: this.capacity,
      refillRate: this.refillRate,
    };
  }
}

/**
 * Simple rate limiter that sleeps for 1/rate seconds between operations
 * Good for lower rates where precision isn't as critical
 */
export class SimpleRateLimiter {
  private readonly delayMs: number;

  constructor(rate: number) {
    this.delayMs = 1000 / rate;
    logger.info(`Simple rate limiter initialized: ${rate} claims/sec (${this.delayMs.toFixed(2)}ms delay)`);
  }

  async waitForNext(): Promise<void> {
    if (this.delayMs >= 1) {
      await sleep(this.delayMs);
    }
    // For very high rates (>1000/sec), don't sleep as scheduler overhead would be too high
  }
}

export function createRateLimiter(rate: number) {
  // Use token bucket for complex scenarios, simple limiter for straightforward cases
  if (rate >= 10 || rate < 1) {
    return new TokenBucketRateLimiter(rate);
  } else {
    return new SimpleRateLimiter(rate);
  }
}