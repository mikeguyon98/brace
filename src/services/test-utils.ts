/**
 * Test Utilities
 * Common mocks, fixtures, and helpers for service testing
 */

import { 
  PayerClaim, 
  ClaimMessage, 
  RemittanceMessage, 
  PayerConfig, 
  ClaimStatus,
  RemittanceAdvice,
  RemittanceLine 
} from '../shared/types';
import { DenialCategory } from '../shared/denial-reasons';

/**
 * Test data generators
 */
export class TestDataGenerator {
  static createPayerClaim(overrides: Partial<PayerClaim> = {}): PayerClaim {
    return {
      claim_id: 'test-claim-123',
      place_of_service_code: 11,
      insurance: {
        payer_id: 'medicare',
        patient_member_id: 'MEM123456'
      },
      patient: {
        first_name: 'John',
        last_name: 'Doe',
        gender: 'm',
        dob: '1980-01-01'
      },
      organization: {
        name: 'Test Medical Center'
      },
      rendering_provider: {
        first_name: 'Dr. Jane',
        last_name: 'Smith',
        npi: '1234567890'
      },
      service_lines: [
        {
          service_line_id: 'line-1',
          procedure_code: '99213',
          units: 1,
          details: 'Office visit',
          unit_charge_currency: 'USD',
          unit_charge_amount: 150
        }
      ],
      ...overrides
    };
  }

  static createClaimMessage(overrides: Partial<ClaimMessage> = {}): ClaimMessage {
    return {
      correlation_id: 'test-correlation-123',
      claim: this.createPayerClaim(overrides.claim),
      ingested_at: new Date().toISOString(),
      ...overrides
    };
  }

  static createRemittanceLine(overrides: Partial<RemittanceLine> = {}): RemittanceLine {
    return {
      service_line_id: 'line-1',
      billed_amount: 150,
      payer_paid_amount: 120,
      coinsurance_amount: 15,
      copay_amount: 10,
      deductible_amount: 5,
      not_allowed_amount: 0,
      status: ClaimStatus.APPROVED,
      ...overrides
    };
  }

  static createRemittanceAdvice(overrides: Partial<RemittanceAdvice> = {}): RemittanceAdvice {
    return {
      correlation_id: 'test-correlation-123',
      claim_id: 'test-claim-123',
      payer_id: 'medicare',
      remittance_lines: [this.createRemittanceLine()],
      processed_at: new Date().toISOString(),
      overall_status: ClaimStatus.APPROVED,
      ...overrides
    };
  }

  static createRemittanceMessage(overrides: Partial<RemittanceMessage> = {}): RemittanceMessage {
    return {
      correlation_id: 'test-correlation-123',
      remittance: this.createRemittanceAdvice(overrides.remittance),
      ...overrides
    };
  }

  static createPayerConfig(overrides: Partial<PayerConfig> = {}): PayerConfig {
    return {
      payer_id: 'medicare',
      name: 'Medicare',
      processing_delay_ms: { min: 1000, max: 5000 },
      adjudication_rules: {
        payer_percentage: 0.8,
        copay_fixed_amount: 25,
        deductible_percentage: 0.1
      },
      denial_settings: {
        denial_rate: 0.1,
        hard_denial_rate: 0.7,
        preferred_categories: [DenialCategory.AUTHORIZATION, DenialCategory.MEDICAL_NECESSITY]
      },
      ...overrides
    };
  }

  static createMultiLineServiceClaim(serviceLineCount: number = 3): PayerClaim {
    const serviceLines = Array.from({ length: serviceLineCount }, (_, i) => ({
      service_line_id: `line-${i + 1}`,
      procedure_code: `9921${i + 3}`,
      units: 1,
      details: `Service ${i + 1}`,
      unit_charge_currency: 'USD',
      unit_charge_amount: 100 + (i * 50)
    }));

    return this.createPayerClaim({ service_lines: serviceLines });
  }
}

/**
 * Mock implementations for external dependencies
 */
export class MockFactory {
  static createMockQueue<T>() {
    return {
      add: jest.fn().mockResolvedValue(undefined),
      process: jest.fn(),
      getStats: jest.fn().mockReturnValue({ completed: 0, failed: 0, active: 0, waiting: 0 }),
      close: jest.fn().mockResolvedValue(undefined)
    };
  }

  static createMockClaimStore() {
    return {
      createClaim: jest.fn().mockResolvedValue(undefined),
      updateClaimStatus: jest.fn().mockResolvedValue(undefined),
      getClaimsByStatus: jest.fn().mockResolvedValue([]),
      getClaim: jest.fn().mockResolvedValue(null),
      getClaimsStats: jest.fn().mockResolvedValue({ total: 0, by_status: {} }),
      close: jest.fn().mockResolvedValue(undefined)
    };
  }

