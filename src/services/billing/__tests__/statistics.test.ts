import { BillingStatisticsManager } from '../statistics';
import { RemittanceMessage, ClaimStatus } from '../../../shared/types';

describe('BillingStatisticsManager', () => {
  let statisticsManager: BillingStatisticsManager;
  let sampleRemittanceMessage: RemittanceMessage;

  beforeEach(() => {
    statisticsManager = new BillingStatisticsManager();
    
    sampleRemittanceMessage = {
      correlation_id: 'test-correlation-123',
      remittance: {
        correlation_id: 'test-correlation-123',
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
  });

  describe('Constructor', () => {
    it('should initialize with empty statistics', () => {
      const stats = statisticsManager.getAllStats();
      
      expect(stats.totalClaims).toBe(0);
      expect(stats.totalBilledAmount).toBe(0);
      expect(stats.totalPaidAmount).toBe(0);
      expect(stats.totalPatientResponsibility).toBe(0);
      expect(stats.payerBreakdown.size).toBe(0);
      expect(stats.patientCostShares.size).toBe(0);
      expect(stats.processingTimes).toEqual([]);
    });
  });

  describe('processRemittance', () => {
    it('should process single-line remittance correctly', () => {
      const result = statisticsManager.processRemittance(sampleRemittanceMessage, 150);

      expect(result.claimBilledAmount).toBe(100);
      expect(result.claimPaidAmount).toBe(80);
      expect(result.claimPatientResponsibility).toBe(20); // coinsurance + copay + deductible

      const stats = statisticsManager.getAllStats();
      expect(stats.totalClaims).toBe(1);
      expect(stats.totalBilledAmount).toBe(100);
      expect(stats.totalPaidAmount).toBe(80);
      expect(stats.totalPatientResponsibility).toBe(20);
    });

    it('should process multi-line remittance correctly', () => {
      const multiLineRemittance: RemittanceMessage = {
        correlation_id: 'multi-line-123',
        remittance: {
          correlation_id: 'multi-line-123',
          claim_id: 'multi-claim-456',
          payer_id: 'anthem',
          remittance_lines: [
            {
              service_line_id: 'line-1',
              billed_amount: 150,
              payer_paid_amount: 120,
              coinsurance_amount: 15,
              copay_amount: 10,
              deductible_amount: 5,
              not_allowed_amount: 0,
              status: ClaimStatus.APPROVED
            },
            {
              service_line_id: 'line-2',
              billed_amount: 200,
              payer_paid_amount: 180,
              coinsurance_amount: 10,
              copay_amount: 0,
              deductible_amount: 10,
              not_allowed_amount: 0,
              status: ClaimStatus.APPROVED
            }
          ],
          processed_at: new Date().toISOString(),
          overall_status: ClaimStatus.APPROVED
        }
      };

      const result = statisticsManager.processRemittance(multiLineRemittance);

      expect(result.claimBilledAmount).toBe(350); // 150 + 200
      expect(result.claimPaidAmount).toBe(300); // 120 + 180
      expect(result.claimPatientResponsibility).toBe(50); // (15+10+5) + (10+0+10)

      const stats = statisticsManager.getAllStats();
      expect(stats.totalClaims).toBe(1);
      expect(stats.totalBilledAmount).toBe(350);
      expect(stats.totalPaidAmount).toBe(300);
      expect(stats.totalPatientResponsibility).toBe(50);
    });

    it('should handle denied claims with zero payments', () => {
      const deniedRemittance: RemittanceMessage = {
        correlation_id: 'denied-123',
        remittance: {
          correlation_id: 'denied-123',
          claim_id: 'denied-claim-456',
          payer_id: 'united_health_group',
          remittance_lines: [
            {
              service_line_id: 'line-denied',
              billed_amount: 500,
              payer_paid_amount: 0,
              coinsurance_amount: 0,
              copay_amount: 0,
              deductible_amount: 0,
              not_allowed_amount: 500,
              status: ClaimStatus.DENIED
            }
          ],
          processed_at: new Date().toISOString(),
          overall_status: ClaimStatus.DENIED
        }
      };

      const result = statisticsManager.processRemittance(deniedRemittance);

      expect(result.claimBilledAmount).toBe(500);
      expect(result.claimPaidAmount).toBe(0);
      expect(result.claimPatientResponsibility).toBe(0);

      const stats = statisticsManager.getAllStats();
      expect(stats.totalClaims).toBe(1);
      expect(stats.totalBilledAmount).toBe(500);
      expect(stats.totalPaidAmount).toBe(0);
      expect(stats.totalPatientResponsibility).toBe(0);
    });

    it('should track processing times correctly', () => {
      statisticsManager.processRemittance(sampleRemittanceMessage, 100);
      statisticsManager.processRemittance(sampleRemittanceMessage, 200);
      statisticsManager.processRemittance(sampleRemittanceMessage, 150);

      const stats = statisticsManager.getAllStats();
      expect(stats.processingTimes).toEqual([100, 200, 150]);
    });

    it('should limit processing times to 1000 entries', () => {
      // Add 1200 processing times
      for (let i = 1; i <= 1200; i++) {
        statisticsManager.processRemittance(sampleRemittanceMessage, i);
      }

      const stats = statisticsManager.getAllStats();
      expect(stats.processingTimes.length).toBe(1000);
      expect(stats.processingTimes[0]).toBe(201); // First 200 should be removed
      expect(stats.processingTimes[999]).toBe(1200);
    });

    it('should handle missing processing time', () => {
      const result = statisticsManager.processRemittance(sampleRemittanceMessage);

      expect(result.claimBilledAmount).toBe(100);
      
      const stats = statisticsManager.getAllStats();
      expect(stats.processingTimes).toEqual([]);
    });
  });

  describe('Payer Breakdown', () => {
    it('should track payer breakdown correctly', () => {
      // Process claims for different payers
      const medicareRemittance = { ...sampleRemittanceMessage };
      const anthemRemittance = {
        ...sampleRemittanceMessage,
        correlation_id: 'anthem-123',
        remittance: {
          ...sampleRemittanceMessage.remittance,
          correlation_id: 'anthem-123',
          payer_id: 'anthem',
          remittance_lines: [
            {
              service_line_id: 'anthem-line-1',
              billed_amount: 200,
              payer_paid_amount: 160,
              coinsurance_amount: 20,
              copay_amount: 10,
              deductible_amount: 10,
              not_allowed_amount: 0,
              status: ClaimStatus.APPROVED
            }
          ]
        }
      };

      statisticsManager.processRemittance(medicareRemittance);
      statisticsManager.processRemittance(anthemRemittance);

      const stats = statisticsManager.getAllStats();
      expect(stats.payerBreakdown.size).toBe(2);

      const medicareStats = stats.payerBreakdown.get('medicare');
      expect(medicareStats).toEqual({
        claimsCount: 1,
        billedAmount: 100,
        paidAmount: 80
      });

      const anthemStats = stats.payerBreakdown.get('anthem');
      expect(anthemStats).toEqual({
        claimsCount: 1,
        billedAmount: 200,
        paidAmount: 160
      });
    });

    it('should aggregate multiple claims for same payer', () => {
      const claim1 = { ...sampleRemittanceMessage };
      const claim2 = {
        ...sampleRemittanceMessage,
        correlation_id: 'medicare-2',
        remittance: {
          ...sampleRemittanceMessage.remittance,
          correlation_id: 'medicare-2',
          remittance_lines: [
            {
              service_line_id: 'medicare-line-2',
              billed_amount: 300,
              payer_paid_amount: 250,
              coinsurance_amount: 30,
              copay_amount: 10,
              deductible_amount: 10,
              not_allowed_amount: 0,
              status: ClaimStatus.APPROVED
            }
          ]
        }
      };

      statisticsManager.processRemittance(claim1);
      statisticsManager.processRemittance(claim2);

      const medicareStats = statisticsManager.getPayerStats('medicare');
      expect(medicareStats).toEqual({
        claimsCount: 2,
        billedAmount: 400, // 100 + 300
        paidAmount: 330   // 80 + 250
      });
    });

    it('should return undefined for non-existent payer', () => {
      const payerStats = statisticsManager.getPayerStats('non-existent-payer');
      expect(payerStats).toBeUndefined();
    });
  });

  describe('Patient Cost Shares', () => {
    it('should track patient cost shares correctly', () => {
      statisticsManager.processRemittance(sampleRemittanceMessage);

      const stats = statisticsManager.getAllStats();
      expect(stats.patientCostShares.size).toBe(1);

      const patientId = `patient_${sampleRemittanceMessage.correlation_id.slice(-6)}`;
      const costShare = stats.patientCostShares.get(patientId);
      
      expect(costShare).toEqual({
        patient_id: patientId,
        total_copay: 5,
        total_coinsurance: 10,
        total_deductible: 5,
        claim_count: 1
      });
    });

    it('should aggregate cost shares for same patient', () => {
      const claim1 = { ...sampleRemittanceMessage };
      const claim2 = { ...sampleRemittanceMessage, correlation_id: 'different-but-on-123' }; // Same last 6 chars

      statisticsManager.processRemittance(claim1);
      statisticsManager.processRemittance(claim2);

      const patientId = `patient_${sampleRemittanceMessage.correlation_id.slice(-6)}`;
      const costShare = statisticsManager.getPatientCostShare(patientId);
      
      expect(costShare).toEqual({
        patient_id: patientId,
        total_copay: 10,  // 5 + 5
        total_coinsurance: 20, // 10 + 10
        total_deductible: 10,  // 5 + 5
        claim_count: 2
      });
    });

    it('should return undefined for non-existent patient', () => {
      const costShare = statisticsManager.getPatientCostShare('non-existent-patient');
      expect(costShare).toBeUndefined();
    });

    it('should get top patients by total cost share', () => {
      // Create patients with different cost shares
      const patients = [
        { id: 'high-cost-patient-123', copay: 100, coinsurance: 200, deductible: 50 },
        { id: 'low-cost-patient-456', copay: 20, coinsurance: 30, deductible: 10 },
        { id: 'mid-cost-patient-789', copay: 50, coinsurance: 100, deductible: 25 }
      ];

      patients.forEach(patient => {
        const remittance = {
          ...sampleRemittanceMessage,
          correlation_id: patient.id,
          remittance: {
            ...sampleRemittanceMessage.remittance,
            correlation_id: patient.id,
            remittance_lines: [
              {
                service_line_id: 'custom-line',
                billed_amount: 500,
                payer_paid_amount: 150,
                coinsurance_amount: patient.coinsurance,
                copay_amount: patient.copay,
                deductible_amount: patient.deductible,
                not_allowed_amount: 0,
                status: ClaimStatus.APPROVED
              }
            ]
          }
        };
        statisticsManager.processRemittance(remittance);
      });

      const topPatients = statisticsManager.getTopPatients(2);
      
      expect(topPatients.length).toBe(2);
      expect(topPatients[0].patient_id).toBe('patient_nt-123'); // highest total
      expect(topPatients[1].patient_id).toBe('patient_nt-789'); // second highest
    });

    it('should handle empty patient list', () => {
      const topPatients = statisticsManager.getTopPatients(5);
      expect(topPatients).toEqual([]);
    });
  });

  describe('Summary Generation', () => {
    beforeEach(() => {
      // Mock process.uptime for consistent testing
      jest.spyOn(process, 'uptime').mockReturnValue(120); // 2 minutes
      
      // Process some sample data
      statisticsManager.processRemittance(sampleRemittanceMessage, 150);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should generate summary with payment rate calculation', () => {
      const summary = statisticsManager.generateSummary();
      
      expect(summary.totalClaims).toBe(1);
      expect(summary.totalBilledAmount).toBe(100);
      expect(summary.totalPaidAmount).toBe(80);
      expect(summary.totalPatientResponsibility).toBe(20);
      expect(summary.paymentRate).toBe(80); // 80/100 * 100
      expect(summary.averageThroughput).toBe(1/120); // 1 claim / 120 seconds
      expect(summary.systemUptime).toBe(120);
    });

    it('should handle zero billed amount for payment rate', () => {
      const manager = new BillingStatisticsManager();
      const summary = manager.generateSummary();
      
      expect(summary.paymentRate).toBe(0);
      expect(summary.totalClaims).toBe(0);
      expect(summary.averageThroughput).toBe(0);
    });
  });

  describe('System Metrics', () => {
    beforeEach(() => {
      jest.spyOn(process, 'uptime').mockReturnValue(300); // 5 minutes
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should generate system metrics with processing times', () => {
      statisticsManager.processRemittance(sampleRemittanceMessage, 100);
      statisticsManager.processRemittance(sampleRemittanceMessage, 200);
      statisticsManager.processRemittance(sampleRemittanceMessage, 150);

      const metrics = statisticsManager.getSystemMetrics();
      
      expect(metrics.uptime).toBe(300);
      expect(metrics.throughput).toBe(3/300); // 3 claims / 300 seconds
      expect(metrics.averageProcessingTime).toBe(150); // (100+200+150)/3
    });

    it('should handle no processing times', () => {
      const metrics = statisticsManager.getSystemMetrics();
      
      expect(metrics.uptime).toBe(300);
      expect(metrics.throughput).toBe(0);
      expect(metrics.averageProcessingTime).toBeUndefined();
    });
  });

  describe('Data Retrieval and Management', () => {
    it('should get payer breakdown as array', () => {
      statisticsManager.processRemittance(sampleRemittanceMessage);
      
      const payerArray = statisticsManager.getPayerBreakdownArray();
      
      expect(payerArray).toEqual([
        {
          payerId: 'medicare',
          claimsCount: 1,
          billedAmount: 100,
          paidAmount: 80
        }
      ]);
    });

    it('should return deep copy of all statistics', () => {
      statisticsManager.processRemittance(sampleRemittanceMessage);
      
      const stats1 = statisticsManager.getAllStats();
      const stats2 = statisticsManager.getAllStats();
      
      expect(stats1).not.toBe(stats2); // Different object references
      expect(stats1.payerBreakdown).not.toBe(stats2.payerBreakdown);
      expect(stats1.patientCostShares).not.toBe(stats2.patientCostShares);
      expect(stats1.processingTimes).not.toBe(stats2.processingTimes);
      
      // But with same content
      expect(stats1).toEqual(stats2);
    });

    it('should reset all statistics', () => {
      statisticsManager.processRemittance(sampleRemittanceMessage, 100);
      
      let stats = statisticsManager.getAllStats();
      expect(stats.totalClaims).toBe(1);
      expect(stats.processingTimes.length).toBe(1);
      
      statisticsManager.reset();
      
      stats = statisticsManager.getAllStats();
      expect(stats.totalClaims).toBe(0);
      expect(stats.totalBilledAmount).toBe(0);
      expect(stats.totalPaidAmount).toBe(0);
      expect(stats.totalPatientResponsibility).toBe(0);
      expect(stats.payerBreakdown.size).toBe(0);
      expect(stats.patientCostShares.size).toBe(0);
      expect(stats.processingTimes).toEqual([]);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle negative amounts gracefully', () => {
      const negativeAmountRemittance: RemittanceMessage = {
        correlation_id: 'negative-123',
        remittance: {
          correlation_id: 'negative-123',
          claim_id: 'negative-claim',
          payer_id: 'test-payer',
          remittance_lines: [
            {
              service_line_id: 'negative-line',
              billed_amount: -100, // Negative billed amount
              payer_paid_amount: -50,
              coinsurance_amount: -10,
              copay_amount: -5,
              deductible_amount: -5,
              not_allowed_amount: 0,
              status: ClaimStatus.APPROVED
            }
          ],
          processed_at: new Date().toISOString(),
          overall_status: ClaimStatus.APPROVED
        }
      };

      const result = statisticsManager.processRemittance(negativeAmountRemittance);
      
      expect(result.claimBilledAmount).toBe(-100);
      expect(result.claimPaidAmount).toBe(-50);
      expect(result.claimPatientResponsibility).toBe(-20);
      
      const stats = statisticsManager.getAllStats();
      expect(stats.totalBilledAmount).toBe(-100);
      expect(stats.totalPaidAmount).toBe(-50);
    });

    it('should handle very large amounts', () => {
      const largeAmountRemittance: RemittanceMessage = {
        correlation_id: 'large-123',
        remittance: {
          correlation_id: 'large-123',
          claim_id: 'large-claim',
          payer_id: 'big-payer',
          remittance_lines: [
            {
              service_line_id: 'large-line',
              billed_amount: 999999999.99,
              payer_paid_amount: 888888888.88,
              coinsurance_amount: 111111111.11,
              copay_amount: 0,
              deductible_amount: 0,
              not_allowed_amount: 0,
              status: ClaimStatus.APPROVED
            }
          ],
          processed_at: new Date().toISOString(),
          overall_status: ClaimStatus.APPROVED
        }
      };

      const result = statisticsManager.processRemittance(largeAmountRemittance);
      
      expect(result.claimBilledAmount).toBe(999999999.99);
      expect(result.claimPaidAmount).toBe(888888888.88);
      expect(result.claimPatientResponsibility).toBe(111111111.11);
    });

    it('should handle remittance with no lines', () => {
      const emptyRemittance: RemittanceMessage = {
        correlation_id: 'empty-123',
        remittance: {
          correlation_id: 'empty-123',
          claim_id: 'empty-claim',
          payer_id: 'empty-payer',
          remittance_lines: [],
          processed_at: new Date().toISOString(),
          overall_status: ClaimStatus.DENIED
        }
      };

      const result = statisticsManager.processRemittance(emptyRemittance);
      
      expect(result.claimBilledAmount).toBe(0);
      expect(result.claimPaidAmount).toBe(0);
      expect(result.claimPatientResponsibility).toBe(0);
      
      const stats = statisticsManager.getAllStats();
      expect(stats.totalClaims).toBe(1); // Claim count should still increment
    });

    it('should handle extreme processing times', () => {
      const extremeTimes = [0, 1, 999999999, -1, 0.5, Number.MAX_SAFE_INTEGER];
      
      extremeTimes.forEach(time => {
        statisticsManager.processRemittance(sampleRemittanceMessage, time);
      });

      const stats = statisticsManager.getAllStats();
      expect(stats.processingTimes).toEqual(extremeTimes);
    });

    it('should handle patient ID generation edge cases', () => {
      const shortCorrelationId = { ...sampleRemittanceMessage, correlation_id: '12345' }; // Less than 6 chars
      const longCorrelationId = { ...sampleRemittanceMessage, correlation_id: 'very-long-correlation-id-123456789' };

      statisticsManager.processRemittance(shortCorrelationId);
      statisticsManager.processRemittance(longCorrelationId);

      const stats = statisticsManager.getAllStats();
      expect(stats.patientCostShares.size).toBe(2);
      
      // Should handle short IDs gracefully
      expect(Array.from(stats.patientCostShares.keys())).toContain('patient_12345');
      expect(Array.from(stats.patientCostShares.keys())).toContain('patient_456789');
    });
  });
});