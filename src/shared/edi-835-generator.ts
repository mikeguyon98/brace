/**
 * EDI-835 (Electronic Remittance Advice) Response Generator
 * Generates realistic EDI-835 formatted responses for claim adjudications and denials
 */

import { RemittanceAdvice, RemittanceLine, ClaimStatus, DenialInfo } from './types';
import { PayerClaim } from './types';

interface EDI835Options {
  payerName: string;
  payerContactInfo?: string;
  checkNumber?: string;
  paymentDate?: string;
}

/**
 * Generate a complete EDI-835 response for a remittance advice
 */
export function generateEDI835Response(
  remittance: RemittanceAdvice,
  claim: PayerClaim,
  options: EDI835Options
): string {
  const segments: string[] = [];
  
  // Generate unique transaction control number
  const transactionControlNumber = generateTransactionControlNumber();
  const paymentDate = options.paymentDate || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const checkNumber = options.checkNumber || generateCheckNumber();
  
  // ISA - Interchange Control Header (simplified)
  segments.push(generateISASegment());
  
  // GS - Functional Group Header
  segments.push(generateGSSegment());
  
  // ST - Transaction Set Header
  segments.push(`ST*835*${transactionControlNumber}~`);
  
  // BPR - Financial Information (Payment information)
  const totalPayment = calculateTotalPayment(remittance);
  segments.push(`BPR*I*${totalPayment.toFixed(2)}*C*ACH*CCP*01*${generateBankAccount()}*DA*${generateRoutingNumber()}*1234567890*01*${generateBankAccount()}*DA*${generateRoutingNumber()}*${paymentDate}~`);
  
  // TRN - Reassociation Trace Number
  segments.push(`TRN*1*${checkNumber}*1234567890~`);
  
  // N1 - Payer Identification
  segments.push(`N1*PR*${options.payerName}~`);
  segments.push(`N3*PO BOX 12345~`);
  segments.push(`N4*ANYTOWN*NY*12345~`);
  
  // CLP - Claim Payment Information
  const claimStatus = getClaimStatusCode(remittance.overall_status);
  const totalCharges = claim.service_lines.reduce((sum, line) => sum + (line.unit_charge_amount * line.units), 0);
  const totalPayments = remittance.remittance_lines.reduce((sum, line) => sum + line.payer_paid_amount, 0);
  const patientResponsibility = remittance.remittance_lines.reduce((sum, line) => 
    sum + line.copay_amount + line.coinsurance_amount + line.deductible_amount, 0);
  
  segments.push(`CLP*${claim.claim_id}*${claimStatus}*${totalCharges.toFixed(2)}*${totalPayments.toFixed(2)}*${patientResponsibility.toFixed(2)}*12*${generateProviderControlNumber()}*11*1~`);
  
  // CAS - Claim Adjustment Segments (for denials and adjustments)
  const adjustmentSegments = generateCASSegments(remittance);
  segments.push(...adjustmentSegments);
  
  // NM1 - Patient Information
  segments.push(`NM1*QC*1*${claim.patient.first_name}*${claim.patient.last_name}*****MI*${claim.insurance.patient_member_id}~`);
  
  // Service Line Information
  remittance.remittance_lines.forEach((line, index) => {
    const serviceLine = claim.service_lines.find(sl => sl.service_line_id === line.service_line_id);
    if (serviceLine) {
      // SVC - Service Payment Information
      const serviceLineBilledAmount = serviceLine.unit_charge_amount * serviceLine.units;
    segments.push(`SVC*HC:${serviceLine.procedure_code}*${serviceLineBilledAmount.toFixed(2)}*${line.payer_paid_amount.toFixed(2)}*${serviceLine.procedure_code}*${serviceLine.units}~`);
      
      // DTM - Service Date
      // Use current date since submission_date is no longer in the schema
      const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      segments.push(`DTM*472*${currentDate}~`);
      
      // CAS - Service Line Adjustment (if needed)
      if (line.status === ClaimStatus.DENIED || line.denial_info) {
        const serviceAdjustments = generateServiceLineCAS(line);
        segments.push(...serviceAdjustments);
      }
    }
  });
  
  // SE - Transaction Set Trailer
  const segmentCount = segments.length + 1; // +1 for the SE segment itself
  segments.push(`SE*${segmentCount}*${transactionControlNumber}~`);
  
  // GE - Functional Group Trailer
  segments.push('GE*1*1~');
  
  // IEA - Interchange Control Trailer
  segments.push('IEA*1*000000001~');
  
  return segments.join('\n');
}

/**
 * Generate ISA segment (Interchange Control Header)
 */
function generateISASegment(): string {
  const currentDate = new Date();
  const yymmdd = currentDate.toISOString().slice(2, 10).replace(/-/g, '');
  const hhmm = currentDate.toTimeString().slice(0, 5).replace(':', '');
  
  return `ISA*00*          *00*          *ZZ*PAYER          *ZZ*PROVIDER        *${yymmdd}*${hhmm}*^*00501*000000001*0*P*>~`;
}

/**
 * Generate GS segment (Functional Group Header)
 */