  static createMockLogger() {
    return {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  }

  static createMockRateLimiter() {
    return {
      shouldProcess: jest.fn().mockReturnValue(true),
      waitForNextSlot: jest.fn().mockResolvedValue(undefined),
      getStats: jest.fn().mockReturnValue({ 
        requestsInWindow: 0, 
        windowStartTime: Date.now(),
        rateLimit: 1
      })
    };
  }

  static createMockFileProcessor() {
    return {
      processFile: jest.fn().mockResolvedValue({
        totalLines: 10,
        validClaims: 10,
        invalidClaims: 0,
        errors: []
      }),
      validateClaimStructure: jest.fn().mockReturnValue({ isValid: true, errors: [] })
    };
  }
}

/**
 * Test helper functions
 */
export class TestHelpers {
  /**
   * Wait for a promise to resolve with timeout
   */
  static async waitFor<T>(
    condition: () => T | Promise<T>, 
    timeout: number = 1000,
    interval: number = 50
  ): Promise<T> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const result = await condition();
        if (result) return result;
      } catch (error) {
        // Continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Create a spy on Math.random that returns predictable values
   */
  static mockPredictableRandom(values: number[]): jest.SpyInstance {
    let index = 0;
    return jest.spyOn(Math, 'random').mockImplementation(() => {
      const value = values[index % values.length];
      index++;
      return value;
    });
  }

  /**
   * Assert that amounts sum correctly (accounting for floating point precision)
   */
  static assertAmountReconciliation(
    billedAmount: number,
    paidAmount: number,
    coinsurance: number,
    copay: number,
    deductible: number,
    notAllowed: number,
    precision: number = 2
  ): void {
    const totalAccounted = paidAmount + coinsurance + copay + deductible + notAllowed;
    expect(totalAccounted).toBeCloseTo(billedAmount, precision);
  }

  /**
   * Create date helpers for time-based testing
   */
  static createDateMock(baseDate: Date = new Date('2023-01-01T10:00:00Z')) {
    let currentTime = baseDate.getTime();
    
    return {
      mockDate: jest.spyOn(global, 'Date').mockImplementation(((...args: any[]) => {
        if (args.length === 0) {
          return new Date(currentTime) as any;
        }
        return new (Date as any)(...args);
      }) as any),
      
      advance: (ms: number) => {
        currentTime += ms;
      },
      
      setTime: (newTime: Date) => {
        currentTime = newTime.getTime();
      },
      
      getCurrentTime: () => new Date(currentTime),
      
      restore: () => {
        (global.Date as any).mockRestore();
      }
    };
  }

  /**
   * Verify that all required mock calls were made
   */
  static verifyMockCalls(mockFn: jest.MockedFunction<any>, expectedCalls: any[][]) {
    expect(mockFn).toHaveBeenCalledTimes(expectedCalls.length);
    
    expectedCalls.forEach((expectedCall, index) => {
      expect(mockFn).toHaveBeenNthCalledWith(index + 1, ...expectedCall);
    });
  }

  /**
   * Generate realistic test scenarios
   */
  static generateTestScenarios() {
    return {
      // Standard approved claim
      standardApproved: {
        name: 'Standard Approved Claim',
        claimAmount: 150,
        expectedPaid: 120, // 80%
        expectedCopay: 25,
        expectedCoinsurance: 5,
        shouldDeny: false
      },
      
      // High value claim
      highValue: {
        name: 'High Value Claim',
        claimAmount: 10000,
        expectedPaid: 8000, // 80%
        expectedCopay: 25,
        expectedCoinsurance: 1975,
        shouldDeny: false
      },
      
      // Low value claim with copay adjustment
      lowValue: {
        name: 'Low Value Claim',
        claimAmount: 20,
        expectedPaid: 16, // 80%
        expectedCopay: 4, // Adjusted down from 25
        expectedCoinsurance: 0,
        shouldDeny: false
      },
      
      // Denied claim
      denied: {
        name: 'Denied Claim',
        claimAmount: 150,
        expectedPaid: 0,
        expectedCopay: 0,
        expectedCoinsurance: 0,
        shouldDeny: true
      }
    };
  }
}

/**
 * Performance testing utilities
 */
export class PerformanceTestUtils {
  static async measureExecutionTime<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; executionTime: number }> {
    const startTime = performance.now();
    const result = await operation();
    const executionTime = performance.now() - startTime;
    
    return { result, executionTime };
  }

  static async runConcurrentOperations<T>(
    operation: () => Promise<T>,
    concurrency: number
  ): Promise<T[]> {
    const operations = Array(concurrency).fill(null).map(() => operation());
    return Promise.all(operations);
  }

  static createMemoryUsageTracker() {
    const measurements: Array<{ timestamp: number; heapUsed: number }> = [];
    
    return {
      start: () => {
        const startMemory = process.memoryUsage().heapUsed;
        measurements.push({ timestamp: Date.now(), heapUsed: startMemory });
      },
      
      measure: () => {
        const currentMemory = process.memoryUsage().heapUsed;
        measurements.push({ timestamp: Date.now(), heapUsed: currentMemory });
      },
      
      getReport: () => {
        if (measurements.length < 2) return null;
        
        const start = measurements[0];
        const end = measurements[measurements.length - 1];
        
        return {
          startMemory: start.heapUsed,
          endMemory: end.heapUsed,
          memoryDelta: end.heapUsed - start.heapUsed,
          duration: end.timestamp - start.timestamp,
          measurements: [...measurements]
        };
      }
    };
  }
}