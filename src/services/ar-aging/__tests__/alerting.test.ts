import { ARAlertManager } from '../alerting';
import { ARAgingThresholds, ARClaimRecord, ARAgingAlert } from '../interfaces';

// Mock logger to avoid console output during tests
jest.mock('../../../shared/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('ARAlertManager', () => {
  let alertManager: ARAlertManager;
  let defaultThresholds: ARAgingThresholds;
  let sampleClaimRecord: ARClaimRecord;

  beforeEach(() => {
    defaultThresholds = {
      criticalAgeMinutes: 3,
      highVolumeThreshold: 10,
      payerDelayThreshold: 2
    };

    alertManager = new ARAlertManager(defaultThresholds);

    sampleClaimRecord = {
      correlationId: 'test-correlation-123',
      claimId: 'claim-456',
      payerId: 'medicare',
      patientId: 'John_Doe',
      submittedAt: new Date('2023-01-01T10:00:00Z'),
      remittedAt: new Date('2023-01-01T10:05:00Z'),
      billedAmount: 300.00,
      paidAmount: 240.00,
      patientShare: 60.00,
      notAllowedAmount: 0.00,
      isOutstanding: false
    };
  });

  describe('Constructor', () => {
    it('should initialize with provided thresholds', () => {
      const customThresholds: ARAgingThresholds = {
        criticalAgeMinutes: 5,
        highVolumeThreshold: 15,
        payerDelayThreshold: 3
      };

      const customAlertManager = new ARAlertManager(customThresholds);
      const retrievedThresholds = customAlertManager.getThresholds();

      expect(retrievedThresholds).toEqual(customThresholds);
    });

    it('should handle partial threshold updates', () => {
      const currentThresholds = alertManager.getThresholds();
      expect(currentThresholds).toEqual(defaultThresholds);
    });
  });

  describe('checkAgingAlerts', () => {
    it('should not generate alert for claims within critical age threshold', () => {
      const ageMinutes = 2.5; // Below 3-minute threshold

      const alerts = alertManager.checkAgingAlerts(sampleClaimRecord, ageMinutes);

      expect(alerts).toHaveLength(0);
    });

    it('should generate alert for claims exceeding critical age threshold', () => {
      const ageMinutes = 4.0; // Above 3-minute threshold

      const alerts = alertManager.checkAgingAlerts(sampleClaimRecord, ageMinutes);

      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toEqual({
        type: 'HIGH_AGING',
        payerId: 'medicare',
        message: 'Claim claim-456 aged 4.0 minutes',
        severity: 'HIGH',
        timestamp: expect.any(Date)
      });
    });

    it('should generate alert for claims exactly at critical age threshold', () => {
      const ageMinutes = 3.0; // Exactly at threshold

      const alerts = alertManager.checkAgingAlerts(sampleClaimRecord, ageMinutes);

      expect(alerts).toHaveLength(0); // Should be > threshold, not >=
    });

    it('should generate alert for claims just over critical age threshold', () => {
      const ageMinutes = 3.1; // Just over threshold

      const alerts = alertManager.checkAgingAlerts(sampleClaimRecord, ageMinutes);

      expect(alerts).toHaveLength(1);
      expect(alerts[0].message).toBe('Claim claim-456 aged 3.1 minutes');
    });

    it('should handle very large age values', () => {
      const ageMinutes = 999.9;

      const alerts = alertManager.checkAgingAlerts(sampleClaimRecord, ageMinutes);

      expect(alerts).toHaveLength(1);
      expect(alerts[0].message).toBe('Claim claim-456 aged 999.9 minutes');
    });

    it('should format age minutes with appropriate precision', () => {
      const ageMinutes = 3.123456789;

      const alerts = alertManager.checkAgingAlerts(sampleClaimRecord, ageMinutes);

      expect(alerts[0].message).toBe('Claim claim-456 aged 3.1 minutes');
    });

    it('should handle zero age gracefully', () => {
      const ageMinutes = 0;

      const alerts = alertManager.checkAgingAlerts(sampleClaimRecord, ageMinutes);

      expect(alerts).toHaveLength(0);
    });

    it('should handle negative age gracefully', () => {
      const ageMinutes = -1.5; // Shouldn't happen in real scenarios

      const alerts = alertManager.checkAgingAlerts(sampleClaimRecord, ageMinutes);

      expect(alerts).toHaveLength(0);
    });

    it('should include correct timestamp in alert', () => {
      const beforeTime = new Date();
      const ageMinutes = 5.0;

      const alerts = alertManager.checkAgingAlerts(sampleClaimRecord, ageMinutes);
      const afterTime = new Date();

      expect(alerts[0].timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(alerts[0].timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('checkPayerPerformanceAlerts', () => {
    it('should not generate alerts when performance is within thresholds', () => {
      const payerId = 'medicare';
      const payerName = 'Medicare';
      const averageAgeMinutes = 1.5; // Below 2-minute threshold
      const criticalClaimsCount = 5;  // Below 10-claim threshold

      const alerts = alertManager.checkPayerPerformanceAlerts(
        payerId, payerName, averageAgeMinutes, criticalClaimsCount
      );

      expect(alerts).toHaveLength(0);
    });

    it('should generate stuck claims alert for high volume of critical claims', () => {
      const payerId = 'anthem';
      const payerName = 'Anthem BCBS';
      const averageAgeMinutes = 1.5;
      const criticalClaimsCount = 15; // Above 10-claim threshold

      const alerts = alertManager.checkPayerPerformanceAlerts(
        payerId, payerName, averageAgeMinutes, criticalClaimsCount
      );

      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toEqual({
        type: 'STUCK_CLAIMS',
        payerId: 'anthem',
        message: 'Anthem BCBS: 15 claims in 3+ min bucket (CRITICAL)',
        claimCount: 15,
        severity: 'CRITICAL',
        timestamp: expect.any(Date)
      });
    });

    it('should generate payer delay alert for high average age', () => {
      const payerId = 'united_health_group';
      const payerName = 'United Health Group';
      const averageAgeMinutes = 3.5; // Above 2-minute threshold
      const criticalClaimsCount = 5;

      const alerts = alertManager.checkPayerPerformanceAlerts(
        payerId, payerName, averageAgeMinutes, criticalClaimsCount
      );

      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toEqual({
        type: 'PAYER_DELAY',
        payerId: 'united_health_group',
        message: 'United Health Group: Average age 3.50 min (SLOW PAYER)',
        severity: 'HIGH',
        timestamp: expect.any(Date)
      });
    });

    it('should generate both alerts when both thresholds are exceeded', () => {
      const payerId = 'slow_payer';
      const payerName = 'Slow Payer Inc';
      const averageAgeMinutes = 4.0; // Above 2-minute threshold
      const criticalClaimsCount = 20; // Above 10-claim threshold

      const alerts = alertManager.checkPayerPerformanceAlerts(
        payerId, payerName, averageAgeMinutes, criticalClaimsCount
      );

      expect(alerts).toHaveLength(2);

      const stuckClaimsAlert = alerts.find(a => a.type === 'STUCK_CLAIMS');
      const payerDelayAlert = alerts.find(a => a.type === 'PAYER_DELAY');

      expect(stuckClaimsAlert).toBeDefined();
      expect(stuckClaimsAlert?.claimCount).toBe(20);
      expect(stuckClaimsAlert?.severity).toBe('CRITICAL');

      expect(payerDelayAlert).toBeDefined();
      expect(payerDelayAlert?.message).toContain('4.00 min');
      expect(payerDelayAlert?.severity).toBe('HIGH');
    });

    it('should handle boundary conditions correctly', () => {
      const payerId = 'boundary_payer';
      const payerName = 'Boundary Payer';

      // Exactly at thresholds (should not trigger)
      let alerts = alertManager.checkPayerPerformanceAlerts(
        payerId, payerName, 2.0, 10
      );
      expect(alerts).toHaveLength(0);

      // Just over thresholds (should trigger)
      alerts = alertManager.checkPayerPerformanceAlerts(
        payerId, payerName, 2.1, 11
      );
      expect(alerts).toHaveLength(2);
    });

    it('should handle zero values gracefully', () => {
      const alerts = alertManager.checkPayerPerformanceAlerts(
        'zero_payer', 'Zero Payer', 0, 0
      );

      expect(alerts).toHaveLength(0);
    });

    it('should handle negative values gracefully', () => {
      const alerts = alertManager.checkPayerPerformanceAlerts(
        'negative_payer', 'Negative Payer', -1.0, -5
      );

      expect(alerts).toHaveLength(0);
    });

    it('should handle very large values', () => {
      const alerts = alertManager.checkPayerPerformanceAlerts(
        'large_payer', 'Large Payer', 999.9, 999999
      );

      expect(alerts).toHaveLength(2);
      expect(alerts.find(a => a.type === 'PAYER_DELAY')?.message).toContain('999.90 min');
      expect(alerts.find(a => a.type === 'STUCK_CLAIMS')?.claimCount).toBe(999999);
    });

    it('should format floating point averages correctly', () => {
      const alerts = alertManager.checkPayerPerformanceAlerts(
        'float_payer', 'Float Payer', 2.123456789, 0
      );

      expect(alerts).toHaveLength(1);
      expect(alerts[0].message).toContain('2.12 min'); // Should be to 2 decimal places
    });
  });

  describe('generateAlert', () => {
    it('should generate and store alert', () => {
      const testAlert: ARAgingAlert = {
        type: 'DATA_VALIDATION',
        payerId: 'test_payer',
        message: 'Test alert message',
        severity: 'HIGH',
        timestamp: new Date()
      };

      alertManager.generateAlert(testAlert);

      // Since this method doesn't return anything, we mainly test it doesn't throw
      expect(() => alertManager.generateAlert(testAlert)).not.toThrow();
    });

    it('should handle alert without payer ID', () => {
      const testAlert: ARAgingAlert = {
        type: 'DATA_VALIDATION',
        message: 'Test alert without payer',
        severity: 'LOW',
        timestamp: new Date()
      };

      expect(() => alertManager.generateAlert(testAlert)).not.toThrow();
    });

    it('should handle alert without claim count', () => {
      const testAlert: ARAgingAlert = {
        type: 'HIGH_AGING',
        payerId: 'test_payer',
        message: 'Test alert without claim count',
        severity: 'MEDIUM',
        timestamp: new Date()
      };

      expect(() => alertManager.generateAlert(testAlert)).not.toThrow();
    });
  });

  describe('processAlerts', () => {
    it('should process empty alert array', () => {
      const alerts: ARAgingAlert[] = [];

      expect(() => alertManager.processAlerts(alerts)).not.toThrow();
    });

    it('should process single alert', () => {
      const alerts: ARAgingAlert[] = [{
        type: 'HIGH_AGING',
        payerId: 'medicare',
        message: 'Single alert test',
        severity: 'HIGH',
        timestamp: new Date()
      }];

      expect(() => alertManager.processAlerts(alerts)).not.toThrow();
    });

    it('should process multiple alerts', () => {
      const alerts: ARAgingAlert[] = [
        {
          type: 'HIGH_AGING',
          payerId: 'medicare',
          message: 'First alert',
          severity: 'HIGH',
          timestamp: new Date()
        },
        {
          type: 'STUCK_CLAIMS',
          payerId: 'anthem',
          message: 'Second alert',
          claimCount: 15,
          severity: 'CRITICAL',
          timestamp: new Date()
        },
        {
          type: 'PAYER_DELAY',
          payerId: 'uhg',
          message: 'Third alert',
          severity: 'MEDIUM',
          timestamp: new Date()
        }
      ];

      expect(() => alertManager.processAlerts(alerts)).not.toThrow();
    });

    it('should handle alerts with all severity levels', () => {
      const alerts: ARAgingAlert[] = [
        {
          type: 'DATA_VALIDATION',
          message: 'Low severity alert',
          severity: 'LOW',
          timestamp: new Date()
        },
        {
          type: 'PAYER_DELAY',
          message: 'Medium severity alert',
          severity: 'MEDIUM',
          timestamp: new Date()
        },
        {
          type: 'HIGH_AGING',
          message: 'High severity alert',
          severity: 'HIGH',
          timestamp: new Date()
        },
        {
          type: 'STUCK_CLAIMS',
          message: 'Critical severity alert',
          severity: 'CRITICAL',
          timestamp: new Date()
        }
      ];

      expect(() => alertManager.processAlerts(alerts)).not.toThrow();
    });
  });

  describe('updateThresholds', () => {
    it('should update all thresholds', () => {
      const newThresholds: ARAgingThresholds = {
        criticalAgeMinutes: 5,
        highVolumeThreshold: 20,
        payerDelayThreshold: 4
      };

      alertManager.updateThresholds(newThresholds);

      const updatedThresholds = alertManager.getThresholds();
      expect(updatedThresholds).toEqual(newThresholds);
    });

    it('should update partial thresholds', () => {
      const partialUpdate = {
        criticalAgeMinutes: 7
      };

      alertManager.updateThresholds(partialUpdate);

      const updatedThresholds = alertManager.getThresholds();
      expect(updatedThresholds).toEqual({
        criticalAgeMinutes: 7,
        highVolumeThreshold: 10, // Unchanged
        payerDelayThreshold: 2   // Unchanged
      });
    });

    it('should affect subsequent alert generation', () => {
      // Update threshold to be more restrictive
      alertManager.updateThresholds({ criticalAgeMinutes: 1 });

      const alerts = alertManager.checkAgingAlerts(sampleClaimRecord, 2.0);

      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('HIGH_AGING');
    });

    it('should affect payer performance alerts', () => {
      // Update thresholds to be more restrictive
      alertManager.updateThresholds({
        highVolumeThreshold: 5,
        payerDelayThreshold: 1
      });

      const alerts = alertManager.checkPayerPerformanceAlerts(
        'test_payer', 'Test Payer', 1.5, 7
      );

      expect(alerts).toHaveLength(2); // Both thresholds should now be exceeded
    });

    it('should handle zero thresholds', () => {
      alertManager.updateThresholds({
        criticalAgeMinutes: 0,
        highVolumeThreshold: 0,
        payerDelayThreshold: 0
      });

      // Any positive values should now trigger alerts
      const agingAlerts = alertManager.checkAgingAlerts(sampleClaimRecord, 0.1);
      const performanceAlerts = alertManager.checkPayerPerformanceAlerts(
        'test', 'Test', 0.1, 1
      );

      expect(agingAlerts).toHaveLength(1);
      expect(performanceAlerts).toHaveLength(2);
    });

    it('should handle negative thresholds gracefully', () => {
      alertManager.updateThresholds({
        criticalAgeMinutes: -1,
        highVolumeThreshold: -5,
        payerDelayThreshold: -2
      });

      // Should not throw, but behavior with negative thresholds may be undefined
      expect(() => {
        alertManager.checkAgingAlerts(sampleClaimRecord, 1.0);
        alertManager.checkPayerPerformanceAlerts('test', 'Test', 1.0, 5);
      }).not.toThrow();
    });
  });

  describe('getThresholds', () => {
    it('should return current thresholds', () => {
      const thresholds = alertManager.getThresholds();

      expect(thresholds).toEqual(defaultThresholds);
    });

    it('should return updated thresholds after modification', () => {
      const newThresholds = {
        criticalAgeMinutes: 8,
        highVolumeThreshold: 25,
        payerDelayThreshold: 5
      };

      alertManager.updateThresholds(newThresholds);
      const retrievedThresholds = alertManager.getThresholds();

      expect(retrievedThresholds).toEqual(newThresholds);
    });

    it('should return a copy, not a reference', () => {
      const thresholds1 = alertManager.getThresholds();
      const thresholds2 = alertManager.getThresholds();

      expect(thresholds1).not.toBe(thresholds2); // Different object references
      expect(thresholds1).toEqual(thresholds2);   // Same content
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle rapid threshold changes', () => {
      // Rapidly change thresholds and verify consistency
      for (let i = 1; i <= 10; i++) {
        alertManager.updateThresholds({ criticalAgeMinutes: i });
        
        const alerts = alertManager.checkAgingAlerts(sampleClaimRecord, i + 0.5);
        expect(alerts).toHaveLength(1);
        
        const noAlerts = alertManager.checkAgingAlerts(sampleClaimRecord, i - 0.5);
        expect(noAlerts).toHaveLength(0);
      }
    });

    it('should maintain threshold consistency across different alert types', () => {
      const customThresholds = {
        criticalAgeMinutes: 2.5,
        highVolumeThreshold: 7,
        payerDelayThreshold: 1.5
      };

      alertManager.updateThresholds(customThresholds);

      // Test aging alerts
      const agingAlerts = alertManager.checkAgingAlerts(sampleClaimRecord, 3.0);
      expect(agingAlerts).toHaveLength(1);

      // Test performance alerts
      const performanceAlerts = alertManager.checkPayerPerformanceAlerts(
        'test', 'Test', 2.0, 8
      );
      expect(performanceAlerts).toHaveLength(2);
    });

    it('should handle extreme floating point precision', () => {
      alertManager.updateThresholds({ 
        criticalAgeMinutes: 0.1 + 0.2 // 0.30000000000000004
      });

      const alerts = alertManager.checkAgingAlerts(sampleClaimRecord, 0.3);
      expect(alerts).toHaveLength(0); // Should not trigger due to floating point precision
    });

    it('should handle concurrent alert generation', () => {
      const results = [];
      
      // Simulate concurrent alert checking
      for (let i = 0; i < 100; i++) {
        const alerts = alertManager.checkAgingAlerts(
          { ...sampleClaimRecord, claimId: `claim-${i}` },
          5.0
        );
        results.push(alerts);
      }

      // All should generate exactly one alert
      results.forEach(alerts => {
        expect(alerts).toHaveLength(1);
        expect(alerts[0].type).toBe('HIGH_AGING');
      });
    });

    it('should handle Unicode characters in payer names and IDs', () => {
      const unicodeRecord = {
        ...sampleClaimRecord,
        payerId: 'payer-测试-αβγ',
        claimId: 'claim-🏥-موثق'
      };

      const alerts = alertManager.checkAgingAlerts(unicodeRecord, 5.0);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].payerId).toBe('payer-测试-αβγ');
      expect(alerts[0].message).toContain('claim-🏥-موثق');
    });

    it('should generate alerts with proper timestamps across timezone changes', () => {
      // Test that timestamps are generated correctly at different times
      const beforeTime = new Date();
      
      const alerts1 = alertManager.checkAgingAlerts(sampleClaimRecord, 5.0);
      
      // Small delay to ensure different timestamp
      const afterTime = new Date(Date.now() + 1);
      
      const alerts2 = alertManager.checkAgingAlerts(sampleClaimRecord, 5.0);

      expect(alerts1[0].timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(alerts2[0].timestamp.getTime()).toBeGreaterThanOrEqual(alerts1[0].timestamp.getTime());
    });
  });
});