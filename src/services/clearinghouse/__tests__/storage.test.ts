import { ClaimStorage } from '../storage';
import { ClaimMessage, PayerClaim } from '../../../shared/types';

describe('ClaimStorage', () => {
  let claimStorage: ClaimStorage;
  let sampleClaimMessage: ClaimMessage;

  beforeEach(() => {
    claimStorage = new ClaimStorage();
    
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
      ingested_at: '2023-01-01T10:00:00Z'
    };
  });

  describe('Constructor', () => {
    it('should initialize with empty storage', () => {
      const stats = claimStorage.getStorageStats();
      expect(stats.totalStored).toBe(0);
      expect(stats.storageKeys).toEqual([]);
    });
  });

  describe('storeClaim', () => {
    it('should store claim successfully', () => {
      const storedClaim = claimStorage.storeClaim(sampleClaimMessage, 'medicare');
      
      expect(storedClaim).toEqual({
        correlation_id: 'test-correlation-123',
        claim_id: 'claim-456',
        payer_id: 'medicare',
        ingested_at: '2023-01-01T10:00:00Z',
        submitted_at: expect.any(String),
        claim_data: sampleClaimMessage.claim
      });
      
      // Verify submitted_at is a valid ISO string
      expect(new Date(storedClaim.submitted_at).toISOString()).toBe(storedClaim.submitted_at);
    });

    it('should store claims with different payer IDs', () => {
      const medicareStoredClaim = claimStorage.storeClaim(sampleClaimMessage, 'medicare');
      const anthemClaim = { ...sampleClaimMessage, correlation_id: 'anthem-123' };
      const anthemStoredClaim = claimStorage.storeClaim(anthemClaim, 'anthem');
      
      expect(medicareStoredClaim.payer_id).toBe('medicare');
      expect(anthemStoredClaim.payer_id).toBe('anthem');
      
      const stats = claimStorage.getStorageStats();
      expect(stats.totalStored).toBe(2);
    });

    it('should overwrite existing claim with same correlation ID', () => {
      const firstStored = claimStorage.storeClaim(sampleClaimMessage, 'medicare');
      
      // Store again with different payer
      const secondStored = claimStorage.storeClaim(sampleClaimMessage, 'anthem');
      
      expect(secondStored.payer_id).toBe('anthem');
      expect(secondStored.correlation_id).toBe(firstStored.correlation_id);
      
      // Should still have only one stored claim
      const stats = claimStorage.getStorageStats();
      expect(stats.totalStored).toBe(1);
    });

    it('should handle null/undefined payer ID', () => {
      const nullPayerStored = claimStorage.storeClaim(sampleClaimMessage, null as any);
      expect(nullPayerStored.payer_id).toBeNull();
      
      const undefinedPayerStored = claimStorage.storeClaim(
        { ...sampleClaimMessage, correlation_id: 'undefined-payer-123' }, 
        undefined as any
      );
      expect(undefinedPayerStored.payer_id).toBeUndefined();
    });

    it('should handle empty payer ID', () => {
      const emptyPayerStored = claimStorage.storeClaim(sampleClaimMessage, '');
      expect(emptyPayerStored.payer_id).toBe('');
    });
  });

  describe('getClaim', () => {
    beforeEach(() => {
      claimStorage.storeClaim(sampleClaimMessage, 'medicare');
    });

    it('should retrieve stored claim by correlation ID', () => {
      const retrieved = claimStorage.getClaim('test-correlation-123');
      
      expect(retrieved).toEqual({
        correlation_id: 'test-correlation-123',
        claim_id: 'claim-456',
        payer_id: 'medicare',
        ingested_at: '2023-01-01T10:00:00Z',
        submitted_at: expect.any(String),
        claim_data: sampleClaimMessage.claim
      });
    });

    it('should return undefined for non-existent correlation ID', () => {
      const retrieved = claimStorage.getClaim('non-existent-123');
      expect(retrieved).toBeUndefined();
    });

    it('should return undefined for null correlation ID', () => {
      const retrieved = claimStorage.getClaim(null as any);
      expect(retrieved).toBeUndefined();
    });

    it('should return undefined for empty correlation ID', () => {
      const retrieved = claimStorage.getClaim('');
      expect(retrieved).toBeUndefined();
    });

    it('should handle case-sensitive correlation IDs', () => {
      const upperCase = claimStorage.getClaim('TEST-CORRELATION-123');
      const lowerCase = claimStorage.getClaim('test-correlation-123');
      
      expect(upperCase).toBeUndefined();
      expect(lowerCase).toBeDefined();
    });
  });

  describe('getAllClaims', () => {
    it('should return empty array when no claims stored', () => {
      const allClaims = claimStorage.getAllClaims();
      expect(allClaims).toEqual([]);
    });

    it('should return all stored claims', () => {
      const claim1 = { ...sampleClaimMessage, correlation_id: 'claim-1' };
      const claim2 = { ...sampleClaimMessage, correlation_id: 'claim-2' };
      const claim3 = { ...sampleClaimMessage, correlation_id: 'claim-3' };
      
      claimStorage.storeClaim(claim1, 'medicare');
      claimStorage.storeClaim(claim2, 'anthem');
      claimStorage.storeClaim(claim3, 'united_health_group');
      
      const allClaims = claimStorage.getAllClaims();
      expect(allClaims.length).toBe(3);
      expect(allClaims.map(c => c.correlation_id)).toContain('claim-1');
      expect(allClaims.map(c => c.correlation_id)).toContain('claim-2');
      expect(allClaims.map(c => c.correlation_id)).toContain('claim-3');
    });

    it('should return array copy, not reference', () => {
      claimStorage.storeClaim(sampleClaimMessage, 'medicare');
      
      const allClaims1 = claimStorage.getAllClaims();
      const allClaims2 = claimStorage.getAllClaims();
      
      expect(allClaims1).not.toBe(allClaims2);
      expect(allClaims1).toEqual(allClaims2);
    });
  });

  describe('getClaimsByPayer', () => {
    beforeEach(() => {
      const medicareCllaim1 = { ...sampleClaimMessage, correlation_id: 'medicare-1' };
      const medicareCllaim2 = { ...sampleClaimMessage, correlation_id: 'medicare-2' };
      const anthemClaim1 = { ...sampleClaimMessage, correlation_id: 'anthem-1' };
      const anthemClaim2 = { ...sampleClaimMessage, correlation_id: 'anthem-2' };
      
      claimStorage.storeClaim(medicareCllaim1, 'medicare');
      claimStorage.storeClaim(medicareCllaim2, 'medicare');
      claimStorage.storeClaim(anthemClaim1, 'anthem');
      claimStorage.storeClaim(anthemClaim2, 'anthem');
    });

    it('should return claims for specific payer', () => {
      const medicareClaims = claimStorage.getClaimsByPayer('medicare');
      
      expect(medicareClaims.length).toBe(2);
      expect(medicareClaims.every(c => c.payer_id === 'medicare')).toBe(true);
      expect(medicareClaims.map(c => c.correlation_id)).toEqual(['medicare-1', 'medicare-2']);
    });

    it('should return empty array for non-existent payer', () => {
      const unknownClaims = claimStorage.getClaimsByPayer('unknown-payer');
      expect(unknownClaims).toEqual([]);
    });

    it('should return empty array for null payer', () => {
      const nullClaims = claimStorage.getClaimsByPayer(null as any);
      expect(nullClaims).toEqual([]);
    });

    it('should handle case-sensitive payer IDs', () => {
      const lowerCaseClaims = claimStorage.getClaimsByPayer('medicare');
      const upperCaseClaims = claimStorage.getClaimsByPayer('MEDICARE');
      
      expect(lowerCaseClaims.length).toBe(2);
      expect(upperCaseClaims.length).toBe(0);
    });
  });

  describe('getStorageStats', () => {
    it('should return correct statistics for empty storage', () => {
      const stats = claimStorage.getStorageStats();
      
      expect(stats.totalStored).toBe(0);
      expect(stats.storageKeys).toEqual([]);
    });

    it('should return correct statistics after storing claims', () => {
      claimStorage.storeClaim(sampleClaimMessage, 'medicare');
      claimStorage.storeClaim({ ...sampleClaimMessage, correlation_id: 'claim-2' }, 'anthem');
      
      const stats = claimStorage.getStorageStats();
      
      expect(stats.totalStored).toBe(2);
      expect(stats.storageKeys).toContain('test-correlation-123');
      expect(stats.storageKeys).toContain('claim-2');
      expect(stats.storageKeys.length).toBe(2);
    });

    it('should update statistics when claims are removed', () => {
      claimStorage.storeClaim(sampleClaimMessage, 'medicare');
      claimStorage.storeClaim({ ...sampleClaimMessage, correlation_id: 'claim-2' }, 'anthem');
      
      claimStorage.removeClaim('test-correlation-123');
      
      const stats = claimStorage.getStorageStats();
      expect(stats.totalStored).toBe(1);
      expect(stats.storageKeys).toEqual(['claim-2']);
    });
  });

  describe('clear', () => {
    it('should clear all stored claims', () => {
      claimStorage.storeClaim(sampleClaimMessage, 'medicare');
      claimStorage.storeClaim({ ...sampleClaimMessage, correlation_id: 'claim-2' }, 'anthem');
      
      let stats = claimStorage.getStorageStats();
      expect(stats.totalStored).toBe(2);
      
      claimStorage.clear();
      
      stats = claimStorage.getStorageStats();
      expect(stats.totalStored).toBe(0);
      expect(stats.storageKeys).toEqual([]);
      expect(claimStorage.getAllClaims()).toEqual([]);
    });

    it('should allow storing claims after clearing', () => {
      claimStorage.storeClaim(sampleClaimMessage, 'medicare');
      claimStorage.clear();
      
      claimStorage.storeClaim(sampleClaimMessage, 'anthem');
      
      const stats = claimStorage.getStorageStats();
      expect(stats.totalStored).toBe(1);
      
      const retrieved = claimStorage.getClaim('test-correlation-123');
      expect(retrieved?.payer_id).toBe('anthem');
    });
  });

  describe('removeClaim', () => {
    beforeEach(() => {
      claimStorage.storeClaim(sampleClaimMessage, 'medicare');
      claimStorage.storeClaim({ ...sampleClaimMessage, correlation_id: 'claim-2' }, 'anthem');
    });

    it('should remove existing claim and return true', () => {
      const removed = claimStorage.removeClaim('test-correlation-123');
      
      expect(removed).toBe(true);
      
      const stats = claimStorage.getStorageStats();
      expect(stats.totalStored).toBe(1);
      expect(stats.storageKeys).toEqual(['claim-2']);
      
      const retrieved = claimStorage.getClaim('test-correlation-123');
      expect(retrieved).toBeUndefined();
    });

    it('should return false when removing non-existent claim', () => {
      const removed = claimStorage.removeClaim('non-existent-123');
      
      expect(removed).toBe(false);
      
      const stats = claimStorage.getStorageStats();
      expect(stats.totalStored).toBe(2); // Should still have both claims
    });

    it('should handle null correlation ID', () => {
      const removed = claimStorage.removeClaim(null as any);
      expect(removed).toBe(false);
    });

    it('should handle empty correlation ID', () => {
      const removed = claimStorage.removeClaim('');
      expect(removed).toBe(false);
    });
  });

  describe('Edge Cases and Performance', () => {
    it('should handle storing large numbers of claims', () => {
      const claimCount = 10000;
      
      for (let i = 0; i < claimCount; i++) {
        const claim = { ...sampleClaimMessage, correlation_id: `claim-${i}` };
        claimStorage.storeClaim(claim, `payer-${i % 10}`);
      }
      
      const stats = claimStorage.getStorageStats();
      expect(stats.totalStored).toBe(claimCount);
      expect(stats.storageKeys.length).toBe(claimCount);
      
      // Test retrieval performance
      const startTime = Date.now();
      const middleClaim = claimStorage.getClaim('claim-5000');
      const endTime = Date.now();
      
      expect(middleClaim).toBeDefined();
      expect(endTime - startTime).toBeLessThan(100); // Should be fast lookup
    });

    it('should handle very long correlation IDs', () => {
      const longId = 'a'.repeat(10000);
      const longClaim = { ...sampleClaimMessage, correlation_id: longId };
      
      const stored = claimStorage.storeClaim(longClaim, 'medicare');
      expect(stored.correlation_id).toBe(longId);
      
      const retrieved = claimStorage.getClaim(longId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.correlation_id).toBe(longId);
    });

    it('should handle special characters in correlation IDs', () => {
      const specialId = 'claim-!@#$%^&*()_+-={}[]|\\:";\'<>?,./';
      const specialClaim = { ...sampleClaimMessage, correlation_id: specialId };
      
      const stored = claimStorage.storeClaim(specialClaim, 'medicare');
      expect(stored.correlation_id).toBe(specialId);
      
      const retrieved = claimStorage.getClaim(specialId);
      expect(retrieved).toBeDefined();
    });

    it('should handle unicode characters in correlation IDs', () => {
      const unicodeId = 'claim-测试-🏥-αβγ-موثق';
      const unicodeClaim = { ...sampleClaimMessage, correlation_id: unicodeId };
      
      const stored = claimStorage.storeClaim(unicodeClaim, 'medicare');
      expect(stored.correlation_id).toBe(unicodeId);
      
      const retrieved = claimStorage.getClaim(unicodeId);
      expect(retrieved).toBeDefined();
    });

    it('should handle claims with null/undefined claim data', () => {
      const nullClaimMessage = { 
        ...sampleClaimMessage, 
        claim: null as any 
      };
      
      // This should throw an error as the storeClaim method tries to access claim.claim_id
      expect(() => claimStorage.storeClaim(nullClaimMessage, 'medicare')).toThrow();
    });

    it('should handle claims with complex nested data', () => {
      const complexClaim = {
        ...sampleClaimMessage,
        claim: {
          ...sampleClaimMessage.claim,
          service_lines: Array(100).fill(null).map((_, i) => ({
            service_line_id: `line-${i}`,
            procedure_code: `9921${i % 10}`,
            units: i + 1,
            details: `Complex procedure ${i}`,
            unit_charge_currency: 'USD',
            unit_charge_amount: (i + 1) * 50,
            modifiers: [`modifier-${i}`, `alt-modifier-${i}`]
          }))
        }
      };
      
      const stored = claimStorage.storeClaim(complexClaim, 'medicare');
      expect(stored.claim_data.service_lines.length).toBe(100);
      
      const retrieved = claimStorage.getClaim(complexClaim.correlation_id);
      expect(retrieved?.claim_data.service_lines.length).toBe(100);
    });

    it('should maintain data integrity with concurrent operations', () => {
      const promises: Promise<any>[] = [];
      
      // Concurrent stores
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve().then(() => {
            const claim = { ...sampleClaimMessage, correlation_id: `concurrent-${i}` };
            return claimStorage.storeClaim(claim, `payer-${i % 5}`);
          })
        );
      }
      
      // Concurrent retrievals
      for (let i = 0; i < 50; i++) {
        promises.push(
          Promise.resolve().then(() => claimStorage.getClaim(`concurrent-${i}`))
        );
      }
      
      return Promise.all(promises).then(() => {
        const stats = claimStorage.getStorageStats();
        expect(stats.totalStored).toBe(100);
      });
    });

    it('should handle memory cleanup properly', () => {
      // Store and remove many claims to test memory management
      for (let i = 0; i < 1000; i++) {
        const claim = { ...sampleClaimMessage, correlation_id: `temp-${i}` };
        claimStorage.storeClaim(claim, 'medicare');
      }
      
      let stats = claimStorage.getStorageStats();
      expect(stats.totalStored).toBe(1000);
      
      // Remove all claims
      for (let i = 0; i < 1000; i++) {
        claimStorage.removeClaim(`temp-${i}`);
      }
      
      stats = claimStorage.getStorageStats();
      expect(stats.totalStored).toBe(0);
      expect(stats.storageKeys).toEqual([]);
    });
  });
});