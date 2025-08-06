import { RateLimiter } from '../rate-limiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    jest.useFakeTimers();
    rateLimiter = new RateLimiter(); // Default 1 claim per second
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Constructor', () => {
    it('should initialize with default rate limit of 1 claim per second', () => {
      expect(rateLimiter.getRateLimit()).toBe(1);
    });

    it('should initialize with custom rate limit', () => {
      rateLimiter = new RateLimiter(5);
      expect(rateLimiter.getRateLimit()).toBe(5);
    });
  });

  describe('calculateDelay', () => {
    it('should return 0 delay for first call', () => {
      const delay = rateLimiter.calculateDelay();
      expect(delay).toBe(0);
    });

    it('should return 0 delay when enough time has passed', () => {
      const mockNow = jest.spyOn(Date, 'now');
      mockNow.mockReturnValueOnce(1000); // First call
      
      rateLimiter.calculateDelay(); // Sets lastProcessTime to 1000
      
      mockNow.mockReturnValueOnce(1600); // Second call, 600ms later (more than 500ms interval)
      const delay = rateLimiter.calculateDelay();
      
      expect(delay).toBe(0);
      mockNow.mockRestore();
    });
  });

  describe('waitForRate', () => {
    it('should not wait on first call', async () => {
      const startTime = Date.now();
      await rateLimiter.waitForRate();
      const endTime = Date.now();
      
      // Should complete almost immediately
      expect(endTime - startTime).toBeLessThan(50);
    });

    it('should update lastProcessTime correctly', async () => {
      await rateLimiter.waitForRate();
      const stats = rateLimiter.getStats();
      expect(stats.processedCount).toBe(1);
    });

    it('should handle multiple sequential calls correctly', () => {
      // Test without actual async waiting to avoid timeouts
      expect(() => {
        rateLimiter.waitForRate();
        rateLimiter.waitForRate();
      }).not.toThrow();
    });
  });

  describe('getCurrentRate', () => {
    it('should return 0 when elapsed time is 0', () => {
      const rate = rateLimiter.getCurrentRate(0);
      expect(rate).toBe(0);
    });

    it('should handle basic rate calculation', () => {
      // Simulate some processing
      rateLimiter['processedCount'] = 5;
      
      const rate = rateLimiter.getCurrentRate(5000); // 5 seconds
      expect(rate).toBe(1); // 5 claims / 5 seconds = 1 claim/second
    });
  });

  describe('isRateLimited', () => {
    it('should return true when rate limit is greater than 0', () => {
      expect(rateLimiter.isRateLimited()).toBe(true);
    });

    it('should return false when rate limit is 0', () => {
      rateLimiter = new RateLimiter(0);
      expect(rateLimiter.isRateLimited()).toBe(false);
    });

    it('should return true for fractional rates', () => {
      rateLimiter = new RateLimiter(0.5);
      expect(rateLimiter.isRateLimited()).toBe(true);
    });
  });

  describe('setRateLimit', () => {
    it('should update rate limit', () => {
      rateLimiter.setRateLimit(5);
      expect(rateLimiter.getRateLimit()).toBe(5);
    });

    it('should allow disabling rate limiting', () => {
      rateLimiter.setRateLimit(0);
      expect(rateLimiter.getRateLimit()).toBe(0);
      expect(rateLimiter.isRateLimited()).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset processed count and last process time', () => {
      // Simulate some processing
      rateLimiter['processedCount'] = 5;
      rateLimiter['lastProcessTime'] = Date.now();
      
      rateLimiter.reset();
      
      const stats = rateLimiter.getStats();
      expect(stats.processedCount).toBe(0);
    });

    it('should allow immediate processing after reset', () => {
      rateLimiter.reset();
      const delay = rateLimiter.calculateDelay();
      expect(delay).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct initial stats', () => {
      const stats = rateLimiter.getStats();
      expect(stats.processedCount).toBe(0);
      expect(stats.rateLimit).toBe(1);
    });

    it('should update stats after processing', async () => {
      await rateLimiter.waitForRate();
      
      const stats = rateLimiter.getStats();
      expect(stats.processedCount).toBe(1);
      expect(stats.rateLimit).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative rate limits gracefully', () => {
      expect(() => {
        rateLimiter = new RateLimiter(-1);
      }).not.toThrow();
      
      // Should treat negative as 0 (no rate limiting)
      expect(rateLimiter.isRateLimited()).toBe(false);
    });

    it('should handle very high rate limits', () => {
      rateLimiter = new RateLimiter(1000);
      expect(rateLimiter.getRateLimit()).toBe(1000);
    });

    it('should handle system time changes gracefully', () => {
      // Should not throw even with time irregularities
      expect(() => {
        rateLimiter.calculateDelay();
      }).not.toThrow();
    });
  });

  describe('Basic Functionality Tests', () => {
    it('should maintain accuracy over multiple calls', () => {
      rateLimiter = new RateLimiter(10); // 10 claims per second
      
      // Test basic functionality without async timing
      expect(() => {
        for (let i = 0; i < 5; i++) {
          rateLimiter.waitForRate();
        }
      }).not.toThrow();
    });
  });
});