/**
 * Ingestion Service Interfaces and Types
 * Contains all interface definitions for claim ingestion functionality
 */

export interface IngestionConfig {
  rateLimit?: number; // claims per second, default 1
}

export interface IngestionStats {
  isRunning: boolean;
  claimsIngested: number;
  totalClaims?: number;
  currentRate?: number;
  elapsedTime?: number;
}

export interface FileProcessingResult {
  totalClaims: number;
  successfulClaims: number;
  failedClaims: number;
  processingTime: number;
  averageRate: number;
}

export interface ClaimValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}