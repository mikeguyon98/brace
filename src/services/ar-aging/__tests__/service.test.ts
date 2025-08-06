import { ARAgingService } from '../service';

describe('ARAgingService', () => {
  let arAgingService: ARAgingService;

  beforeEach(() => {
    arAgingService = new ARAgingService(5);
  });

  afterEach(() => {
    arAgingService.stop();
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      expect(arAgingService).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      const customService = new ARAgingService(10, {
        criticalAgeMinutes: 2
      });
      expect(customService).toBeDefined();
      customService.stop();
    });
  });

  describe('getCriticalClaims', () => {
    it('should return empty array when no claims exist', () => {
      const criticalClaims = arAgingService.getCriticalClaims();
      expect(criticalClaims).toEqual([]);
    });
  });

  describe('getClaimStateStats', () => {
    it('should return stats object', () => {
      const stats = arAgingService.getClaimStateStats();
      expect(stats).toBeDefined();
      expect(typeof stats.outstanding).toBe('number');
    });
  });

  describe('Alert Threshold Management', () => {
    it('should get current alert thresholds', () => {
      const thresholds = arAgingService.getAlertThresholds();
      expect(thresholds).toBeDefined();
      expect(typeof thresholds.criticalAgeMinutes).toBe('number');
    });

    it('should update alert thresholds', () => {
      const newThresholds = {
        criticalAgeMinutes: 5,
        highVolumeThreshold: 150,
        payerDelayThreshold: 3
      };

      arAgingService.updateAlertThresholds(newThresholds);
      
      const current = arAgingService.getAlertThresholds();
      expect(current.criticalAgeMinutes).toBe(5);
    });
  });

  describe('Service Lifecycle', () => {
    it('should stop service without throwing', () => {
      expect(() => {
        arAgingService.stop();
      }).not.toThrow();
    });
  });

  describe('Report Generation', () => {
    it('should generate aging report', () => {
      const report = arAgingService.generateAgingReport();
      expect(report).toBeDefined();
      expect(Array.isArray(report)).toBe(true);
    });

    it('should print formatted report without throwing', () => {
      expect(() => {
        arAgingService.printFormattedReport();
      }).not.toThrow();
    });
  });
});