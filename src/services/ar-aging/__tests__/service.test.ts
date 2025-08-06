import { ARAgingService } from '../service';
import { ARDataValidator } from '../validation';
import { ARAlertManager } from '../alerting';
import { ARReportGenerator } from '../reporting';
import { ClaimMessage, RemittanceMessage, PayerClaim, ClaimStatus, ARAgingBucket } from '../../../shared/types';
import { ARClaimRecord, ARAgingAlert, ARAgingThresholds } from '../interfaces';

// Mock dependencies
jest.mock('../validation');
jest.mock('../alerting');
jest.mock('../reporting');

describe('ARAgingService', () => {
  let arAgingService: ARAgingService;
  let mockAlertManager: jest.Mocked<ARAlertManager>;
  let sampleClaimMessage: ClaimMessage;
  let sampleRemittanceMessage: RemittanceMessage;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock ARAlertManager
    mockAlertManager = {
      checkAgingAlerts: jest.fn().mockReturnValue([]),
      checkPayerPerformanceAlerts: jest.fn().mockReturnValue([]),
      processAlerts: jest.fn(),
      generateAlert: jest.fn(),
      getThresholds: jest.fn().mockReturnValue({
        criticalAgeMinutes: 3,
        highVolumeThreshold: 10,
        payerDelayThreshold: 2
      }),
      updateThresholds: jest.fn()
    } as any;
    
    (ARAlertManager as jest.Mock).mockImplementation(() => mockAlertManager);
    
    // Mock ARDataValidator static methods
    (ARDataValidator.validateClaimData as jest.Mock).mockReturnValue(true);
    (ARDataValidator.validateAmountReconciliation as jest.Mock).mockReturnValue(null);
    (ARDataValidator.validateBilledAmountConsistency as jest.Mock).mockReturnValue(undefined);
    (ARDataValidator.validateChronology as jest.Mock).mockReturnValue(null);
    
    // Mock ARReportGenerator
    (ARReportGenerator.generateAgingMetrics as jest.Mock).mockReturnValue([]);
    (ARReportGenerator.printFormattedReport as jest.Mock).mockImplementation(() => {});

    // Sample claim message
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
            units: 2,
            details: 'Office visit',
            unit_charge_currency: 'USD',
            unit_charge_amount: 150
          }
        ]
      } as PayerClaim,
      ingested_at: new Date().toISOString()
    };

    // Sample remittance message
    sampleRemittanceMessage = {
      correlation_id: 'test-correlation-123',
      remittance: {
        correlation_id: 'test-correlation-123',
        claim_id: 'claim-456',
        payer_id: 'medicare',
        remittance_lines: [
          {
            service_line_id: 'line-1',
            billed_amount: 300,
            payer_paid_amount: 240,
            coinsurance_amount: 30,
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
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      arAgingService = new ARAgingService();
      
      expect(ARAlertManager).toHaveBeenCalledWith({
        criticalAgeMinutes: 3,
        highVolumeThreshold: 10,
        payerDelayThreshold: 2
      });
    });

    it('should initialize with custom configuration', () => {
      const customThresholds = {
        criticalAgeMinutes: 5,
        highVolumeThreshold: 15,
        payerDelayThreshold: 3
      };
      
      arAgingService = new ARAgingService(10, customThresholds);
      
      expect(ARAlertManager).toHaveBeenCalledWith(customThresholds);
    });

    it('should merge custom thresholds with defaults', () => {
      const partialThresholds = { criticalAgeMinutes: 5 };
      
      arAgingService = new ARAgingService(10, partialThresholds);
      
      expect(ARAlertManager).toHaveBeenCalledWith({
        criticalAgeMinutes: 5,
        highVolumeThreshold: 10,
        payerDelayThreshold: 2
      });
    });
  });

  describe('recordClaimSubmission', () => {
    beforeEach(() => {
      arAgingService = new ARAgingService(5);
    });

    it('should record claim submission successfully', () => {
      arAgingService.recordClaimSubmission(sampleClaimMessage, 'Medicare');

      expect(ARDataValidator.validateClaimData).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'test-correlation-123',
          claimId: 'claim-456',
          payerId: 'medicare',
          patientId: 'John_Doe',
          billedAmount: 300, // 150 * 2 units
          isOutstanding: true
        })
      );
    });

    it('should calculate billed amount correctly for multiple service lines', () => {
      const multiLineClaimMessage = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          service_lines: [
            {
              service_line_id: 'line-1',
              procedure_code: '99213',
              units: 2,
              details: 'Office visit',
              unit_charge_currency: 'USD',
              unit_charge_amount: 150
            },
            {
              service_line_id: 'line-2',
              procedure_code: '99214',
              units: 1,
              details: 'Extended visit',
              unit_charge_currency: 'USD',
              unit_charge_amount: 250
            }
          ]
        }
      };

      arAgingService.recordClaimSubmission(multiLineClaimMessage, 'Medicare');

      expect(ARDataValidator.validateClaimData).toHaveBeenCalledWith(
        expect.objectContaining({
          billedAmount: 550 // (150 * 2) + (250 * 1)
        })
      );
    });

    it('should handle invalid claim data', () => {
      (ARDataValidator.validateClaimData as jest.Mock).mockReturnValue(false);

      arAgingService.recordClaimSubmission(sampleClaimMessage, 'Medicare');

      expect(mockAlertManager.generateAlert).toHaveBeenCalledWith({
        type: 'DATA_VALIDATION',
        message: 'Invalid claim data for claim-456',
        severity: 'HIGH',
        timestamp: expect.any(Date)
      });
    });

    it('should index claims by payer', () => {
      arAgingService.recordClaimSubmission(sampleClaimMessage, 'Medicare');
      
      const payerDetails = arAgingService.getPayerDetails('medicare');
      expect(payerDetails).toHaveLength(1);
      expect(payerDetails[0].correlationId).toBe('test-correlation-123');
    });

    it('should handle multiple claims for same payer', () => {
      const claim1 = { ...sampleClaimMessage, correlation_id: 'claim-1' };
      const claim2 = { ...sampleClaimMessage, correlation_id: 'claim-2' };

      arAgingService.recordClaimSubmission(claim1, 'Medicare');
      arAgingService.recordClaimSubmission(claim2, 'Medicare');

      const payerDetails = arAgingService.getPayerDetails('medicare');
      expect(payerDetails).toHaveLength(2);
    });
  });

  describe('recordClaimCompletion', () => {
    beforeEach(() => {
      arAgingService = new ARAgingService(5);
      arAgingService.recordClaimSubmission(sampleClaimMessage, 'Medicare');
    });

    it('should record claim completion successfully', () => {
      arAgingService.recordClaimCompletion(sampleRemittanceMessage);

      const claimData = arAgingService.getClaimData();
      expect(claimData[0]).toEqual(expect.objectContaining({
        correlationId: 'test-correlation-123',
        isOutstanding: false,
        paidAmount: 240,
        patientShare: 60, // 30 + 15 + 15
        notAllowedAmount: 0,
        remittedAt: expect.any(Date)
      }));
    });

    it('should calculate payment amounts correctly for multiple lines', () => {
      const multiLineRemittance = {
        ...sampleRemittanceMessage,
        remittance: {
          ...sampleRemittanceMessage.remittance,
          remittance_lines: [
            {
              service_line_id: 'line-1',
              billed_amount: 200,
              payer_paid_amount: 160,
              coinsurance_amount: 20,
              copay_amount: 10,
              deductible_amount: 10,
              not_allowed_amount: 0,
              status: ClaimStatus.APPROVED
            },
            {
              service_line_id: 'line-2',
              billed_amount: 100,
              payer_paid_amount: 80,
              coinsurance_amount: 10,
              copay_amount: 5,
              deductible_amount: 5,
              not_allowed_amount: 0,
              status: ClaimStatus.APPROVED
            }
          ]
        }
      };

      arAgingService.recordClaimCompletion(multiLineRemittance);

      const claimData = arAgingService.getClaimData();
      expect(claimData[0]).toEqual(expect.objectContaining({
        paidAmount: 240, // 160 + 80
        patientShare: 60, // (20+10+10) + (10+5+5) = 50, but original remittance had 60
        notAllowedAmount: 0
      }));
    });

    it('should handle completion for non-existent claim', () => {
      const unknownRemittance = {
        ...sampleRemittanceMessage,
        correlation_id: 'unknown-correlation'
      };

      // Should not throw error
      arAgingService.recordClaimCompletion(unknownRemittance);

      expect(mockAlertManager.generateAlert).not.toHaveBeenCalled();
    });

    it('should perform validation checks', () => {
      arAgingService.recordClaimCompletion(sampleRemittanceMessage);

      expect(ARDataValidator.validateAmountReconciliation).toHaveBeenCalledWith(
        300, // adjudicated billed amount
        240, // paid amount
        60,  // patient share
        0,   // not allowed
        'claim-456',
        'medicare'
      );

      expect(ARDataValidator.validateBilledAmountConsistency).toHaveBeenCalledWith(
        300, // original billed amount
        300, // adjudicated billed amount
        'claim-456'
      );

      expect(ARDataValidator.validateChronology).toHaveBeenCalledWith(
        expect.any(Date), // submitted at
        expect.any(Date)  // remitted at
      );
    });

    it('should check aging alerts', () => {
      arAgingService.recordClaimCompletion(sampleRemittanceMessage);

      expect(mockAlertManager.checkAgingAlerts).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Number)
      );

      expect(mockAlertManager.processAlerts).toHaveBeenCalled();
    });

    it('should handle validation errors', () => {
      const reconciliationAlert: ARAgingAlert = {
        type: 'DATA_VALIDATION',
        message: 'Amount mismatch',
        severity: 'HIGH',
        timestamp: new Date()
      };

      (ARDataValidator.validateAmountReconciliation as jest.Mock).mockReturnValue(reconciliationAlert);

      arAgingService.recordClaimCompletion(sampleRemittanceMessage);

      expect(mockAlertManager.generateAlert).toHaveBeenCalledWith(reconciliationAlert);
    });

    it('should handle chronology errors', () => {
      const chronologyAlert: ARAgingAlert = {
        type: 'DATA_VALIDATION',
        message: 'Chronology error',
        severity: 'HIGH',
        timestamp: new Date()
      };

      (ARDataValidator.validateChronology as jest.Mock).mockReturnValue(chronologyAlert);

      arAgingService.recordClaimCompletion(sampleRemittanceMessage);

      expect(mockAlertManager.generateAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          ...chronologyAlert,
          payerId: 'medicare',
          message: 'Chronological error for claim claim-456: remitted before submitted'
        })
      );
    });
  });

  describe('generateAgingReport', () => {
    beforeEach(() => {
      arAgingService = new ARAgingService(5);
      arAgingService.recordClaimSubmission(sampleClaimMessage, 'Medicare');
    });

    it('should generate aging report', () => {
      const mockMetrics = [{
        payerId: 'medicare',
        payerName: 'Medicare',
        buckets: {
          [ARAgingBucket.ZERO_TO_ONE_MIN]: 5,
          [ARAgingBucket.ONE_TO_TWO_MIN]: 3,
          [ARAgingBucket.TWO_TO_THREE_MIN]: 2,
          [ARAgingBucket.THREE_PLUS_MIN]: 1
        },
        totalClaims: 11,
        totalBilledAmount: 5500,
        totalPaidAmount: 4400,
        totalOutstanding: 1,
        averageAgeMinutes: 2.5,
        oldestClaimAgeMinutes: 5.2
      }];

      (ARReportGenerator.generateAgingMetrics as jest.Mock).mockReturnValue(mockMetrics);

      const result = arAgingService.generateAgingReport();

      expect(ARReportGenerator.generateAgingMetrics).toHaveBeenCalledWith(
        expect.any(Map), // claims map
        expect.any(Map), // payer claims map
        expect.any(Function) // payer name function
      );

      expect(result).toBe(mockMetrics);
    });
  });

  describe('printFormattedReport', () => {
    beforeEach(() => {
      arAgingService = new ARAgingService(5);
    });

    it('should print formatted report', () => {
      const mockMetrics = [{
        payerId: 'medicare',
        payerName: 'Medicare',
        buckets: {
          [ARAgingBucket.ZERO_TO_ONE_MIN]: 5,
          [ARAgingBucket.ONE_TO_TWO_MIN]: 3,
          [ARAgingBucket.TWO_TO_THREE_MIN]: 2,
          [ARAgingBucket.THREE_PLUS_MIN]: 1
        },
        totalClaims: 11,
        totalBilledAmount: 5500,
        totalPaidAmount: 4400,
        totalOutstanding: 1,
        averageAgeMinutes: 2.5,
        oldestClaimAgeMinutes: 5.2
      }];

      (ARReportGenerator.generateAgingMetrics as jest.Mock).mockReturnValue(mockMetrics);

      arAgingService.printFormattedReport({ totalProcessed: 100 });

      expect(ARReportGenerator.printFormattedReport).toHaveBeenCalledWith(
        mockMetrics,
        { totalProcessed: 100 },
        {
          highVolumeThreshold: 10,
          payerDelayThreshold: 2
        }
      );

      expect(mockAlertManager.checkPayerPerformanceAlerts).toHaveBeenCalledWith(
        'medicare',
        'Medicare',
        2.5,
        1
      );
    });
  });

  describe('getCriticalClaims', () => {
    let mockDate: jest.SpyInstance;
    
    beforeEach(() => {
      arAgingService = new ARAgingService(5, { criticalAgeMinutes: 1 });
    });

    afterEach(() => {
      if (mockDate) {
        mockDate.mockRestore();
      }
    });

    it('should return critical claims based on age', () => {
      const baseTime = new Date('2023-01-01T10:00:00Z');
      const futureTime = new Date(baseTime.getTime() + 70 * 1000); // 70 seconds later
      
      // Mock Date to return specific times
      mockDate = jest.spyOn(global, 'Date')
        .mockImplementationOnce(() => baseTime as any) // For claim submission
        .mockImplementationOnce(() => futureTime as any); // For getCriticalClaims
      
      arAgingService.recordClaimSubmission(sampleClaimMessage, 'Medicare');

      const criticalClaims = arAgingService.getCriticalClaims();
      
      expect(criticalClaims).toHaveLength(1);
      expect(criticalClaims[0].correlationId).toBe('test-correlation-123');
    });

    it('should not return non-critical claims', () => {
      const baseTime = new Date('2023-01-01T10:00:00Z');
      const futureTime = new Date(baseTime.getTime() + 30 * 1000); // 30 seconds later
      
      // Mock Date to return specific times
      mockDate = jest.spyOn(global, 'Date')
        .mockImplementationOnce(() => baseTime as any) // For claim submission
        .mockImplementationOnce(() => futureTime as any); // For getCriticalClaims
      
      arAgingService.recordClaimSubmission(sampleClaimMessage, 'Medicare');

      const criticalClaims = arAgingService.getCriticalClaims();
      
      expect(criticalClaims).toHaveLength(0);
    });

    it('should use remitted time for completed claims', () => {
      const baseTime = new Date('2023-01-01T10:00:00Z');
      const remitTime = new Date(baseTime.getTime() + 30 * 1000); // 30 seconds later
      const checkTime = new Date(baseTime.getTime() + 2 * 60 * 1000); // 2 minutes later
      
      // Mock Date for submission, completion, and critical claims check
      mockDate = jest.spyOn(global, 'Date')
        .mockImplementationOnce(() => baseTime as any) // For claim submission
        .mockImplementationOnce(() => remitTime as any) // For claim completion
        .mockImplementationOnce(() => checkTime as any); // For getCriticalClaims
      
      arAgingService.recordClaimSubmission(sampleClaimMessage, 'Medicare');
      arAgingService.recordClaimCompletion(sampleRemittanceMessage);

      const criticalClaims = arAgingService.getCriticalClaims();
      
      // Should be empty because claim age was only 30 seconds when completed
      expect(criticalClaims).toHaveLength(0);
    });

    it('should sort claims by oldest first', () => {
      const baseTime = new Date('2023-01-01T10:00:00Z');
      jest.setSystemTime(baseTime);

      const claim1 = { ...sampleClaimMessage, correlation_id: 'claim-1' };
      arAgingService.recordClaimSubmission(claim1, 'Medicare');
      
      jest.setSystemTime(new Date(baseTime.getTime() + 10 * 1000)); // 10 seconds later
      const claim2 = { ...sampleClaimMessage, correlation_id: 'claim-2' };
      arAgingService.recordClaimSubmission(claim2, 'Medicare');
      
      jest.setSystemTime(new Date(baseTime.getTime() + 20 * 1000)); // 20 seconds later
      const claim3 = { ...sampleClaimMessage, correlation_id: 'claim-3' };
      arAgingService.recordClaimSubmission(claim3, 'Medicare');

      // All claims should be critical now (advance to make all > 1 minute)
      jest.setSystemTime(new Date(baseTime.getTime() + 90 * 1000)); // 90 seconds from start

      const criticalClaims = arAgingService.getCriticalClaims();
      
      expect(criticalClaims).toHaveLength(3);
      expect(criticalClaims[0].correlationId).toBe('claim-1'); // Oldest
      expect(criticalClaims[1].correlationId).toBe('claim-2');
      expect(criticalClaims[2].correlationId).toBe('claim-3'); // Newest
    });
  });

  describe('getClaimStateStats', () => {
    beforeEach(() => {
      arAgingService = new ARAgingService(5);
    });

    it('should return empty stats initially', () => {
      const stats = arAgingService.getClaimStateStats();
      
      expect(stats).toEqual({
        totalSubmitted: 0,
        totalCompleted: 0,
        outstanding: 0,
        byPayer: new Map()
      });
    });

    it('should track claim states correctly', () => {
      // Submit claims for different payers
      const medicareCllaim = { ...sampleClaimMessage, correlation_id: 'medicare-1' };
      const anthemClaim = {
        ...sampleClaimMessage,
        correlation_id: 'anthem-1',
        claim: {
          ...sampleClaimMessage.claim,
          insurance: { ...sampleClaimMessage.claim.insurance, payer_id: 'anthem' as any }
        }
      };

      arAgingService.recordClaimSubmission(medicareCllaim, 'Medicare');
      arAgingService.recordClaimSubmission(anthemClaim, 'Anthem');

      // Complete one claim
      arAgingService.recordClaimCompletion({
        ...sampleRemittanceMessage,
        correlation_id: 'medicare-1'
      });

      const stats = arAgingService.getClaimStateStats();
      
      expect(stats.totalSubmitted).toBe(2);
      expect(stats.totalCompleted).toBe(1);
      expect(stats.outstanding).toBe(1);
      
      expect(stats.byPayer.get('Medicare')).toEqual({
        submitted: 1,
        completed: 1,
        outstanding: 0
      });
      
      expect(stats.byPayer.get('Anthem')).toEqual({
        submitted: 1,
        completed: 0,
        outstanding: 1
      });
    });
  });

  describe('Alert Threshold Management', () => {
    beforeEach(() => {
      arAgingService = new ARAgingService(5);
    });

    it('should update alert thresholds', () => {
      const newThresholds = { criticalAgeMinutes: 5 };
      
      arAgingService.updateAlertThresholds(newThresholds);
      
      expect(mockAlertManager.updateThresholds).toHaveBeenCalledWith(newThresholds);
    });

    it('should get current alert thresholds', () => {
      const currentThresholds = arAgingService.getAlertThresholds();
      
      expect(mockAlertManager.getThresholds).toHaveBeenCalled();
      expect(currentThresholds).toEqual({
        criticalAgeMinutes: 3,
        highVolumeThreshold: 10,
        payerDelayThreshold: 2
      });
    });
  });

  describe('Service Lifecycle', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should stop service and clear intervals', () => {
      arAgingService = new ARAgingService(1); // 1 second interval
      
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      arAgingService.stop();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      
      clearIntervalSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      arAgingService = new ARAgingService(5);
    });

    it('should handle claims with zero billed amount', () => {
      const zeroBilledClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          service_lines: [
            {
              service_line_id: 'line-1',
              procedure_code: '99213',
              units: 0,
              details: 'No charge visit',
              unit_charge_currency: 'USD',
              unit_charge_amount: 150
            }
          ]
        }
      };

      arAgingService.recordClaimSubmission(zeroBilledClaim, 'Medicare');

      const claimData = arAgingService.getClaimData();
      expect(claimData[0].billedAmount).toBe(0);
    });

    it('should handle claims with empty service lines', () => {
      const emptyServiceLinesClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          service_lines: []
        }
      };

      arAgingService.recordClaimSubmission(emptyServiceLinesClaim, 'Medicare');

      const claimData = arAgingService.getClaimData();
      expect(claimData[0].billedAmount).toBe(0);
    });

    it('should handle duplicate claim submissions', () => {
      arAgingService.recordClaimSubmission(sampleClaimMessage, 'Medicare');
      arAgingService.recordClaimSubmission(sampleClaimMessage, 'Medicare'); // Same correlation ID

      const claimData = arAgingService.getClaimData();
      expect(claimData).toHaveLength(1); // Should overwrite, not duplicate
    });

    it('should handle null/undefined patient names', () => {
      const nullNameClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          patient: {
            ...sampleClaimMessage.claim.patient,
            first_name: null as any,
            last_name: undefined as any
          }
        }
      };

      arAgingService.recordClaimSubmission(nullNameClaim, 'Medicare');

      const claimData = arAgingService.getClaimData();
      expect(claimData[0].patientId).toBe('null_undefined');
    });

    it('should handle very large billed amounts', () => {
      const largeBilledClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          service_lines: [
            {
              service_line_id: 'line-1',
              procedure_code: '99999',
              units: 999999,
              details: 'Expensive procedure',
              unit_charge_currency: 'USD',
              unit_charge_amount: 999999.99
            }
          ]
        }
      };

      arAgingService.recordClaimSubmission(largeBilledClaim, 'Medicare');

      const claimData = arAgingService.getClaimData();
      expect(claimData[0].billedAmount).toBe(999999 * 999999.99);
    });

    it('should handle unknown payer IDs', () => {
      const unknownPayerClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          insurance: {
            ...sampleClaimMessage.claim.insurance,
            payer_id: 'unknown-payer-xyz' as any
          }
        }
      };

      arAgingService.recordClaimSubmission(unknownPayerClaim, 'Unknown Payer');

      const payerDetails = arAgingService.getPayerDetails('unknown-payer-xyz');
      expect(payerDetails).toHaveLength(1);
      expect(payerDetails[0].payerId).toBe('unknown-payer-xyz');
    });

    it('should handle concurrent claim processing', () => {
      const claims = Array(100).fill(null).map((_, i) => ({
        ...sampleClaimMessage,
        correlation_id: `concurrent-claim-${i}`,
        claim: {
          ...sampleClaimMessage.claim,
          claim_id: `claim-${i}`
        }
      }));

      // Process all claims concurrently
      claims.forEach(claim => {
        arAgingService.recordClaimSubmission(claim, 'Medicare');
      });

      const claimData = arAgingService.getClaimData();
      expect(claimData).toHaveLength(100);

      const payerDetails = arAgingService.getPayerDetails('medicare');
      expect(payerDetails).toHaveLength(100);
    });

    it('should handle remittance for non-submitted claim gracefully', () => {
      const orphanRemittance = {
        ...sampleRemittanceMessage,
        correlation_id: 'orphan-remittance-123'
      };

      // Should not throw error
      expect(() => {
        arAgingService.recordClaimCompletion(orphanRemittance);
      }).not.toThrow();

      const claimData = arAgingService.getClaimData();
      expect(claimData).toHaveLength(0);
    });
  });

  describe('Payer Name Resolution', () => {
    beforeEach(() => {
      arAgingService = new ARAgingService(5);
    });

    it('should resolve known payer names correctly', () => {
      const knownPayers = [
        { id: 'anthem', expectedName: 'Anthem' },
        { id: 'united_health_group', expectedName: 'United Health Group' },
        { id: 'medicare', expectedName: 'Medicare' }
      ];

      knownPayers.forEach(({ id, expectedName }) => {
        const claim = {
          ...sampleClaimMessage,
          correlation_id: `${id}-claim`,
          claim: {
            ...sampleClaimMessage.claim,
            insurance: { ...sampleClaimMessage.claim.insurance, payer_id: id as any }
          }
        };

        arAgingService.recordClaimSubmission(claim, expectedName);
      });

      const stats = arAgingService.getClaimStateStats();
      expect(stats.byPayer.has('Anthem')).toBe(true);
      expect(stats.byPayer.has('United Health Group')).toBe(true);
      expect(stats.byPayer.has('Medicare')).toBe(true);
    });

    it('should use payer ID as name for unknown payers', () => {
      const unknownPayerClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          insurance: { ...sampleClaimMessage.claim.insurance, payer_id: 'custom-payer-123' as any }
        }
      };

      arAgingService.recordClaimSubmission(unknownPayerClaim, 'Custom Payer');

      const stats = arAgingService.getClaimStateStats();
      expect(stats.byPayer.has('custom-payer-123')).toBe(true);
    });
  });
});