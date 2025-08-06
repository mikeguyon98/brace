/**
 * Ingestion File Processor
 * Handles file reading, parsing, and validation of claim data
 */

import { readFileSync } from 'fs';
import { PayerClaim } from '../../shared/types';
import { logger } from '../../shared/logger';
import { FileProcessingResult, ClaimValidationResult } from './interfaces';

export class FileProcessor {
  /**
   * Read and parse claims from a file
   */
  static async readClaimsFromFile(filePath: string): Promise<PayerClaim[]> {
    try {
      logger.info(`Reading claims from file: ${filePath}`);
      
      const fileContent = readFileSync(filePath, 'utf-8');
      const lines = fileContent.trim().split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        logger.warn('No claims found in file');
        return [];
      }

      logger.info(`Found ${lines.length} claims to process`);
      
      const claims: PayerClaim[] = [];
      const errors: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        try {
          const claim = JSON.parse(lines[i]) as PayerClaim;
          const validation = this.validateClaim(claim, i + 1);
          
          if (validation.isValid) {
            claims.push(claim);
          } else {
            errors.push(`Line ${i + 1}: ${validation.errors.join(', ')}`);
          }
        } catch (error) {
          errors.push(`Line ${i + 1}: Invalid JSON - ${error}`);
        }
      }

      if (errors.length > 0) {
        logger.warn(`File parsing completed with ${errors.length} errors:`);
        errors.forEach(error => logger.warn(`  ${error}`));
      }

      logger.info(`Successfully parsed ${claims.length}/${lines.length} claims`);
      return claims;

    } catch (error) {
      logger.error(`Failed to read file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Validate individual claim data
   */
  private static validateClaim(claim: PayerClaim, lineNumber: number): ClaimValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field validation
    if (!claim.claim_id) {
      errors.push('Missing claim_id');
    }

    if (!claim.patient || !claim.patient.first_name || !claim.patient.last_name) {
      errors.push('Missing patient information (first_name, last_name required)');
    }

    if (!claim.insurance || !claim.insurance.payer_id) {
      errors.push('Missing insurance.payer_id');
    }

    if (!claim.service_lines || !Array.isArray(claim.service_lines)) {
      errors.push('Missing or invalid service_lines');
    } else if (claim.service_lines.length === 0) {
      errors.push('No service lines provided');
    }

    // Service line validation
    if (claim.service_lines) {
      claim.service_lines.forEach((line, index) => {
        if (!line.service_line_id) {
          errors.push(`Service line ${index + 1}: Missing service_line_id`);
        }
        if (typeof line.unit_charge_amount !== 'number' || line.unit_charge_amount < 0) {
          errors.push(`Service line ${index + 1}: Invalid unit_charge_amount`);
        }
        if (line.unit_charge_amount === 0) {
          warnings.push(`Service line ${index + 1}: Zero unit charge amount`);
        }
        if (!line.details) {
          errors.push(`Service line ${index + 1}: Missing details`);
        }
        if (!line.unit_charge_currency) {
          errors.push(`Service line ${index + 1}: Missing unit_charge_currency`);
        }
      });
    }

    // Business logic warnings
    if (claim.service_lines) {
      const totalBilled = claim.service_lines.reduce((sum, line) => sum + (line.unit_charge_amount * line.units), 0);
      if (totalBilled > 10000) {
        warnings.push(`High total billed amount: $${totalBilled.toFixed(2)}`);
      }
    }

    const result: ClaimValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings
    };

    // Log warnings if any
    if (warnings.length > 0) {
      logger.debug(`Claim validation warnings for line ${lineNumber}: ${warnings.join(', ')}`);
    }

    return result;
  }

  /**
   * Validate file format and basic structure
   */
  static validateFileFormat(filePath: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      
      if (!fileContent.trim()) {
        errors.push('File is empty');
        return { isValid: false, errors };
      }

      const lines = fileContent.trim().split('\n');
      
      if (lines.length === 0) {
        errors.push('No valid lines found in file');
        return { isValid: false, errors };
      }

      // Test parse first line to check basic JSON format
      try {
        JSON.parse(lines[0]);
      } catch {
        errors.push('First line is not valid JSON');
      }

      return { isValid: errors.length === 0, errors };

    } catch (error) {
      errors.push(`Cannot read file: ${error}`);
      return { isValid: false, errors };
    }
  }

  /**
   * Get file statistics without full parsing
   */
  static getFileStats(filePath: string): { lineCount: number; estimatedSize: number } {
    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const lines = fileContent.trim().split('\n').filter(line => line.trim());
      
      return {
        lineCount: lines.length,
        estimatedSize: fileContent.length
      };
    } catch {
      return { lineCount: 0, estimatedSize: 0 };
    }
  }
}