import { ARDataValidator } from '../validation';
import { ARClaimRecord, ARAgingAlert } from '../interfaces';

describe('ARDataValidator', () => {
  describe('validateClaimData', () => {
    let validRecord: ARClaimRecord;

    beforeEach(() => {
      validRecord = {
        correlationId: 'test-123',
        claimId: 'claim-456',
        payerId: 'medicare',
        patientId: 'John_Doe',
        submittedAt: new Date(),
        billedAmount: 100.50,
        isOutstanding: true
      };
    });

    it('should return true for valid claim data', () => {
      const result = ARDataValidator.validateClaimData(validRecord);
      expect(result).toBe(true);
    });

    it('should return false for missing claim ID', () => {
      const invalidRecord = { ...validRecord, claimId: '' };
      const result = ARDataValidator.validateClaimData(invalidRecord);
      expect(result).toBe(false);
    });

    it('should return false for null claim ID', () => {
      const invalidRecord = { ...validRecord, claimId: null as any };
      const result = ARDataValidator.validateClaimData(invalidRecord);
      expect(result).toBe(false);
    });

    it('should return false for undefined claim ID', () => {
      const invalidRecord = { ...validRecord, claimId: undefined as any };
      const result = ARDataValidator.validateClaimData(invalidRecord);
      expect(result).toBe(false);
    });

    it('should return false for missing payer ID', () => {
      const invalidRecord = { ...validRecord, payerId: '' };
      const result = ARDataValidator.validateClaimData(invalidRecord);
      expect(result).toBe(false);
    });

    it('should return false for null payer ID', () => {
      const invalidRecord = { ...validRecord, payerId: null as any };
      const result = ARDataValidator.validateClaimData(invalidRecord);
      expect(result).toBe(false);
    });

    it('should return false for missing submitted date', () => {
      const invalidRecord = { ...validRecord, submittedAt: null as any };
      const result = ARDataValidator.validateClaimData(invalidRecord);
      expect(result).toBe(false);
    });

    it('should return false for undefined submitted date', () => {
      const invalidRecord = { ...validRecord, submittedAt: undefined as any };
      const result = ARDataValidator.validateClaimData(invalidRecord);
      expect(result).toBe(false);
    });

    it('should return false for zero billed amount', () => {
      const invalidRecord = { ...validRecord, billedAmount: 0 };
      const result = ARDataValidator.validateClaimData(invalidRecord);
      expect(result).toBe(false);
    });

    it('should return false for negative billed amount', () => {
      const invalidRecord = { ...validRecord, billedAmount: -50.25 };
      const result = ARDataValidator.validateClaimData(invalidRecord);
      expect(result).toBe(false);
    });

    it('should return true for very small positive billed amount', () => {
      const validRecord2 = { ...validRecord, billedAmount: 0.01 };
      const result = ARDataValidator.validateClaimData(validRecord2);
      expect(result).toBe(true);
    });

    it('should return true for very large billed amount', () => {
      const validRecord2 = { ...validRecord, billedAmount: 999999.99 };
      const result = ARDataValidator.validateClaimData(validRecord2);
      expect(result).toBe(true);
    });

    it('should handle floating point precision correctly', () => {
      const validRecord2 = { ...validRecord, billedAmount: 0.1 + 0.2 }; // 0.30000000000000004
      const result = ARDataValidator.validateClaimData(validRecord2);
      expect(result).toBe(true);
    });
  });

  describe('validateChronology', () => {
    it('should return null for valid chronological order', () => {
      const submittedAt = new Date('2023-01-01T10:00:00Z');
      const remittedAt = new Date('2023-01-01T10:05:00Z');

      const result = ARDataValidator.validateChronology(submittedAt, remittedAt);
      
      expect(result).toBeNull();
    });

    it('should return null for same timestamp', () => {
      const timestamp = new Date('2023-01-01T10:00:00Z');

      const result = ARDataValidator.validateChronology(timestamp, timestamp);
      
      expect(result).toBeNull();
    });

    it('should return alert for reverse chronological order', () => {
      const submittedAt = new Date('2023-01-01T10:05:00Z');
      const remittedAt = new Date('2023-01-01T10:00:00Z');

      const result = ARDataValidator.validateChronology(submittedAt, remittedAt);
      
      expect(result).toEqual({
        type: 'DATA_VALIDATION',
        message: 'Chronological error: remitted before submitted',
        severity: 'HIGH',
        timestamp: expect.any(Date)
      });
    });

    it('should return alert for very small time difference in wrong order', () => {
      const submittedAt = new Date('2023-01-01T10:00:00.001Z');
      const remittedAt = new Date('2023-01-01T10:00:00.000Z');

      const result = ARDataValidator.validateChronology(submittedAt, remittedAt);
      
      expect(result).not.toBeNull();
      expect(result?.type).toBe('DATA_VALIDATION');
    });

    it('should handle edge case of year boundary', () => {
      const submittedAt = new Date('2022-12-31T23:59:59Z');
      const remittedAt = new Date('2023-01-01T00:00:01Z');

      const result = ARDataValidator.validateChronology(submittedAt, remittedAt);
      
      expect(result).toBeNull();
    });

    it('should handle leap year dates correctly', () => {
      const submittedAt = new Date('2024-02-29T10:00:00Z'); // Leap year
      const remittedAt = new Date('2024-03-01T10:00:00Z');

      const result = ARDataValidator.validateChronology(submittedAt, remittedAt);
      
      expect(result).toBeNull();
    });
  });

  describe('validateAmountReconciliation', () => {
    it('should return null for perfectly reconciled amounts', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        100.00, // adjudicated billed
        80.00,  // paid
        15.00,  // patient share
        5.00,   // not allowed
        'claim-123',
        'medicare'
      );

      expect(result).toBeNull();
    });

    it('should return null for amounts within tolerance', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        100.00, // adjudicated billed
        80.00,  // paid
        15.00,  // patient share
        4.99,   // not allowed (creates 0.01 difference)
        'claim-123',
        'medicare'
      );

      expect(result).toBeNull();
    });

    it('should return null for amounts at tolerance boundary', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        100.00, // adjudicated billed
        80.00,  // paid
        15.00,  // patient share
        5.00,   // not allowed (creates exactly 0.00 difference)
        'claim-123',
        'medicare'
      );

      expect(result).toBeNull();
    });

    it('should return alert for amounts exceeding tolerance', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        100.00, // adjudicated billed
        80.00,  // paid
        15.00,  // patient share
        4.90,   // not allowed (creates 0.10 difference, > 0.03 tolerance)
        'claim-123',
        'medicare'
      );

      expect(result).toEqual({
        type: 'DATA_VALIDATION',
        payerId: 'medicare',
        message: 'Amount reconciliation error for claim claim-123: adjudicated billed $100.00 vs accounted $99.90',
        severity: 'MEDIUM',
        timestamp: expect.any(Date)
      });
    });

    it('should handle zero amounts correctly', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        0.00, // adjudicated billed
        0.00, // paid
        0.00, // patient share
        0.00, // not allowed
        'claim-zero',
        'anthem'
      );

      expect(result).toBeNull();
    });

    it('should handle fully denied claims correctly', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        100.00, // adjudicated billed
        0.00,   // paid
        0.00,   // patient share
        100.00, // not allowed (full denial)
        'claim-denied',
        'united_health_group'
      );

      expect(result).toBeNull();
    });

    it('should handle patient-only responsibility correctly', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        100.00, // adjudicated billed
        0.00,   // paid
        100.00, // patient share (deductible not met)
        0.00,   // not allowed
        'claim-patient-pay',
        'medicare'
      );

      expect(result).toBeNull();
    });

    it('should handle very large amounts', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        999999.99, // adjudicated billed
        800000.00, // paid
        150000.00, // patient share
        49999.99,  // not allowed
        'claim-large',
        'anthem'
      );

      expect(result).toBeNull();
    });

    it('should handle floating point precision errors', () => {
      // Common floating point precision issue: 0.1 + 0.2 = 0.30000000000000004
      const result = ARDataValidator.validateAmountReconciliation(
        0.30, // adjudicated billed
        0.10, // paid
        0.20, // patient share (0.1 + 0.2 in floating point)
        0.00, // not allowed
        'claim-float',
        'medicare'
      );

      expect(result).toBeNull(); // Should be within tolerance
    });

    it('should detect significant reconciliation errors', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        100.00, // adjudicated billed
        50.00,  // paid
        25.00,  // patient share
        15.00,  // not allowed (total = 90.00, missing 10.00)
        'claim-error',
        'anthem'
      );

      expect(result).not.toBeNull();
      expect(result?.severity).toBe('MEDIUM');
      expect(result?.message).toContain('$100.00 vs accounted $90.00');
    });

    it('should detect over-accounting errors', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        100.00, // adjudicated billed
        60.00,  // paid
        30.00,  // patient share
        20.00,  // not allowed (total = 110.00, over by 10.00)
        'claim-over',
        'medicare'
      );

      expect(result).not.toBeNull();
      expect(result?.message).toContain('$100.00 vs accounted $110.00');
    });

    it('should handle negative amounts gracefully', () => {
      // Although negative amounts shouldn't occur in normal flow, the validator should handle them
      const result = ARDataValidator.validateAmountReconciliation(
        -50.00, // negative adjudicated billed
        -30.00, // negative paid
        -20.00, // negative patient share
        0.00,   // not allowed
        'claim-negative',
        'medicare'
      );

      expect(result).toBeNull(); // Still reconciles
    });

    it('should include claim and payer information in alerts', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        100.00,
        50.00,
        25.00,
        20.00, // Creates 5.00 difference
        'special-claim-id-999',
        'special-payer-xyz'
      );

      expect(result).not.toBeNull();
      expect(result?.payerId).toBe('special-payer-xyz');
      expect(result?.message).toContain('special-claim-id-999');
    });
  });

  describe('validateBilledAmountConsistency', () => {
    // This method doesn't return a value in the current implementation
    // but we should test that it doesn't throw errors
    it('should not throw error for consistent amounts', () => {
      expect(() => {
        ARDataValidator.validateBilledAmountConsistency(
          100.00,
          100.00,
          'claim-123'
        );
      }).not.toThrow();
    });

    it('should not throw error for inconsistent amounts', () => {
      expect(() => {
        ARDataValidator.validateBilledAmountConsistency(
          100.00,
          90.00,
          'claim-123'
        );
      }).not.toThrow();
    });

    it('should handle zero amounts', () => {
      expect(() => {
        ARDataValidator.validateBilledAmountConsistency(
          0.00,
          0.00,
          'claim-zero'
        );
      }).not.toThrow();
    });

    it('should handle negative amounts', () => {
      expect(() => {
        ARDataValidator.validateBilledAmountConsistency(
          -50.00,
          -45.00,
          'claim-negative'
        );
      }).not.toThrow();
    });

    it('should handle very large amounts', () => {
      expect(() => {
        ARDataValidator.validateBilledAmountConsistency(
          999999.99,
          888888.88,
          'claim-large'
        );
      }).not.toThrow();
    });

    it('should handle null/undefined claim ID gracefully', () => {
      expect(() => {
        ARDataValidator.validateBilledAmountConsistency(
          100.00,
          100.00,
          null as any
        );
      }).not.toThrow();

      expect(() => {
        ARDataValidator.validateBilledAmountConsistency(
          100.00,
          100.00,
          undefined as any
        );
      }).not.toThrow();
    });

    it('should handle floating point precision', () => {
      expect(() => {
        ARDataValidator.validateBilledAmountConsistency(
          0.1 + 0.2, // 0.30000000000000004
          0.3,
          'claim-float'
        );
      }).not.toThrow();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle extreme date differences', () => {
      const veryOldDate = new Date('1900-01-01T00:00:00Z');
      const futureDate = new Date('2100-12-31T23:59:59Z');

      // Old submitted, future remitted - should be valid
      let result = ARDataValidator.validateChronology(veryOldDate, futureDate);
      expect(result).toBeNull();

      // Future submitted, old remitted - should be invalid
      result = ARDataValidator.validateChronology(futureDate, veryOldDate);
      expect(result).not.toBeNull();
    });

    it('should handle invalid Date objects', () => {
      const invalidDate = new Date('invalid-date');
      const validDate = new Date('2023-01-01T10:00:00Z');

      // Should not throw, but may return unexpected results
      expect(() => {
        ARDataValidator.validateChronology(invalidDate, validDate);
      }).not.toThrow();

      expect(() => {
        ARDataValidator.validateChronology(validDate, invalidDate);
      }).not.toThrow();
    });

    it('should handle extreme monetary amounts', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER / 2,
        Number.MAX_SAFE_INTEGER / 4,
        Number.MAX_SAFE_INTEGER / 4,
        'claim-max',
        'medicare'
      );

      expect(result).toBeNull();
    });

    it('should handle very precise decimal amounts', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        123.456789, // adjudicated billed
        98.765432,  // paid
        12.345678,  // patient share
        12.345679,  // not allowed (creates tiny difference)
        'claim-precise',
        'anthem'
      );

      expect(result).toBeNull(); // Should be within tolerance
    });

    it('should handle NaN values gracefully', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        NaN,
        80.00,
        15.00,
        5.00,
        'claim-nan',
        'medicare'
      );

      // NaN comparisons always return false, so Math.abs(NaN - value) > tolerance is false
      // Therefore no alert is generated (the implementation handles NaN gracefully by not alerting)
      expect(result).toBeNull();
    });

    it('should handle Infinity values', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        Infinity,
        Infinity,
        0,
        0,
        'claim-infinity',
        'medicare'
      );

      expect(result).toBeNull(); // Infinity - Infinity = NaN, but NaN > 0.03 is false
    });

    it('should handle mixed positive and negative amounts', () => {
      // Scenario: adjustment or reversal where some amounts are negative
      const result = ARDataValidator.validateAmountReconciliation(
        50.00,  // adjudicated billed (positive)
        -20.00, // paid (negative - reversal)
        30.00,  // patient share (positive)
        40.00,  // not allowed (positive)
        'claim-mixed',
        'anthem'
      );

      expect(result).toBeNull(); // -20 + 30 + 40 = 50
    });

    it('should validate claim data with boundary values', () => {
      const boundaryRecord: ARClaimRecord = {
        correlationId: '',  // Empty string
        claimId: 'a',      // Single character
        payerId: '1',      // Single character
        patientId: 'patient',
        submittedAt: new Date(0), // Epoch time
        billedAmount: Number.MIN_VALUE, // Smallest positive number
        isOutstanding: true
      };

      // Empty correlation ID should still pass (not validated by this function)
      // Single character claimId should pass validation
      const result = ARDataValidator.validateClaimData(boundaryRecord);
      expect(result).toBe(true); // Single character claimId should pass
    });

    it('should handle Unicode characters in claim and payer IDs', () => {
      const result = ARDataValidator.validateAmountReconciliation(
        100.00,
        80.00,
        15.00,
        4.00, // Creates 1.00 difference
        'claim-测试-🏥',
        'payer-αβγ-موثق'
      );

      expect(result).not.toBeNull();
      expect(result?.message).toContain('claim-测试-🏥');
      expect(result?.payerId).toBe('payer-αβγ-موثق');
    });
  });
});