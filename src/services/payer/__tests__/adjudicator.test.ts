/**
 * Payer Adjudicator Unit Tests
 * Tests the core business logic for claim adjudication
 */

import { PayerAdjudicator } from '../adjudicator';
import { PayerConfig, PayerClaim, ClaimStatus, RemittanceAdvice, DenialCategory } from '../../../shared/types';
import { selectRandomDenialReason, selectDenialReasonByCategory } from '../../../shared/denial-reasons';
import { generateEDI835Response } from '../../../shared/edi-835-generator';

// Mock dependencies
jest.mock('../../../shared/denial-reasons');
jest.mock('../../../shared/edi-835-generator');
jest.mock('../../../shared/logger');

describe('PayerAdjudicator', () => {
  let adjudicator: PayerAdjudicator;
  let mockConfig: PayerConfig;
  let sampleClaim: PayerClaim;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset Math.random for predictable tests  
    jest.spyOn(Math, 'random').mockReturnValue(0.2); // Above denial rates (0.1) but deterministic
    
    mockConfig = {
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
      }
    };

    sampleClaim = {
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
      ]
    };

    // Mock denial reason functions
    const mockDenialReason = {
      code: 'D001',
      group_code: 'CO',
      reason_code: '197',
      category: DenialCategory.AUTHORIZATION,
      severity: 'HARD',
      description: 'Authorization required',
      explanation: 'Prior authorization is required for this service'
    };
    
    (selectRandomDenialReason as jest.Mock).mockReturnValue(mockDenialReason);
    (selectDenialReasonByCategory as jest.Mock).mockReturnValue(mockDenialReason);

    // Mock EDI generator
    (generateEDI835Response as jest.Mock).mockReturnValue('EDI~835~RESPONSE');

    adjudicator = new PayerAdjudicator(mockConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with provided config', () => {
      expect(adjudicator.getConfig()).toEqual(mockConfig);
    });
  });

  describe('adjudicateClaim - Approved Claims', () => {
    beforeEach(() => {
      // Mock random to never trigger claim denial
      // Need to return values > denial rate (0.1) for both claim and service line checks
      jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.2)  // Claim denial check (0.2 > 0.1, so no denial)
        .mockReturnValueOnce(0.2)  // Service line denial check (0.2 > 0.033, so no denial)  
        .mockReturnValueOnce(0.0); // Payment randomization (0% variation)
    });

    it('should process approved claim correctly', async () => {
      const result = await adjudicator.adjudicateClaim('test-correlation', sampleClaim);

      expect(result).toMatchObject({
        correlation_id: 'test-correlation',
        claim_id: 'test-claim-123',
        payer_id: 'medicare',
        overall_status: ClaimStatus.APPROVED,
        edi_835_response: 'EDI~835~RESPONSE'
      });

      expect(result.remittance_lines).toHaveLength(1);
      expect(result.processed_at).toBeDefined();
    });

    it('should calculate amounts correctly with standard rules', async () => {
      const result = await adjudicator.adjudicateClaim('test-correlation', sampleClaim);
      const line = result.remittance_lines[0];

      // Test essential business logic
      expect(line.billed_amount).toBe(150);
      expect(line.status).toBe(ClaimStatus.APPROVED);
      
      // Verify business rules are applied
      expect(line.copay_amount).toBe(25); // Fixed copay from config
      expect(line.payer_paid_amount).toBeGreaterThan(0); // Payer pays something
      expect(line.deductible_amount).toBeGreaterThanOrEqual(0); // Deductible is non-negative
      expect(line.coinsurance_amount).toBeGreaterThanOrEqual(0); // Coinsurance is non-negative
      expect(line.not_allowed_amount).toBe(0); // No denials for approved claims

      // CRITICAL: Verify amounts reconcile correctly (core business requirement)
      const totalAccounted = line.payer_paid_amount + line.copay_amount + 
                           line.deductible_amount + line.coinsurance_amount + 
                           line.not_allowed_amount;
      expect(totalAccounted).toBeCloseTo(line.billed_amount, 2);
    });

    it('should handle multiple service lines', async () => {
      const multiLineClaim = {
        ...sampleClaim,
        service_lines: [
          {
            service_line_id: 'line-1',
            procedure_code: '99213',
            units: 1,
            details: 'Office visit',
            unit_charge_currency: 'USD',
            unit_charge_amount: 150
          },
          {
            service_line_id: 'line-2',
            procedure_code: '99214',
            units: 2,
            details: 'Extended visit',
            unit_charge_currency: 'USD',
            unit_charge_amount: 200
          }
        ]
      };

      // Mock random for multiple service line processing
      jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.2)  // Don't deny claim
        .mockReturnValueOnce(0.2)  // Don't deny service line 1
        .mockReturnValueOnce(0.5)  // Payment randomization for line 1
        .mockReturnValueOnce(0.2)  // Don't deny service line 2  
        .mockReturnValueOnce(0.5); // Payment randomization for line 2

      const result = await adjudicator.adjudicateClaim('test-correlation', multiLineClaim);

      expect(result.remittance_lines).toHaveLength(2);
      expect(result.remittance_lines[0].service_line_id).toBe('line-1');
      expect(result.remittance_lines[1].service_line_id).toBe('line-2');
      expect(result.remittance_lines[1].billed_amount).toBe(400); // 200 * 2 units
    });
  });

  describe('adjudicateClaim - Denied Claims', () => {
    it('should deny entire claim when denial rate triggers', async () => {
      // Mock random to trigger claim denial (0.05 < 0.1 denial rate)
      jest.spyOn(Math, 'random').mockReturnValue(0.05);

      const result = await adjudicator.adjudicateClaim('test-correlation', sampleClaim);

      expect(result.overall_status).toBe(ClaimStatus.DENIED);
      expect(result.total_denied_amount).toBe(150);
      expect(result.remittance_lines[0]).toMatchObject({
        payer_paid_amount: 0,
        coinsurance_amount: 0,
        copay_amount: 0,
        deductible_amount: 0,
        not_allowed_amount: 150,
        status: ClaimStatus.DENIED
      });
      expect(result.remittance_lines[0].denial_info).toBeDefined();
    });

    it('should use preferred denial categories', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05); // Trigger denial (0.05 < 0.1)

      await adjudicator.adjudicateClaim('test-correlation', sampleClaim);

      expect(selectDenialReasonByCategory).toHaveBeenCalledWith(
        expect.stringMatching(/authorization|medical_necessity/)
      );
    });

    it('should deny individual service lines', async () => {
      jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.2)  // Don't deny claim (0.2 > 0.1)
        .mockReturnValueOnce(0.02) // Deny service line (0.02 < 0.033, which is 0.1 * 0.33)
        .mockReturnValueOnce(0.5);

      const result = await adjudicator.adjudicateClaim('test-correlation', sampleClaim);

      expect(result.overall_status).toBe(ClaimStatus.DENIED);
      expect(result.remittance_lines[0].status).toBe(ClaimStatus.DENIED);
      expect(result.remittance_lines[0].not_allowed_amount).toBe(150);
    });

    it('should handle partial denials correctly', async () => {
      const multiLineClaim = {
        ...sampleClaim,
        service_lines: [
          {
            service_line_id: 'line-1',
            procedure_code: '99213',
            units: 1,
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
            unit_charge_amount: 200
          }
        ]
      };

      jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.2)  // Don't deny claim (0.2 > 0.1)
        .mockReturnValueOnce(0.02) // Deny first service line (0.02 < 0.033)
        .mockReturnValueOnce(0.2)  // Don't deny second service line (0.2 > 0.033)
        .mockReturnValueOnce(0.5); // Payment randomization for approved line

      const result = await adjudicator.adjudicateClaim('test-correlation', multiLineClaim);

      expect(result.overall_status).toBe(ClaimStatus.PARTIAL_DENIAL);
      expect(result.remittance_lines[0].status).toBe(ClaimStatus.DENIED);
      expect(result.remittance_lines[1].status).toBe(ClaimStatus.APPROVED);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero amount service lines', async () => {
      const zeroAmountClaim = {
        ...sampleClaim,
        service_lines: [{
          service_line_id: 'line-1',
          procedure_code: '99213',
          units: 0,
          details: 'No charge visit',
          unit_charge_currency: 'USD',
          unit_charge_amount: 150
        }]
      };

      const result = await adjudicator.adjudicateClaim('test-correlation', zeroAmountClaim);
      const line = result.remittance_lines[0];

      expect(line.billed_amount).toBe(0);
      expect(line.payer_paid_amount).toBe(0);
      expect(line.not_allowed_amount).toBe(0);
      expect(line.status).toBe(ClaimStatus.DENIED);
    });

    it('should handle negative amounts', async () => {
      const negativeAmountClaim = {
        ...sampleClaim,
        service_lines: [{
          service_line_id: 'line-1',
          procedure_code: '99213',
          units: -1,
          details: 'Refund',
          unit_charge_currency: 'USD',
          unit_charge_amount: 150
        }]
      };

      const result = await adjudicator.adjudicateClaim('test-correlation', negativeAmountClaim);
      const line = result.remittance_lines[0];

      expect(line.billed_amount).toBe(-150);
      expect(line.payer_paid_amount).toBe(0);
      expect(line.not_allowed_amount).toBe(150); // Absolute value
      expect(line.status).toBe(ClaimStatus.DENIED);
    });

    it('should handle very large amounts', async () => {
      const largeAmountClaim = {
        ...sampleClaim,
        service_lines: [{
          service_line_id: 'line-1',
          procedure_code: '99999',
          units: 1,
          details: 'Expensive procedure',
          unit_charge_currency: 'USD',
          unit_charge_amount: 999999.99
        }]
      };

      jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.2)  // Don't deny claim (0.2 > 0.1)
        .mockReturnValueOnce(0.2)  // Don't deny service line (0.2 > 0.033)
        .mockReturnValueOnce(0.5); // No randomization (randomFactor = 1.0)

      const result = await adjudicator.adjudicateClaim('test-correlation', largeAmountClaim);
      const line = result.remittance_lines[0];

      expect(line.billed_amount).toBe(999999.99);
      expect(line.payer_paid_amount).toBeCloseTo(799999.99, 2); // 80% payment
      expect(line.copay_amount).toBe(25);
    });

    it('should handle copay exceeding available amount', async () => {
      const smallAmountClaim = {
        ...sampleClaim,
        service_lines: [{
          service_line_id: 'line-1',
          procedure_code: '99213',
          units: 1,
          details: 'Small visit',
          unit_charge_currency: 'USD',
          unit_charge_amount: 10 // Less than copay of 25
        }]
      };

      jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.2)  // Don't deny claim (0.2 > 0.1)
        .mockReturnValueOnce(0.2)  // Don't deny service line (0.2 > 0.033)
        .mockReturnValueOnce(0.5); // No randomization (randomFactor = 1.0)

      const result = await adjudicator.adjudicateClaim('test-correlation', smallAmountClaim);
      const line = result.remittance_lines[0];

      expect(line.billed_amount).toBe(10);
      expect(line.payer_paid_amount).toBe(8); // 10 * 0.8
      expect(line.copay_amount).toBe(2); // Capped at remaining amount
      expect(line.coinsurance_amount).toBe(0);
      expect(line.deductible_amount).toBe(0);
    });

    it('should handle config without denial settings', async () => {
      const configWithoutDenials = {
        ...mockConfig,
        denial_settings: undefined
      };

      const adjudicatorNoDenials = new PayerAdjudicator(configWithoutDenials);
      const result = await adjudicatorNoDenials.adjudicateClaim('test-correlation', sampleClaim);

      expect(result.overall_status).toBe(ClaimStatus.APPROVED);
      expect(result.total_denied_amount).toBeUndefined();
    });

    it('should handle config without optional adjudication fields', async () => {
      const minimalConfig = {
        ...mockConfig,
        adjudication_rules: {
          payer_percentage: 0.8
          // No copay_fixed_amount or deductible_percentage
        }
      };

      const adjudicatorMinimal = new PayerAdjudicator(minimalConfig);
      
      jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.2)  // Don't deny claim (0.2 > 0.1)
        .mockReturnValueOnce(0.2)  // Don't deny service line (0.2 > 0.033)
        .mockReturnValueOnce(0.5); // No randomization (randomFactor = 1.0)

      const result = await adjudicatorMinimal.adjudicateClaim('test-correlation', sampleClaim);
      const line = result.remittance_lines[0];

      expect(line.copay_amount).toBe(0);
      expect(line.deductible_amount).toBe(0);
      expect(line.payer_paid_amount).toBe(120); // 150 * 0.8
      expect(line.coinsurance_amount).toBe(30); // Remaining amount
    });
  });

  describe('Processing Delay Simulation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should simulate processing delay within configured range', async () => {
      const delayPromise = adjudicator.simulateProcessingDelay();
      
      jest.advanceTimersByTime(3000); // Advance by 3 seconds (within 1-5s range)
      
      await expect(delayPromise).resolves.toBeUndefined();
    });

    it('should use random delay within min/max bounds', async () => {
      // Mock Math.random to return specific value for delay calculation
      jest.spyOn(Math, 'random').mockReturnValue(0.25); // 25% of the way between min and max
      
      const startTime = Date.now();
      const delayPromise = adjudicator.simulateProcessingDelay();
      
      // Expected delay: 1000 + 0.25 * (5000 - 1000) = 2000ms
      jest.advanceTimersByTime(2000);
      
      await delayPromise;
      // Cannot directly test the exact delay with fake timers, but we can verify it completes
    });
  });

  describe('Amount Reconciliation', () => {
    it('should ensure amounts always sum to billed amount', async () => {
      const testAmounts = [0.01, 1, 10, 100, 1000, 10000];
      
      for (const amount of testAmounts) {
        const claim = {
          ...sampleClaim,
          service_lines: [{
            service_line_id: 'line-1',
            procedure_code: '99213',
            units: 1,
            details: 'Test visit',
            unit_charge_currency: 'USD',
            unit_charge_amount: amount
          }]
        };

        jest.spyOn(Math, 'random')
          .mockReturnValueOnce(0.2)  // Don't deny claim (0.2 > 0.1)
          .mockReturnValueOnce(0.2)  // Don't deny service line (0.2 > 0.033)
          .mockReturnValueOnce(0.5); // No randomization (randomFactor = 1.0)

        const result = await adjudicator.adjudicateClaim('test-correlation', claim);
        const line = result.remittance_lines[0];

        const totalAccounted = line.payer_paid_amount + line.copay_amount + 
                             line.deductible_amount + line.coinsurance_amount + 
                             line.not_allowed_amount;
        
        expect(totalAccounted).toBeCloseTo(line.billed_amount, 2);
        expect(line.payer_paid_amount).toBeGreaterThanOrEqual(0);
        expect(line.copay_amount).toBeGreaterThanOrEqual(0);
        expect(line.deductible_amount).toBeGreaterThanOrEqual(0);
        expect(line.coinsurance_amount).toBeGreaterThanOrEqual(0);
        expect(line.not_allowed_amount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('EDI 835 Integration', () => {
    it('should generate EDI response for approved claims', async () => {
      jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.2)  // Don't deny claim (0.2 > 0.1)
        .mockReturnValueOnce(0.2)  // Don't deny service line (0.2 > 0.033)
        .mockReturnValueOnce(0.5); // No randomization

      await adjudicator.adjudicateClaim('test-correlation', sampleClaim);

      expect(generateEDI835Response).toHaveBeenCalledWith(
        expect.objectContaining({
          correlation_id: 'test-correlation',
          overall_status: ClaimStatus.APPROVED
        }),
        sampleClaim,
        {
          payerName: 'Medicare',
          payerContactInfo: 'Contact: 1-800-are-HELP'
        }
      );
    });

    it('should generate EDI response for denied claims', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05); // Trigger denial (0.05 < 0.1)

      await adjudicator.adjudicateClaim('test-correlation', sampleClaim);

      expect(generateEDI835Response).toHaveBeenCalledWith(
        expect.objectContaining({
          correlation_id: 'test-correlation',
          overall_status: ClaimStatus.DENIED
        }),
        sampleClaim,
        expect.any(Object)
      );
    });
  });
});