function generateGSSegment(): string {
  const currentDate = new Date();
  const yyyymmdd = currentDate.toISOString().slice(0, 10).replace(/-/g, '');
  const hhmm = currentDate.toTimeString().slice(0, 5).replace(':', '');
  
  return `GS*HP*PAYER*PROVIDER*${yyyymmdd}*${hhmm}*1*X*005010X221A1~`;
}

/**
 * Generate CAS (Claim Adjustment Segments) for denials and adjustments
 */
function generateCASSegments(remittance: RemittanceAdvice): string[] {
  const segments: string[] = [];
  
  // Generate claim-level adjustments
  const totalDeniedAmount = remittance.total_denied_amount || 0;
  if (totalDeniedAmount > 0 && remittance.overall_status === ClaimStatus.DENIED) {
    // Find a denied line to get denial reason
    const deniedLine = remittance.remittance_lines.find(line => line.denial_info);
    if (deniedLine?.denial_info) {
      segments.push(`CAS*${deniedLine.denial_info.group_code}*${deniedLine.denial_info.reason_code}*${totalDeniedAmount.toFixed(2)}~`);
    }
  }
  
  return segments;
}

/**
 * Generate service line CAS segments for individual line denials
 */
function generateServiceLineCAS(line: RemittanceLine): string[] {
  const segments: string[] = [];
  
  if (line.denial_info) {
    const deniedAmount = line.billed_amount - line.payer_paid_amount; // line.billed_amount is already calculated in remittance
    if (deniedAmount > 0) {
      segments.push(`CAS*${line.denial_info.group_code}*${line.denial_info.reason_code}*${deniedAmount.toFixed(2)}~`);
    }
  }
  
  // Add adjustments for not allowed amounts
  if (line.not_allowed_amount > 0) {
    segments.push(`CAS*CO*45*${line.not_allowed_amount.toFixed(2)}~`); // CO-45 = Charge exceeds fee schedule/maximum allowable
  }
  
  return segments;
}

/**
 * Get EDI claim status code from our internal status
 */
function getClaimStatusCode(status: ClaimStatus): string {
  switch (status) {
    case ClaimStatus.APPROVED:
      return '1'; // Processed as Primary
    case ClaimStatus.DENIED:
      return '4'; // Denied
    case ClaimStatus.PARTIAL_DENIAL:
      return '2'; // Processed as Secondary
    default:
      return '1';
  }
}

/**
 * Calculate total payment amount from remittance
 */
function calculateTotalPayment(remittance: RemittanceAdvice): number {
  return remittance.remittance_lines.reduce((sum, line) => sum + line.payer_paid_amount, 0);
}

/**
 * Generate unique transaction control number
 */
function generateTransactionControlNumber(): string {
  return Date.now().toString().slice(-9).padStart(9, '0');
}

/**
 * Generate check/reference number
 */
function generateCheckNumber(): string {
  return 'CHK' + Date.now().toString().slice(-6);
}

/**
 * Generate provider control number
 */
function generateProviderControlNumber(): string {
  return 'PCN' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Generate patient ID
 */
function generatePatientID(): string {
  return 'PAT' + Math.random().toString(36).substring(2, 9).toUpperCase();
}

/**
 * Generate bank account number (fake for simulation)
 */
function generateBankAccount(): string {
  return Math.random().toString().slice(2, 12);
}

/**
 * Generate routing number (fake for simulation)
 */
function generateRoutingNumber(): string {
  return '021000021'; // Wells Fargo routing number (safe to use for simulation)
}

/**
 * Generate a simplified EDI-835 for quick denial responses
 */
export function generateSimpleDenialEDI835(
  claimId: string,
  payerId: string,
  denialInfo: DenialInfo,
  billedAmount: number,
  options: EDI835Options
): string {
  const transactionControlNumber = generateTransactionControlNumber();
  const paymentDate = options.paymentDate || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  
  return [
    generateISASegment(),
    generateGSSegment(),
    `ST*835*${transactionControlNumber}~`,
    `BPR*I*0.00*C*ACH*CCP*01*${generateBankAccount()}*DA*${generateRoutingNumber()}*1234567890*01*${generateBankAccount()}*DA*${generateRoutingNumber()}*${paymentDate}~`,
    `TRN*1*${generateCheckNumber()}*1234567890~`,
    `N1*PR*${options.payerName}~`,
    `CLP*${claimId}*4*${billedAmount.toFixed(2)}*0.00*0.00*12*${generateProviderControlNumber()}*11*1~`,
    `CAS*${denialInfo.group_code}*${denialInfo.reason_code}*${billedAmount.toFixed(2)}~`,
    `SE*9*${transactionControlNumber}~`,
    'GE*1*1~',
    'IEA*1*000000001~'
  ].join('\n');
}

/**
 * Parse basic information from an EDI-835 response
 */
export function parseEDI835BasicInfo(edi835: string): {
  transactionControlNumber?: string;
  paymentAmount?: number;
  claimId?: string;
  status?: string;
} {
  const lines = edi835.split('\n');
  const result: any = {};
  
  for (const line of lines) {
    const segments = line.split('*');
    
    switch (segments[0]) {
      case 'ST':
        result.transactionControlNumber = segments[2];
        break;
      case 'BPR':
        result.paymentAmount = parseFloat(segments[2]);
        break;
      case 'CLP':
        result.claimId = segments[1];
        result.status = segments[2];
        break;
    }
  }
  
  return result;
}