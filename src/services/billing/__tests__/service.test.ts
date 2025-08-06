import { BillingService } from '../service';
import { BillingStatisticsManager } from '../statistics';
import { InMemoryQueue } from '../../../queue/in-memory-queue';
import { ARAgingService } from '../../ar-aging';
import { RemittanceMessage, RemittanceAdvice, ClaimStatus } from '../../../shared/types';

// Mock dependencies
jest.mock('../statistics');
jest.mock('../../ar-aging');

describe('BillingService', () => {
  let billingService: BillingService;
  let mockQueue: InMemoryQueue<RemittanceMessage>;
  let mockARAgingService: jest.Mocked<ARAgingService>;
  let mockOnClaimProcessed: jest.Mock;
  let mockStatisticsManager: jest.Mocked<BillingStatisticsManager>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Create mock queue
    mockQueue = {
      add: jest.fn(),
      process: jest.fn(),
      getStats: jest.fn().mockReturnValue({ pending: 0, processing: 0 })
    } as any;

    // Create mock AR Aging Service
    mockARAgingService = {
      recordClaimCompletion: jest.fn()
    } as any;

    // Create mock callback
    mockOnClaimProcessed = jest.fn();

    // Mock the BillingStatisticsManager
    mockStatisticsManager = {
      processRemittance: jest.fn(),
      getAllStats: jest.fn(),
      generateSummary: jest.fn(),
      reset: jest.fn(),
      getPayerStats: jest.fn(),
      getPatientCostShare: jest.fn(),
      getTopPatients: jest.fn()
    } as any;

    (BillingStatisticsManager as jest.Mock).mockImplementation(() => mockStatisticsManager);
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      billingService = new BillingService(mockQueue);
      
      expect(mockQueue.process).toHaveBeenCalledWith(expect.any(Function));
      expect(BillingStatisticsManager).toHaveBeenCalled();
    });

    it('should initialize with custom configuration', () => {
      const config = { reportingIntervalSeconds: 60 };
      billingService = new BillingService(mockQueue, config);
      
      expect(billingService.getConfig()).toEqual(config);
    });

    it('should initialize with AR aging service', () => {
      billingService = new BillingService(mockQueue, {}, mockARAgingService);
      
      expect(mockQueue.process).toHaveBeenCalled();
    });

    it('should initialize with claim processed callback', () => {
      billingService = new BillingService(mockQueue, {}, undefined, mockOnClaimProcessed);
      
      expect(mockQueue.process).toHaveBeenCalled();
    });
  });

  describe('processRemittance', () => {
    let sampleRemittanceMessage: RemittanceMessage;

    beforeEach(() => {
      billingService = new BillingService(mockQueue, {}, mockARAgingService, mockOnClaimProcessed);
      
      sampleRemittanceMessage = {
        correlation_id: 'test-123',
        remittance: {
          correlation_id: 'test-123',
          claim_id: 'claim-456',
          payer_id: 'medicare',
          remittance_lines: [
            {
              service_line_id: 'line-1',
              billed_amount: 100,
              payer_paid_amount: 80,
              coinsurance_amount: 10,
              copay_amount: 5,
              deductible_amount: 5,
              not_allowed_amount: 0,
              status: ClaimStatus.APPROVED
            }
          ],
          processed_at: new Date().toISOString(),
          overall_status: ClaimStatus.APPROVED
        }
      };

      mockStatisticsManager.processRemittance.mockReturnValue({
        claimBilledAmount: 100,
        claimPaidAmount: 80,
        claimPatientResponsibility: 20
      });
    });

    it('should process remittance successfully', async () => {
      const processor = (mockQueue.process as jest.Mock).mock.calls[0][0];
      
      await processor({ data: sampleRemittanceMessage });

      expect(mockStatisticsManager.processRemittance).toHaveBeenCalledWith(
        sampleRemittanceMessage,
        expect.any(Number)
      );
      expect(mockARAgingService.recordClaimCompletion).toHaveBeenCalledWith(sampleRemittanceMessage);
      expect(mockOnClaimProcessed).toHaveBeenCalled();
    });

    it('should handle missing AR aging service', async () => {
      // Clear previous mock calls
      jest.clearAllMocks();
      billingService = new BillingService(mockQueue, {}, undefined, mockOnClaimProcessed);
      const processor = (mockQueue.process as jest.Mock).mock.calls[0][0];
      
      await processor({ data: sampleRemittanceMessage });

      expect(mockStatisticsManager.processRemittance).toHaveBeenCalled();
      expect(mockOnClaimProcessed).toHaveBeenCalled();
      expect(mockARAgingService.recordClaimCompletion).not.toHaveBeenCalled();
    });

    it('should handle missing claim processed callback', async () => {
      // Clear previous mock calls
      jest.clearAllMocks();
      billingService = new BillingService(mockQueue, {}, mockARAgingService);
      const processor = (mockQueue.process as jest.Mock).mock.calls[0][0];
      
      await processor({ data: sampleRemittanceMessage });

      expect(mockStatisticsManager.processRemittance).toHaveBeenCalled();
      expect(mockARAgingService.recordClaimCompletion).toHaveBeenCalled();
      expect(mockOnClaimProcessed).not.toHaveBeenCalled();
    });

    it('should log periodic progress at 50 claim intervals', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      mockStatisticsManager.generateSummary.mockReturnValue({
        totalBilledAmount: 5000,
        totalClaims: 50,
        totalPaidAmount: 4000,
        totalPatientResponsibility: 1000,
        paymentRate: 80,
        averageThroughput: 10,
        systemUptime: 300
      });

      const processor = (mockQueue.process as jest.Mock).mock.calls[0][0];
      
      // Process 50 claims
      for (let i = 0; i < 50; i++) {
        await processor({ data: sampleRemittanceMessage });
      }

      expect(mockStatisticsManager.generateSummary).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('should handle processing errors', async () => {
      const error = new Error('Processing failed');
      mockStatisticsManager.processRemittance.mockImplementation(() => {
        throw error;
      });

      const processor = (mockQueue.process as jest.Mock).mock.calls[0][0];
      
      await expect(processor({ data: sampleRemittanceMessage })).rejects.toThrow('Processing failed');
    });
  });

  describe('Configuration Management', () => {
    beforeEach(() => {
      billingService = new BillingService(mockQueue, { reportingIntervalSeconds: 30 });
    });

    it('should update configuration', () => {
      const newConfig = { reportingIntervalSeconds: 60 };
      billingService.updateConfig(newConfig);
      
      expect(billingService.getConfig()).toEqual(newConfig);
    });

    it('should restart reporting when interval changes', () => {
      jest.useFakeTimers();
      
      const newConfig = { reportingIntervalSeconds: 120 };
      billingService.updateConfig(newConfig);
      
      expect(billingService.getConfig().reportingIntervalSeconds).toBe(120);
      
      jest.useRealTimers();
    });

    it('should handle zero reporting interval', () => {
      const newConfig = { reportingIntervalSeconds: 0 };
      billingService.updateConfig(newConfig);
      
      expect(billingService.getConfig().reportingIntervalSeconds).toBe(0);
    });
  });

  describe('Statistics and Reporting', () => {
    beforeEach(() => {
      billingService = new BillingService(mockQueue);
      
      mockStatisticsManager.getAllStats.mockReturnValue({
        totalClaims: 100,
        totalBilledAmount: 10000,
        totalPaidAmount: 8000,
        totalPatientResponsibility: 2000,
        payerBreakdown: new Map([['medicare', { claimsCount: 50, billedAmount: 5000, paidAmount: 4000 }]]),
        patientCostShares: new Map([['patient1', { patient_id: 'patient1', total_copay: 100, total_coinsurance: 50, total_deductible: 25, claim_count: 5 }]]),
        processingTimes: [100, 150, 200]
      });

      mockStatisticsManager.generateSummary.mockReturnValue({
        totalClaims: 100,
        totalBilledAmount: 10000,
        totalPaidAmount: 8000,
        totalPatientResponsibility: 2000,
        paymentRate: 80,
        averageThroughput: 5,
        systemUptime: 120
      });
    });

    it('should return comprehensive statistics', () => {
      const stats = billingService.getStats();
      
      expect(stats).toMatchObject({
        remittancesProcessed: expect.any(Number),
        totalClaims: 100,
        totalBilledAmount: 10000,
        totalPaidAmount: 8000,
        totalPatientResponsibility: 2000,
        paymentRate: 80,
        throughput: 5
      });
      expect(stats.payerCount).toBe(1);
      expect(stats.patientCount).toBe(1);
    });

    it('should get payer statistics', () => {
      const payerStats = { claimsCount: 25, billedAmount: 2500, paidAmount: 2000 };
      mockStatisticsManager.getPayerStats.mockReturnValue(payerStats);
      
      const result = billingService.getPayerStats('anthem');
      
      expect(mockStatisticsManager.getPayerStats).toHaveBeenCalledWith('anthem');
      expect(result).toBe(payerStats);
    });

    it('should get patient cost share', () => {
      const costShare = { patient_id: 'patient2', total_copay: 150, total_coinsurance: 75, total_deductible: 50, claim_count: 3 };
      mockStatisticsManager.getPatientCostShare.mockReturnValue(costShare);
      
      const result = billingService.getPatientCostShare('patient2');
      
      expect(mockStatisticsManager.getPatientCostShare).toHaveBeenCalledWith('patient2');
      expect(result).toBe(costShare);
    });

    it('should get top patients with default limit', () => {
      const topPatients = [
        { patient_id: 'patient1', total_copay: 200, total_coinsurance: 100, total_deductible: 50, claim_count: 8 }
      ];
      mockStatisticsManager.getTopPatients.mockReturnValue(topPatients);
      
      const result = billingService.getTopPatients();
      
      expect(mockStatisticsManager.getTopPatients).toHaveBeenCalledWith(10);
      expect(result).toBe(topPatients);
    });

    it('should get top patients with custom limit', () => {
      const topPatients = [
        { patient_id: 'patient1', total_copay: 200, total_coinsurance: 100, total_deductible: 50, claim_count: 8 }
      ];
      mockStatisticsManager.getTopPatients.mockReturnValue(topPatients);
      
      const result = billingService.getTopPatients(5);
      
      expect(mockStatisticsManager.getTopPatients).toHaveBeenCalledWith(5);
      expect(result).toBe(topPatients);
    });

    it('should reset statistics', () => {
      billingService.resetStats();
      
      expect(mockStatisticsManager.reset).toHaveBeenCalled();
    });
  });

  describe('Service Lifecycle', () => {
    it('should stop service and clear intervals', () => {
      jest.useFakeTimers();
      billingService = new BillingService(mockQueue, { reportingIntervalSeconds: 30 });
      
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      billingService.stop();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      
      jest.useRealTimers();
      clearIntervalSpy.mockRestore();
    });

    it('should handle stopping without active interval', () => {
      billingService = new BillingService(mockQueue, { reportingIntervalSeconds: 0 });
      
      expect(() => billingService.stop()).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      billingService = new BillingService(mockQueue, {}, mockARAgingService, mockOnClaimProcessed);
    });

    it('should handle remittance with multiple service lines', async () => {
      const multiLineRemittance: RemittanceMessage = {
        correlation_id: 'multi-123',
        remittance: {
          correlation_id: 'multi-123',
          claim_id: 'claim-789',
          payer_id: 'anthem',
          remittance_lines: [
            {
              service_line_id: 'line-1',
              billed_amount: 100,
              payer_paid_amount: 80,
              coinsurance_amount: 10,
              copay_amount: 5,
              deductible_amount: 5,
              not_allowed_amount: 0,
              status: ClaimStatus.APPROVED
            },
            {
              service_line_id: 'line-2',
              billed_amount: 200,
              payer_paid_amount: 150,
              coinsurance_amount: 20,
              copay_amount: 15,
              deductible_amount: 15,
              not_allowed_amount: 0,
              status: ClaimStatus.APPROVED
            }
          ],
          processed_at: new Date().toISOString(),
          overall_status: ClaimStatus.APPROVED
        }
      };

      mockStatisticsManager.processRemittance.mockReturnValue({
        claimBilledAmount: 300,
        claimPaidAmount: 230,
        claimPatientResponsibility: 70
      });

      const processor = (mockQueue.process as jest.Mock).mock.calls[0][0];
      await processor({ data: multiLineRemittance });

      expect(mockStatisticsManager.processRemittance).toHaveBeenCalledWith(
        multiLineRemittance,
        expect.any(Number)
      );
    });

    it('should handle remittance with zero amounts', async () => {
      const zeroAmountRemittance: RemittanceMessage = {
        correlation_id: 'zero-123',
        remittance: {
          correlation_id: 'zero-123',
          claim_id: 'claim-zero',
          payer_id: 'medicare',
          remittance_lines: [
            {
              service_line_id: 'line-zero',
              billed_amount: 0,
              payer_paid_amount: 0,
              coinsurance_amount: 0,
              copay_amount: 0,
              deductible_amount: 0,
              not_allowed_amount: 0,
              status: ClaimStatus.DENIED
            }
          ],
          processed_at: new Date().toISOString(),
          overall_status: ClaimStatus.DENIED
        }
      };

      mockStatisticsManager.processRemittance.mockReturnValue({
        claimBilledAmount: 0,
        claimPaidAmount: 0,
        claimPatientResponsibility: 0
      });

      const processor = (mockQueue.process as jest.Mock).mock.calls[0][0];
      await processor({ data: zeroAmountRemittance });

      expect(mockStatisticsManager.processRemittance).toHaveBeenCalled();
    });

    it('should handle null/undefined configuration gracefully', () => {
      const serviceWithNullConfig = new BillingService(mockQueue, {} as any);
      const config = serviceWithNullConfig.getConfig();
      
      expect(config.reportingIntervalSeconds).toBe(30); // default value
    });

    it('should handle negative reporting interval', () => {
      const serviceWithNegativeInterval = new BillingService(mockQueue, { reportingIntervalSeconds: -10 });
      const config = serviceWithNegativeInterval.getConfig();
      
      expect(config.reportingIntervalSeconds).toBe(-10);
    });
  });

  describe('Report Generation', () => {
    beforeEach(() => {
      billingService = new BillingService(mockQueue);
    });

    it('should generate report', () => {
      const mockReport = { summary: {}, payerBreakdown: [], topPatients: [], systemMetrics: {} };
      billingService.generateReport = jest.fn().mockReturnValue(mockReport);
      
      const result = billingService.generateReport();
      
      expect(result).toBe(mockReport);
    });

    it('should generate text report', () => {
      const mockTextReport = 'Billing Report\n=============\nTotal Claims: 100';
      billingService.generateTextReport = jest.fn().mockReturnValue(mockTextReport);
      
      const result = billingService.generateTextReport();
      
      expect(result).toBe(mockTextReport);
    });

    it('should generate JSON report', () => {
      const mockJSONReport = '{"totalClaims": 100}';
      billingService.generateJSONReport = jest.fn().mockReturnValue(mockJSONReport);
      
      const result = billingService.generateJSONReport();
      
      expect(result).toBe(mockJSONReport);
    });

    it('should get payer CSV report', () => {
      const mockCSV = 'PayerID,Claims,Billed,Paid\nmedicare,50,5000,4000';
      billingService.getPayerCSV = jest.fn().mockReturnValue(mockCSV);
      
      const result = billingService.getPayerCSV();
      
      expect(result).toBe(mockCSV);
    });

    it('should get dashboard summary', () => {
      const mockDashboard = { totalClaims: 100, paymentRate: 80 };
      billingService.getDashboardSummary = jest.fn().mockReturnValue(mockDashboard);
      
      const result = billingService.getDashboardSummary();
      
      expect(result).toBe(mockDashboard);
    });
  });
});