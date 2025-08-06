import { ClearinghouseService } from '../service';
import { ClaimStorage } from '../storage';
import { ClaimRouter } from '../router';
import { InMemoryQueue } from '../../../queue/in-memory-queue';
import { ARAgingService } from '../../ar-aging';
import { ClaimMessage, RemittanceMessage, PayerClaim, ClaimStatus } from '../../../shared/types';

// Mock dependencies
jest.mock('../storage');
jest.mock('../router');
jest.mock('../../ar-aging');

describe('ClearinghouseService', () => {
  let clearinghouseService: ClearinghouseService;
  let mockClaimsQueue: InMemoryQueue<ClaimMessage>;
  let mockRemittanceQueue: InMemoryQueue<RemittanceMessage>;
  let mockPayerQueues: Map<string, InMemoryQueue<ClaimMessage>>;
  let mockPayerConfigs: Map<string, any>;
  let mockARAgingService: jest.Mocked<ARAgingService>;
  let mockOnStep3Complete: jest.Mock;
  let mockClaimStorage: jest.Mocked<ClaimStorage>;
  let mockClaimRouter: jest.Mocked<ClaimRouter>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock queues
    mockClaimsQueue = {
      add: jest.fn(),
      process: jest.fn(),
      getStats: jest.fn().mockReturnValue({ pending: 0, processing: 0 })
    } as any;

    mockRemittanceQueue = {
      add: jest.fn(),
      process: jest.fn(),
      getStats: jest.fn().mockReturnValue({ pending: 0, processing: 0 })
    } as any;

    // Create mock payer queues
    mockPayerQueues = new Map();
    const mockPayerQueue = {
      add: jest.fn(),
      process: jest.fn(),
      getStats: jest.fn().mockReturnValue({ pending: 5, processing: 2 })
    } as any;
    mockPayerQueues.set('medicare', mockPayerQueue);
    mockPayerQueues.set('anthem', mockPayerQueue);

    // Create mock payer configs
    mockPayerConfigs = new Map();
    mockPayerConfigs.set('medicare', { name: 'Medicare', processing_delay_ms: { min: 100, max: 500 } });
    mockPayerConfigs.set('anthem', { name: 'Anthem BCBS', processing_delay_ms: { min: 200, max: 800 } });

    // Create mock AR Aging Service
    mockARAgingService = {
      recordClaimSubmission: jest.fn()
    } as any;

    // Create mock callback
    mockOnStep3Complete = jest.fn();

    // Mock ClaimStorage
    mockClaimStorage = {
      storeClaim: jest.fn(),
      getClaim: jest.fn(),
      getAllClaims: jest.fn(),
      getClaimsByPayer: jest.fn(),
      getStorageStats: jest.fn(),
      clear: jest.fn(),
      removeClaim: jest.fn()
    } as any;
    (ClaimStorage as jest.Mock).mockImplementation(() => mockClaimStorage);

    // Mock ClaimRouter
    mockClaimRouter = {
      routeClaim: jest.fn(),
      getRoutingStats: jest.fn(),
      isValidPayer: jest.fn(),
      getAvailablePayers: jest.fn(),
      getPayerConfig: jest.fn()
    } as any;
    (ClaimRouter as jest.Mock).mockImplementation(() => mockClaimRouter);
  });

  describe('Constructor', () => {
    it('should initialize service with all dependencies', () => {
      clearinghouseService = new ClearinghouseService(
        mockClaimsQueue,
        mockRemittanceQueue,
        mockPayerQueues,
        mockPayerConfigs,
        mockARAgingService,
        mockOnStep3Complete
      );

      expect(ClaimStorage).toHaveBeenCalled();
      expect(ClaimRouter).toHaveBeenCalledWith(mockPayerQueues, mockPayerConfigs);
      expect(mockClaimsQueue.process).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should initialize without optional dependencies', () => {
      clearinghouseService = new ClearinghouseService(
        mockClaimsQueue,
        mockRemittanceQueue,
        mockPayerQueues,
        mockPayerConfigs
      );

      expect(ClaimStorage).toHaveBeenCalled();
      expect(ClaimRouter).toHaveBeenCalled();
      expect(mockClaimsQueue.process).toHaveBeenCalled();
    });
  });

  describe('processClaim', () => {
    let sampleClaimMessage: ClaimMessage;
    let mockRoutingResult: any;

    beforeEach(() => {
      clearinghouseService = new ClearinghouseService(
        mockClaimsQueue,
        mockRemittanceQueue,
        mockPayerQueues,
        mockPayerConfigs,
        mockARAgingService,
        mockOnStep3Complete
      );

      sampleClaimMessage = {
        correlation_id: 'test-correlation-123',
        claim: {
          claim_id: 'claim-456',
          place_of_service_code: 11,
          insurance: {
            payer_id: 'medicare' as any,
            patient_member_id: 'MEM123456'
          },
          patient: {
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@example.com',
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
          ]
        } as PayerClaim,
        ingested_at: new Date().toISOString()
      };

      mockRoutingResult = {
        success: true,
        targetPayerId: 'medicare',
        payerName: 'Medicare',
        queueStats: { pending: 5, processing: 2 },
        fallbackUsed: false
      };

      mockClaimRouter.routeClaim.mockResolvedValue(mockRoutingResult);
      mockClaimStorage.storeClaim.mockReturnValue({
        correlation_id: sampleClaimMessage.correlation_id,
        claim_id: sampleClaimMessage.claim.claim_id,
        payer_id: 'medicare',
        ingested_at: sampleClaimMessage.ingested_at,
        submitted_at: new Date().toISOString(),
        claim_data: sampleClaimMessage.claim
      });
      mockClaimStorage.getStorageStats.mockReturnValue({ totalStored: 100, storageKeys: [] });
    });

    it('should process claim successfully', async () => {
      const processor = (mockClaimsQueue.process as jest.Mock).mock.calls[0][0];
      
      await processor({ data: sampleClaimMessage });

      expect(mockClaimRouter.routeClaim).toHaveBeenCalledWith(sampleClaimMessage);
      expect(mockClaimStorage.storeClaim).toHaveBeenCalledWith(sampleClaimMessage, 'medicare');
      expect(mockARAgingService.recordClaimSubmission).toHaveBeenCalledWith(sampleClaimMessage, 'Medicare');
      expect(mockOnStep3Complete).toHaveBeenCalled();
    });

    it('should handle routing failure', async () => {
      mockClaimRouter.routeClaim.mockResolvedValue({ success: false, targetPayerId: 'medicare', payerName: 'Medicare', queueStats: { pending: 0, processing: 0 } });
      
      const processor = (mockClaimsQueue.process as jest.Mock).mock.calls[0][0];
      
      await expect(processor({ data: sampleClaimMessage })).rejects.toThrow('Failed to route claim claim-456');
      
      expect(mockClaimStorage.storeClaim).not.toHaveBeenCalled();
      expect(mockARAgingService.recordClaimSubmission).not.toHaveBeenCalled();
      expect(mockOnStep3Complete).not.toHaveBeenCalled();
    });

    it('should handle missing AR aging service', async () => {
      // Clear previous mock calls
      jest.clearAllMocks();
      clearinghouseService = new ClearinghouseService(
        mockClaimsQueue,
        mockRemittanceQueue,
        mockPayerQueues,
        mockPayerConfigs,
        undefined,
        mockOnStep3Complete
      );

      const processor = (mockClaimsQueue.process as jest.Mock).mock.calls[0][0];
      
      await processor({ data: sampleClaimMessage });

      expect(mockClaimRouter.routeClaim).toHaveBeenCalled();
      expect(mockClaimStorage.storeClaim).toHaveBeenCalled();
      expect(mockOnStep3Complete).toHaveBeenCalled();
      expect(mockARAgingService.recordClaimSubmission).not.toHaveBeenCalled();
    });

    it('should handle missing step completion callback', async () => {
      // Clear previous mock calls
      jest.clearAllMocks();
      clearinghouseService = new ClearinghouseService(
        mockClaimsQueue,
        mockRemittanceQueue,
        mockPayerQueues,
        mockPayerConfigs,
        mockARAgingService
      );

      const processor = (mockClaimsQueue.process as jest.Mock).mock.calls[0][0];
      
      await processor({ data: sampleClaimMessage });

      expect(mockClaimRouter.routeClaim).toHaveBeenCalled();
      expect(mockClaimStorage.storeClaim).toHaveBeenCalled();
      expect(mockARAgingService.recordClaimSubmission).toHaveBeenCalled();
      expect(mockOnStep3Complete).not.toHaveBeenCalled();
    });

    it('should log progress at 10 claim intervals', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const processor = (mockClaimsQueue.process as jest.Mock).mock.calls[0][0];
      
      // Process 10 claims
      for (let i = 0; i < 10; i++) {
        await processor({ data: sampleClaimMessage });
      }

      // Should have logged progress
      expect(logSpy).toHaveBeenCalled();
      
      logSpy.mockRestore();
    });

    it('should log progress at 100 claim intervals', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const processor = (mockClaimsQueue.process as jest.Mock).mock.calls[0][0];
      
      // Process 100 claims
      for (let i = 0; i < 100; i++) {
        await processor({ data: sampleClaimMessage });
      }

      expect(logSpy).toHaveBeenCalled();
      
      logSpy.mockRestore();
    });

    it('should handle routing errors', async () => {
      const routingError = new Error('Routing failed');
      mockClaimRouter.routeClaim.mockRejectedValue(routingError);

      const processor = (mockClaimsQueue.process as jest.Mock).mock.calls[0][0];
      
      await expect(processor({ data: sampleClaimMessage })).rejects.toThrow('Routing failed');
      
      expect(mockClaimStorage.storeClaim).not.toHaveBeenCalled();
    });
  });

  describe('Statistics and Information Retrieval', () => {
    beforeEach(() => {
      clearinghouseService = new ClearinghouseService(
        mockClaimsQueue,
        mockRemittanceQueue,
        mockPayerQueues,
        mockPayerConfigs,
        mockARAgingService,
        mockOnStep3Complete
      );

      mockClaimStorage.getStorageStats.mockReturnValue({ totalStored: 150, storageKeys: [] });
    });

    it('should return service statistics', () => {
      const stats = clearinghouseService.getStats();
      
      expect(stats).toEqual({
        claimsProcessed: 0,
        storedClaimsCount: 150
      });
      expect(mockClaimStorage.getStorageStats).toHaveBeenCalled();
    });

    it('should get stored claim by correlation ID', () => {
      const mockStoredClaim = {
        correlation_id: 'test-123',
        claim_id: 'claim-456',
        payer_id: 'medicare',
        ingested_at: '2023-01-01T00:00:00Z',
        submitted_at: '2023-01-01T00:01:00Z',
        claim_data: {}
      };
      mockClaimStorage.getClaim.mockReturnValue(mockStoredClaim);
      
      const result = clearinghouseService.getStoredClaim('test-123');
      
      expect(mockClaimStorage.getClaim).toHaveBeenCalledWith('test-123');
      expect(result).toBe(mockStoredClaim);
    });

    it('should get all stored claims', () => {
      const mockClaims = [
        { correlation_id: 'test-123', claim_id: 'claim-456', payer_id: 'medicare' },
        { correlation_id: 'test-124', claim_id: 'claim-457', payer_id: 'anthem' }
      ];
      mockClaimStorage.getAllClaims.mockReturnValue(mockClaims as any);
      
      const result = clearinghouseService.getAllStoredClaims();
      
      expect(mockClaimStorage.getAllClaims).toHaveBeenCalled();
      expect(result).toBe(mockClaims);
    });

    it('should get claims by payer', () => {
      const mockPayerClaims = [
        { correlation_id: 'test-123', claim_id: 'claim-456', payer_id: 'medicare' }
      ];
      mockClaimStorage.getClaimsByPayer.mockReturnValue(mockPayerClaims as any);
      
      const result = clearinghouseService.getClaimsByPayer('medicare');
      
      expect(mockClaimStorage.getClaimsByPayer).toHaveBeenCalledWith('medicare');
      expect(result).toBe(mockPayerClaims);
    });

    it('should get routing statistics', () => {
      const mockRoutingStats = {
        totalPayers: 2,
        payerStats: new Map([
          ['medicare', { payerName: 'Medicare', queueStats: { pending: 5, processing: 2 } }]
        ])
      };
      mockClaimRouter.getRoutingStats.mockReturnValue(mockRoutingStats);
      
      const result = clearinghouseService.getRoutingStats();
      
      expect(mockClaimRouter.getRoutingStats).toHaveBeenCalled();
      expect(result).toBe(mockRoutingStats);
    });

    it('should get storage statistics', () => {
      const mockStorageStats = { totalStored: 200, storageKeys: ['test-123', 'test-124'] };
      mockClaimStorage.getStorageStats.mockReturnValue(mockStorageStats);
      
      const result = clearinghouseService.getStorageStats();
      
      expect(mockClaimStorage.getStorageStats).toHaveBeenCalled();
      expect(result).toBe(mockStorageStats);
    });
  });

  describe('Payer Management', () => {
    beforeEach(() => {
      clearinghouseService = new ClearinghouseService(
        mockClaimsQueue,
        mockRemittanceQueue,
        mockPayerQueues,
        mockPayerConfigs
      );
    });

    it('should check if payer is valid', () => {
      mockClaimRouter.isValidPayer.mockReturnValue(true);
      
      const result = clearinghouseService.isValidPayer('medicare');
      
      expect(mockClaimRouter.isValidPayer).toHaveBeenCalledWith('medicare');
      expect(result).toBe(true);
    });

    it('should check if payer is invalid', () => {
      mockClaimRouter.isValidPayer.mockReturnValue(false);
      
      const result = clearinghouseService.isValidPayer('unknown-payer');
      
      expect(mockClaimRouter.isValidPayer).toHaveBeenCalledWith('unknown-payer');
      expect(result).toBe(false);
    });

    it('should get available payers', () => {
      const availablePayers = ['medicare', 'anthem', 'united_health_group'];
      mockClaimRouter.getAvailablePayers.mockReturnValue(availablePayers);
      
      const result = clearinghouseService.getAvailablePayers();
      
      expect(mockClaimRouter.getAvailablePayers).toHaveBeenCalled();
      expect(result).toBe(availablePayers);
    });
  });

  describe('Service Lifecycle', () => {
    beforeEach(() => {
      clearinghouseService = new ClearinghouseService(
        mockClaimsQueue,
        mockRemittanceQueue,
        mockPayerQueues,
        mockPayerConfigs
      );
    });

    it('should stop service and clear storage', () => {
      clearinghouseService.stop();
      
      expect(mockClaimStorage.clear).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      clearinghouseService = new ClearinghouseService(
        mockClaimsQueue,
        mockRemittanceQueue,
        mockPayerQueues,
        mockPayerConfigs,
        mockARAgingService,
        mockOnStep3Complete
      );
    });

    it('should handle claim with fallback routing', async () => {
      const fallbackRoutingResult = {
        success: true,
        targetPayerId: 'medicare',
        payerName: 'Medicare',
        queueStats: { pending: 5, processing: 2 },
        fallbackUsed: true
      };
      mockClaimRouter.routeClaim.mockResolvedValue(fallbackRoutingResult);

      const sampleClaimMessage: ClaimMessage = {
        correlation_id: 'fallback-test',
        claim: {
          claim_id: 'fallback-claim',
          place_of_service_code: 11,
          insurance: {
            payer_id: 'unknown-payer' as any,
            patient_member_id: 'MEM123'
          },
          patient: {
            first_name: 'Jane',
            last_name: 'Doe',
            gender: 'f',
            dob: '1990-01-01'
          },
          organization: { name: 'Test Clinic' },
          rendering_provider: {
            first_name: 'Dr. Bob',
            last_name: 'Wilson',
            npi: '9876543210'
          },
          service_lines: []
        } as PayerClaim,
        ingested_at: new Date().toISOString()
      };

      const processor = (mockClaimsQueue.process as jest.Mock).mock.calls[0][0];
      
      await processor({ data: sampleClaimMessage });

      expect(mockClaimRouter.routeClaim).toHaveBeenCalledWith(sampleClaimMessage);
      expect(mockClaimStorage.storeClaim).toHaveBeenCalledWith(sampleClaimMessage, 'medicare');
      expect(mockARAgingService.recordClaimSubmission).toHaveBeenCalledWith(sampleClaimMessage, 'Medicare');
    });

    it('should handle claim with empty service lines', async () => {
      const emptyServiceLinesClaimMessage: ClaimMessage = {
        correlation_id: 'empty-lines-test',
        claim: {
          claim_id: 'empty-lines-claim',
          place_of_service_code: 11,
          insurance: {
            payer_id: 'medicare' as any,
            patient_member_id: 'MEM456'
          },
          patient: {
            first_name: 'Empty',
            last_name: 'Lines',
            gender: 'm',
            dob: '1985-06-15'
          },
          organization: { name: 'Empty Lines Clinic' },
          rendering_provider: {
            first_name: 'Dr. Empty',
            last_name: 'Service',
            npi: '1111111111'
          },
          service_lines: []
        } as PayerClaim,
        ingested_at: new Date().toISOString()
      };

      mockClaimRouter.routeClaim.mockResolvedValue({
        success: true,
        targetPayerId: 'medicare',
        payerName: 'Medicare',
        queueStats: { pending: 0, processing: 0 }
      });

      const processor = (mockClaimsQueue.process as jest.Mock).mock.calls[0][0];
      
      await processor({ data: emptyServiceLinesClaimMessage });

      expect(mockClaimRouter.routeClaim).toHaveBeenCalledWith(emptyServiceLinesClaimMessage);
      expect(mockClaimStorage.storeClaim).toHaveBeenCalled();
    });

    it('should handle correlation tracking with duplicate correlation IDs', () => {
      const duplicateId = 'duplicate-123';
      
      mockClaimStorage.getClaim.mockReturnValue(undefined);
      
      const result = clearinghouseService.getStoredClaim(duplicateId);
      
      expect(mockClaimStorage.getClaim).toHaveBeenCalledWith(duplicateId);
      expect(result).toBeUndefined();
    });

    it('should handle extremely high claim volume efficiently', async () => {
      const processor = (mockClaimsQueue.process as jest.Mock).mock.calls[0][0];
      
      const sampleClaim: ClaimMessage = {
        correlation_id: 'volume-test',
        claim: {
          claim_id: 'volume-claim',
          place_of_service_code: 11,
          insurance: { payer_id: 'medicare' as any, patient_member_id: 'MEM789' },
          patient: { first_name: 'Volume', last_name: 'Test', gender: 'm', dob: '1975-01-01' },
          organization: { name: 'Volume Clinic' },
          rendering_provider: { first_name: 'Dr. Volume', last_name: 'Test', npi: '2222222222' },
          service_lines: []
        } as PayerClaim,
        ingested_at: new Date().toISOString()
      };

      mockClaimRouter.routeClaim.mockResolvedValue({
        success: true,
        targetPayerId: 'medicare',
        payerName: 'Medicare',
        queueStats: { pending: 1000, processing: 50 }
      });

      // Process 1000 claims rapidly
      const promises = Array(1000).fill(null).map(() => processor({ data: sampleClaim }));
      
      await Promise.all(promises);

      expect(mockClaimRouter.routeClaim).toHaveBeenCalledTimes(1000);
      expect(mockClaimStorage.storeClaim).toHaveBeenCalledTimes(1000);
    });

    it('should handle malformed claim data gracefully', async () => {
      const malformedClaimMessage = {
        correlation_id: 'malformed-123',
        claim: null,
        ingested_at: new Date().toISOString()
      } as any;

      const processor = (mockClaimsQueue.process as jest.Mock).mock.calls[0][0];
      
      await expect(processor({ data: malformedClaimMessage })).rejects.toThrow('Cannot read properties of null');
    });

    it('should handle storage failures gracefully', async () => {
      const sampleClaimMessage: ClaimMessage = {
        correlation_id: 'storage-fail-test',
        claim: {
          claim_id: 'storage-fail-claim',
          place_of_service_code: 11,
          insurance: { payer_id: 'medicare' as any, patient_member_id: 'MEM999' },
          patient: { first_name: 'Storage', last_name: 'Fail', gender: 'f', dob: '1995-01-01' },
          organization: { name: 'Storage Fail Clinic' },
          rendering_provider: { first_name: 'Dr. Storage', last_name: 'Fail', npi: '3333333333' },
          service_lines: []
        } as PayerClaim,
        ingested_at: new Date().toISOString()
      };

      mockClaimRouter.routeClaim.mockResolvedValue({
        success: true,
        targetPayerId: 'medicare',
        payerName: 'Medicare',
        queueStats: { pending: 5, processing: 2 }
      });

      mockClaimStorage.storeClaim.mockImplementation(() => {
        throw new Error('Storage failure');
      });

      const processor = (mockClaimsQueue.process as jest.Mock).mock.calls[0][0];
      
      await expect(processor({ data: sampleClaimMessage })).rejects.toThrow('Storage failure');
    });
  });
});