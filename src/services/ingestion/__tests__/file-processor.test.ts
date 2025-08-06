/**
 * File Processor Unit Tests
 * Tests file reading, parsing, and validation business logic
 */

import { FileProcessor } from '../file-processor';
import { PayerClaim } from '../../../shared/types';
import { readFileSync } from 'fs';
import { TestDataGenerator } from '../../test-utils';

// Mock fs module
jest.mock('fs');
jest.mock('../../../shared/logger');

const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;

describe('FileProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readClaimsFromFile', () => {
    it('should successfully parse valid claims from file', async () => {
      const validClaim = TestDataGenerator.createPayerClaim();
      const fileContent = `${JSON.stringify(validClaim)}\n${JSON.stringify(validClaim)}`;
      
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await FileProcessor.readClaimsFromFile('/test/file.json');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(validClaim);
      expect(result[1]).toEqual(validClaim);
    });

    it('should handle empty file gracefully', async () => {
      mockReadFileSync.mockReturnValue('');

      const result = await FileProcessor.readClaimsFromFile('/test/empty.json');

      expect(result).toEqual([]);
    });

    it('should handle file with only whitespace', async () => {
      mockReadFileSync.mockReturnValue('   \n  \t  \n   ');

      const result = await FileProcessor.readClaimsFromFile('/test/whitespace.json');

      expect(result).toEqual([]);
    });

    it('should skip invalid JSON lines and continue processing', async () => {
      const validClaim = TestDataGenerator.createPayerClaim();
      const fileContent = [
        JSON.stringify(validClaim),
        'invalid json line',
        JSON.stringify(validClaim),
        '{"incomplete": json',
        JSON.stringify(validClaim)
      ].join('\n');
      
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await FileProcessor.readClaimsFromFile('/test/mixed.json');

      expect(result).toHaveLength(3); // Only valid claims
      expect(result[0]).toEqual(validClaim);
    });

    it('should validate claims and exclude invalid ones', async () => {
      const validClaim = TestDataGenerator.createPayerClaim();
      const invalidClaim = { ...validClaim, claim_id: undefined }; // Missing required field
      
      const fileContent = [
        JSON.stringify(validClaim),
        JSON.stringify(invalidClaim),
        JSON.stringify(validClaim)
      ].join('\n');
      
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await FileProcessor.readClaimsFromFile('/test/validation.json');

      expect(result).toHaveLength(2); // Only valid claims
      expect(result.every(claim => claim.claim_id)).toBe(true);
    });

    it('should handle file read errors', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      await expect(FileProcessor.readClaimsFromFile('/nonexistent/file.json'))
        .rejects.toThrow('File not found');
    });

    it('should process large files efficiently', async () => {
      const validClaim = TestDataGenerator.createPayerClaim();
      const claims = Array(1000).fill(validClaim);
      const fileContent = claims.map(claim => JSON.stringify(claim)).join('\n');
      
      mockReadFileSync.mockReturnValue(fileContent);

      const startTime = performance.now();
      const result = await FileProcessor.readClaimsFromFile('/test/large.json');
      const endTime = performance.now();

      expect(result).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle mixed valid and invalid claims correctly', async () => {
      const validClaim = TestDataGenerator.createPayerClaim();
      const claimMissingPatient = { ...validClaim, patient: undefined };
      const claimMissingServiceLines = { ...validClaim, service_lines: [] };
      const claimInvalidAmount = {
        ...validClaim,
        service_lines: [{
          ...validClaim.service_lines[0],
          unit_charge_amount: -100
        }]
      };
      
      const fileContent = [
        JSON.stringify(validClaim),
        JSON.stringify(claimMissingPatient),
        JSON.stringify(validClaim),
        JSON.stringify(claimMissingServiceLines),
        JSON.stringify(claimInvalidAmount),
        JSON.stringify(validClaim)
      ].join('\n');
      
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await FileProcessor.readClaimsFromFile('/test/mixed.json');

      expect(result).toHaveLength(3); // Only the 3 valid claims
    });
  });

  describe('validateFileFormat', () => {
    it('should validate file with proper JSON format', () => {
      const validClaim = TestDataGenerator.createPayerClaim();
      mockReadFileSync.mockReturnValue(JSON.stringify(validClaim));

      const result = FileProcessor.validateFileFormat('/test/valid.json');

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject empty file', () => {
      mockReadFileSync.mockReturnValue('');

      const result = FileProcessor.validateFileFormat('/test/empty.json');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File is empty');
    });

    it('should reject file with no valid lines', () => {
      mockReadFileSync.mockReturnValue('   \n  \t  \n   ');

      const result = FileProcessor.validateFileFormat('/test/whitespace.json');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File is empty');
    });

    it('should reject file with invalid JSON on first line', () => {
      mockReadFileSync.mockReturnValue('invalid json content');

      const result = FileProcessor.validateFileFormat('/test/invalid.json');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('First line is not valid JSON');
    });

    it('should handle file read errors gracefully', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = FileProcessor.validateFileFormat('/restricted/file.json');

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Cannot read file');
    });

    it('should pass validation for multi-line JSON file', () => {
      const validClaim = TestDataGenerator.createPayerClaim();
      const fileContent = [
        JSON.stringify(validClaim),
        JSON.stringify(validClaim),
        JSON.stringify(validClaim)
      ].join('\n');
      
      mockReadFileSync.mockReturnValue(fileContent);

      const result = FileProcessor.validateFileFormat('/test/multiline.json');

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('getFileStats', () => {
    it('should return correct line count and size for valid file', () => {
      const content = 'line1\nline2\nline3\n';
      mockReadFileSync.mockReturnValue(content);

      const stats = FileProcessor.getFileStats('/test/file.json');

      expect(stats.lineCount).toBe(3);
      expect(stats.estimatedSize).toBe(content.length);
    });

    it('should handle empty file', () => {
      mockReadFileSync.mockReturnValue('');

      const stats = FileProcessor.getFileStats('/test/empty.json');

      expect(stats.lineCount).toBe(0);
      expect(stats.estimatedSize).toBe(0);
    });

    it('should filter out empty lines', () => {
      const content = 'line1\n\nline2\n  \nline3\n';
      mockReadFileSync.mockReturnValue(content);

      const stats = FileProcessor.getFileStats('/test/file.json');

      expect(stats.lineCount).toBe(3); // Only non-empty lines
      expect(stats.estimatedSize).toBe(content.length);
    });

    it('should handle file read errors gracefully', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const stats = FileProcessor.getFileStats('/nonexistent/file.json');

      expect(stats.lineCount).toBe(0);
      expect(stats.estimatedSize).toBe(0);
    });

    it('should handle large files efficiently', () => {
      const largeLine = 'x'.repeat(1000);
      const content = Array(5000).fill(largeLine).join('\n');
      mockReadFileSync.mockReturnValue(content);

      const startTime = performance.now();
      const stats = FileProcessor.getFileStats('/test/large.json');
      const endTime = performance.now();

      expect(stats.lineCount).toBe(5000);
      expect(stats.estimatedSize).toBe(content.length);
      expect(endTime - startTime).toBeLessThan(500); // Should be fast
    });
  });

  describe('Claim Validation Edge Cases', () => {
    it('should validate required patient fields', async () => {
      const invalidClaims = [
        { ...TestDataGenerator.createPayerClaim(), patient: undefined },
        { ...TestDataGenerator.createPayerClaim(), patient: { first_name: 'John' } }, // Missing last_name
        { ...TestDataGenerator.createPayerClaim(), patient: { last_name: 'Doe' } }, // Missing first_name
      ];
      
      const fileContent = invalidClaims.map(claim => JSON.stringify(claim)).join('\n');
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await FileProcessor.readClaimsFromFile('/test/invalid-patients.json');

      expect(result).toHaveLength(0); // All should be rejected
    });

    it('should validate insurance information', async () => {
      const invalidClaims = [
        { ...TestDataGenerator.createPayerClaim(), insurance: undefined },
        { ...TestDataGenerator.createPayerClaim(), insurance: { patient_member_id: 'MEM123' } }, // Missing payer_id
      ];
      
      const fileContent = invalidClaims.map(claim => JSON.stringify(claim)).join('\n');
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await FileProcessor.readClaimsFromFile('/test/invalid-insurance.json');

      expect(result).toHaveLength(0);
    });

    it('should validate service lines thoroughly', async () => {
      const baseServiceLine = TestDataGenerator.createPayerClaim().service_lines[0];
      
      const invalidClaims = [
        { 
          ...TestDataGenerator.createPayerClaim(), 
          service_lines: undefined 
        },
        { 
          ...TestDataGenerator.createPayerClaim(), 
          service_lines: [] 
        },
        { 
          ...TestDataGenerator.createPayerClaim(), 
          service_lines: [{ ...baseServiceLine, service_line_id: undefined }] 
        },
        { 
          ...TestDataGenerator.createPayerClaim(), 
          service_lines: [{ ...baseServiceLine, unit_charge_amount: -100 }] 
        },
        { 
          ...TestDataGenerator.createPayerClaim(), 
          service_lines: [{ ...baseServiceLine, unit_charge_amount: 'invalid' as any }] 
        },
        { 
          ...TestDataGenerator.createPayerClaim(), 
          service_lines: [{ ...baseServiceLine, details: undefined }] 
        },
        { 
          ...TestDataGenerator.createPayerClaim(), 
          service_lines: [{ ...baseServiceLine, unit_charge_currency: undefined }] 
        },
      ];
      
      const fileContent = invalidClaims.map(claim => JSON.stringify(claim)).join('\n');
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await FileProcessor.readClaimsFromFile('/test/invalid-service-lines.json');

      expect(result).toHaveLength(0);
    });

    it('should handle warnings without rejecting claims', async () => {
      const highValueClaim = TestDataGenerator.createPayerClaim({
        service_lines: [{
          service_line_id: 'line-1',
          procedure_code: '99999',
          units: 1,
          details: 'Expensive procedure',
          unit_charge_currency: 'USD',
          unit_charge_amount: 15000 // High amount - should trigger warning
        }]
      });
      
      const zeroAmountClaim = TestDataGenerator.createPayerClaim({
        service_lines: [{
          service_line_id: 'line-1',
          procedure_code: '99213',
          units: 1,
          details: 'No charge visit',
          unit_charge_currency: 'USD',
          unit_charge_amount: 0 // Zero amount - should trigger warning
        }]
      });
      
      const fileContent = [
        JSON.stringify(highValueClaim),
        JSON.stringify(zeroAmountClaim)
      ].join('\n');
      
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await FileProcessor.readClaimsFromFile('/test/warnings.json');

      // Both claims should be included despite warnings
      expect(result).toHaveLength(2);
      expect(result[0].service_lines[0].unit_charge_amount).toBe(15000);
      expect(result[1].service_lines[0].unit_charge_amount).toBe(0);
    });

    it('should handle complex multi-service line validation', async () => {
      const complexClaim = TestDataGenerator.createPayerClaim({
        service_lines: [
          {
            service_line_id: 'line-1',
            procedure_code: '99213',
            units: 1,
            details: 'Valid service',
            unit_charge_currency: 'USD',
            unit_charge_amount: 150
          },
          {
            service_line_id: undefined as any, // Invalid - missing ID
            procedure_code: '99214',
            units: 1,
            details: 'Invalid service',
            unit_charge_currency: 'USD',
            unit_charge_amount: 200
          }
        ]
      });
      
      const fileContent = JSON.stringify(complexClaim);
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await FileProcessor.readClaimsFromFile('/test/complex.json');

      expect(result).toHaveLength(0); // Should be rejected due to invalid service line
    });

    it('should preserve original claim structure for valid claims', async () => {
      const originalClaim = TestDataGenerator.createPayerClaim({
        patient: {
          first_name: 'John',
          last_name: 'Doe',
          gender: 'm',
          dob: '1980-01-01',
          email: 'john@example.com',
          address: {
            street: '123 Main St',
            city: 'Anytown',
            state: 'NY',
            zip: '12345',
            country: 'USA'
          }
        }
      });
      
      const fileContent = JSON.stringify(originalClaim);
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await FileProcessor.readClaimsFromFile('/test/complete.json');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(originalClaim);
    });
  });
});