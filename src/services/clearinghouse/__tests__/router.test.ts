import { ClaimRouter } from '../router';
import { InMemoryQueue } from '../../../queue/in-memory-queue';
import { ClaimMessage, PayerClaim } from '../../../shared/types';

describe('ClaimRouter', () => {
  let claimRouter: ClaimRouter;
  let mockPayerQueues: Map<string, InMemoryQueue<ClaimMessage>>;
  let mockPayerConfigs: Map<string, any>;
  let mockMedicareQueue: jest.Mocked<InMemoryQueue<ClaimMessage>>;
  let mockAnthemQueue: jest.Mocked<InMemoryQueue<ClaimMessage>>;
  let sampleClaimMessage: ClaimMessage;

  beforeEach(() => {
    // Create mock queues
    mockMedicareQueue = {
      add: jest.fn(),
      process: jest.fn(),
      getStats: jest.fn().mockReturnValue({ pending: 10, processing: 2 })
    } as any;

    mockAnthemQueue = {
      add: jest.fn(),
      process: jest.fn(),
      getStats: jest.fn().mockReturnValue({ pending: 5, processing: 1 })
    } as any;

    mockPayerQueues = new Map();
    mockPayerQueues.set('medicare', mockMedicareQueue);
    mockPayerQueues.set('anthem', mockAnthemQueue);

    // Create mock payer configurations
    mockPayerConfigs = new Map();
    mockPayerConfigs.set('medicare', {
      name: 'Medicare',
      processing_delay_ms: { min: 100, max: 500 },
      adjudication_rules: { payer_percentage: 0.8 }
    });
    mockPayerConfigs.set('anthem', {
      name: 'Anthem Blue Cross',
      processing_delay_ms: { min: 200, max: 800 },
      adjudication_rules: { payer_percentage: 0.75 }
    });

    claimRouter = new ClaimRouter(mockPayerQueues, mockPayerConfigs);

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
            units: 1,
            details: 'Office visit',
            unit_charge_currency: 'USD',
            unit_charge_amount: 150
          }
        ]
      } as PayerClaim,
      ingested_at: new Date().toISOString()
    };
  });

  describe('Constructor', () => {
    it('should initialize with payer queues and configurations', () => {
      expect(claimRouter).toBeInstanceOf(ClaimRouter);
    });

    it('should handle empty payer configurations', () => {
      const emptyRouter = new ClaimRouter(new Map(), new Map());
      expect(emptyRouter).toBeInstanceOf(ClaimRouter);
    });
  });

  describe('routeClaim', () => {
    it('should route claim to correct payer successfully', async () => {
      const result = await claimRouter.routeClaim(sampleClaimMessage);

      expect(mockMedicareQueue.add).toHaveBeenCalledWith(sampleClaimMessage);
      expect(result).toEqual({
        success: true,
        targetPayerId: 'medicare',
        payerName: 'Medicare',
        queueStats: {
          pending: 10,
          processing: 2
        },
        fallbackUsed: false
      });
    });

    it('should route to different payer when specified', async () => {
      const anthemClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          insurance: {
            payer_id: 'anthem' as any,
            patient_member_id: 'ANT789012'
          }
        }
      };

      const result = await claimRouter.routeClaim(anthemClaim);

      expect(mockAnthemQueue.add).toHaveBeenCalledWith(anthemClaim);
      expect(result).toEqual({
        success: true,
        targetPayerId: 'anthem',
        payerName: 'Anthem Blue Cross',
        queueStats: {
          pending: 5,
          processing: 1
        },
        fallbackUsed: false
      });
    });

    it('should use fallback payer for unknown payer ID', async () => {
      const unknownPayerClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          insurance: {
            payer_id: 'unknown-payer' as any,
            patient_member_id: 'UNK123456'
          }
        }
      };

      const result = await claimRouter.routeClaim(unknownPayerClaim);

      // Should route to first available payer (medicare in this case)
      expect(mockMedicareQueue.add).toHaveBeenCalledWith(unknownPayerClaim);
      expect(result).toEqual({
        success: true,
        targetPayerId: 'medicare',
        payerName: 'Medicare',
        queueStats: {
          pending: 10,
          processing: 2
        },
        fallbackUsed: true
      });
    });

    it('should handle case when no payers are configured', async () => {
      const emptyRouter = new ClaimRouter(new Map(), new Map());

      await expect(emptyRouter.routeClaim(sampleClaimMessage)).rejects.toThrow(
        'Payer queue not found for medicare'
      );
    });

    it('should handle missing queue for configured payer', async () => {
      // Remove the queue but keep the config
      const partialQueues = new Map();
      const partialRouter = new ClaimRouter(partialQueues, mockPayerConfigs);

      await expect(partialRouter.routeClaim(sampleClaimMessage)).rejects.toThrow(
        'Payer queue not found for medicare'
      );
    });

    it('should use payer name from config or fallback to ID', async () => {
      // Test with payer that has no name in config
      const configWithoutName = new Map();
      configWithoutName.set('no-name-payer', {
        processing_delay_ms: { min: 100, max: 500 }
      });
      
      const queueWithoutName = new Map();
      const mockQueue = {
        add: jest.fn(),
        getStats: jest.fn().mockReturnValue({ pending: 0, processing: 0 })
      } as any;
      queueWithoutName.set('no-name-payer', mockQueue);

      const noNameRouter = new ClaimRouter(queueWithoutName, configWithoutName);
      
      const claimWithNoNamePayer = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          insurance: {
            payer_id: 'no-name-payer' as any,
            patient_member_id: 'NONAME123'
          }
        }
      };

      const result = await noNameRouter.routeClaim(claimWithNoNamePayer);

      expect(result.payerName).toBe('no-name-payer'); // Should use payer ID as name
    });
  });

  describe('Payer Validation and Information', () => {
    it('should validate valid payer correctly', () => {
      expect(claimRouter.isValidPayer('medicare')).toBe(true);
      expect(claimRouter.isValidPayer('anthem')).toBe(true);
    });

    it('should validate invalid payer correctly', () => {
      expect(claimRouter.isValidPayer('unknown-payer')).toBe(false);
      expect(claimRouter.isValidPayer('')).toBe(false);
      expect(claimRouter.isValidPayer(null as any)).toBe(false);
    });

    it('should return available payers', () => {
      const availablePayers = claimRouter.getAvailablePayers();
      expect(availablePayers).toContain('medicare');
      expect(availablePayers).toContain('anthem');
      expect(availablePayers.length).toBe(2);
    });

    it('should return empty array when no payers configured', () => {
      const emptyRouter = new ClaimRouter(new Map(), new Map());
      const availablePayers = emptyRouter.getAvailablePayers();
      expect(availablePayers).toEqual([]);
    });

    it('should get payer configuration', () => {
      const medicareConfig = claimRouter.getPayerConfig('medicare');
      expect(medicareConfig).toEqual({
        name: 'Medicare',
        processing_delay_ms: { min: 100, max: 500 },
        adjudication_rules: { payer_percentage: 0.8 }
      });

      const unknownConfig = claimRouter.getPayerConfig('unknown');
      expect(unknownConfig).toBeUndefined();
    });
  });

  describe('Routing Statistics', () => {
    it('should return comprehensive routing statistics', () => {
      const stats = claimRouter.getRoutingStats();

      expect(stats.totalPayers).toBe(2);
      expect(stats.payerStats.size).toBe(2);

      const medicareStats = stats.payerStats.get('medicare');
      expect(medicareStats).toEqual({
        payerName: 'Medicare',
        queueStats: { pending: 10, processing: 2 }
      });

      const anthemStats = stats.payerStats.get('anthem');
      expect(anthemStats).toEqual({
        payerName: 'Anthem Blue Cross',
        queueStats: { pending: 5, processing: 1 }
      });
    });

    it('should handle empty payer queues in statistics', () => {
      const emptyRouter = new ClaimRouter(new Map(), new Map());
      const stats = emptyRouter.getRoutingStats();

      expect(stats.totalPayers).toBe(0);
      expect(stats.payerStats.size).toBe(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle claim with null payer ID', async () => {
      const nullPayerClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          insurance: {
            payer_id: null as any,
            patient_member_id: 'NULL123'
          }
        }
      };

      // Should attempt fallback routing
      const result = await claimRouter.routeClaim(nullPayerClaim);
      
      expect(result.fallbackUsed).toBe(true);
      expect(result.targetPayerId).toBe('medicare'); // First available payer
    });

    it('should handle claim with undefined payer ID', async () => {
      const undefinedPayerClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          insurance: {
            payer_id: undefined as any,
            patient_member_id: 'UNDEF123'
          }
        }
      };

      const result = await claimRouter.routeClaim(undefinedPayerClaim);
      
      expect(result.fallbackUsed).toBe(true);
      expect(result.targetPayerId).toBe('medicare');
    });

    it('should handle queue addition failures', async () => {
      mockMedicareQueue.add.mockRejectedValue(new Error('Queue is full'));

      await expect(claimRouter.routeClaim(sampleClaimMessage)).rejects.toThrow('Queue is full');
    });

    it('should handle queue stats failures', async () => {
      mockMedicareQueue.getStats.mockImplementation(() => {
        throw new Error('Stats unavailable');
      });

      await expect(claimRouter.routeClaim(sampleClaimMessage)).rejects.toThrow('Stats unavailable');
    });

    it('should handle very long payer IDs', async () => {
      const longPayerId = 'a'.repeat(1000);
      const longPayerClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          insurance: {
            payer_id: longPayerId as any,
            patient_member_id: 'LONG123'
          }
        }
      };

      // Should use fallback since long ID won't be in config
      const result = await claimRouter.routeClaim(longPayerClaim);
      
      expect(result.fallbackUsed).toBe(true);
    });

    it('should handle special characters in payer IDs', async () => {
      const specialPayerId = 'payer-with@special#chars$';
      const specialPayerClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          insurance: {
            payer_id: specialPayerId as any,
            patient_member_id: 'SPECIAL123'
          }
        }
      };

      const result = await claimRouter.routeClaim(specialPayerClaim);
      
      expect(result.fallbackUsed).toBe(true);
    });

    it('should handle concurrent routing requests', async () => {
      const promises = Array(100).fill(null).map((_, index) => {
        const concurrentClaim = {
          ...sampleClaimMessage,
          correlation_id: `concurrent-${index}`,
          claim: {
            ...sampleClaimMessage.claim,
            claim_id: `concurrent-claim-${index}`
          }
        };
        return claimRouter.routeClaim(concurrentClaim);
      });

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.targetPayerId).toBe('medicare');
      });

      // All should have been added to the queue
      expect(mockMedicareQueue.add).toHaveBeenCalledTimes(100);
    });

    it('should handle queue stats returning null/undefined', async () => {
      mockMedicareQueue.getStats.mockReturnValue(null as any);

      await expect(claimRouter.routeClaim(sampleClaimMessage)).rejects.toThrow();
    });

    it('should handle malformed claim structure', async () => {
      const malformedClaim = {
        ...sampleClaimMessage,
        claim: null as any
      };

      await expect(claimRouter.routeClaim(malformedClaim)).rejects.toThrow();
    });

    it('should handle missing insurance information', async () => {
      const noInsuranceClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          insurance: null as any
        }
      };

      await expect(claimRouter.routeClaim(noInsuranceClaim)).rejects.toThrow();
    });

    it('should handle fallback when only one payer exists', async () => {
      // Create router with only one payer
      const singlePayerQueues = new Map();
      singlePayerQueues.set('single-payer', mockMedicareQueue);
      
      const singlePayerConfigs = new Map();
      singlePayerConfigs.set('single-payer', { name: 'Single Payer' });
      
      const singlePayerRouter = new ClaimRouter(singlePayerQueues, singlePayerConfigs);
      
      const unknownPayerClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          insurance: {
            payer_id: 'unknown' as any,
            patient_member_id: 'UNKNOWN123'
          }
        }
      };

      const result = await singlePayerRouter.routeClaim(unknownPayerClaim);
      
      expect(result.success).toBe(true);
      expect(result.targetPayerId).toBe('single-payer');
      expect(result.fallbackUsed).toBe(true);
    });
  });
});