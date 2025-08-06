/**
 * Healthcare Claim Denial Reasons and Codes
 * Based on standard EDI-835 Group Codes and Reason Codes
 */

export enum DenialSeverity {
  HARD_DENIAL = 'hard_denial',     // Complete denial, no payment
  SOFT_DENIAL = 'soft_denial',     // Partial denial or request for more info
  ADMINISTRATIVE = 'administrative' // Technical/procedural issues
}

export enum DenialCategory {
  MEDICAL_NECESSITY = 'medical_necessity',
  AUTHORIZATION = 'authorization', 
  DUPLICATE = 'duplicate',
  COORDINATION_BENEFITS = 'coordination_benefits',
  ELIGIBILITY = 'eligibility',
  CODING = 'coding',
  DOCUMENTATION = 'documentation',
  TIMELY_FILING = 'timely_filing',
  PROVIDER_ISSUES = 'provider_issues',
  TECHNICAL = 'technical'
}

export interface DenialReason {
  code: string;
  group_code: string; // EDI Group Code (OA, PI, CO, etc.)
  reason_code: string; // EDI Reason Code
  category: DenialCategory;
  severity: DenialSeverity;
  description: string;
  explanation: string;
  weight: number; // Probability weight for random selection
}

/**
 * Comprehensive list of realistic denial reasons based on industry standards
 */
export const DENIAL_REASONS: DenialReason[] = [
  // Medical Necessity Denials
  {
    code: 'MN001',
    group_code: 'CO',
    reason_code: '50',
    category: DenialCategory.MEDICAL_NECESSITY,
    severity: DenialSeverity.HARD_DENIAL,
    description: 'Service not medically necessary',
    explanation: 'The services provided are not considered medically necessary based on current treatment guidelines.',
    weight: 15
  },
  {
    code: 'MN002', 
    group_code: 'CO',
    reason_code: '119',
    category: DenialCategory.MEDICAL_NECESSITY,
    severity: DenialSeverity.HARD_DENIAL,
    description: 'Benefit maximum exceeded',
    explanation: 'Patient has exceeded the maximum benefit allowance for this service type.',
    weight: 8
  },
  {
    code: 'MN003',
    group_code: 'CO',
    reason_code: '151',
    category: DenialCategory.MEDICAL_NECESSITY,
    severity: DenialSeverity.SOFT_DENIAL,
    description: 'Experimental or investigational treatment',
    explanation: 'Treatment is considered experimental and not covered under current policy.',
    weight: 5
  },

  // Authorization Denials
  {
    code: 'AUTH001',
    group_code: 'CO',
    reason_code: '197',
    category: DenialCategory.AUTHORIZATION,
    severity: DenialSeverity.HARD_DENIAL,
    description: 'Precertification/authorization absent',
    explanation: 'Required prior authorization was not obtained before service was rendered.',
    weight: 20
  },
  {
    code: 'AUTH002',
    group_code: 'CO', 
    reason_code: '198',
    category: DenialCategory.AUTHORIZATION,
    severity: DenialSeverity.HARD_DENIAL,
    description: 'Precertification/authorization exceeded',
    explanation: 'Services exceed what was authorized in the prior certification.',
    weight: 12
  },
  {
    code: 'AUTH003',
    group_code: 'CO',
    reason_code: '199',
    category: DenialCategory.AUTHORIZATION,
    severity: DenialSeverity.SOFT_DENIAL,
    description: 'Revenue code and procedure code do not match',
    explanation: 'The revenue code does not support the reported procedure code.',
    weight: 7
  },

  // Duplicate Claims
  {
    code: 'DUP001',
    group_code: 'CO',
    reason_code: '18',
    category: DenialCategory.DUPLICATE,
    severity: DenialSeverity.HARD_DENIAL,
    description: 'Duplicate claim',
    explanation: 'This appears to be a duplicate of a claim already received and processed.',
    weight: 18
  },
  {
    code: 'DUP002',
    group_code: 'CO',
    reason_code: '19',
    category: DenialCategory.DUPLICATE,
    severity: DenialSeverity.HARD_DENIAL,
    description: 'Exact duplicate claim',
    explanation: 'This is an exact duplicate of a claim already adjudicated.',
    weight: 10
  },

  // Eligibility Issues
  {
    code: 'ELIG001',
    group_code: 'CO',
    reason_code: '26',
    category: DenialCategory.ELIGIBILITY,
    severity: DenialSeverity.HARD_DENIAL,
    description: 'Member not eligible on date of service',
    explanation: 'Patient was not eligible for benefits on the date services were provided.',
    weight: 25
  },
  {
    code: 'ELIG002',
    group_code: 'CO',
    reason_code: '27',
    category: DenialCategory.ELIGIBILITY,
    severity: DenialSeverity.HARD_DENIAL,
    description: 'Coverage terminated before service date',
    explanation: 'Patient coverage was terminated prior to the date of service.',
    weight: 15
  },
  {
    code: 'ELIG003',
    group_code: 'PI',
    reason_code: '11',
    category: DenialCategory.ELIGIBILITY,
    severity: DenialSeverity.SOFT_DENIAL,
    description: 'Diagnosis inconsistent with patient age',
    explanation: 'The diagnosis is not consistent with the patient\'s age.',
    weight: 6
  },

  // Coding Issues
  {
    code: 'CODE001',
    group_code: 'CO',
    reason_code: '4',
    category: DenialCategory.CODING,
    severity: DenialSeverity.SOFT_DENIAL,
    description: 'Invalid procedure code',
    explanation: 'The procedure code submitted is not valid for the date of service.',
    weight: 22
  },
  {
    code: 'CODE002',
    group_code: 'CO',
    reason_code: '11',
    category: DenialCategory.CODING,
    severity: DenialSeverity.SOFT_DENIAL,
    description: 'Diagnosis inconsistent with procedure',
    explanation: 'The diagnosis is not consistent with the procedure performed.',
    weight: 16
  },
  {
    code: 'CODE003',
    group_code: 'PI',
    reason_code: '4',
    category: DenialCategory.CODING,
    severity: DenialSeverity.SOFT_DENIAL,
    description: 'Incorrect modifier',
    explanation: 'The modifier used is incorrect for this procedure code.',
    weight: 9
  },

  // Documentation Issues
  {
    code: 'DOC001',
    group_code: 'PI',
    reason_code: '1',
    category: DenialCategory.DOCUMENTATION,
    severity: DenialSeverity.SOFT_DENIAL,
    description: 'Insufficient documentation',
    explanation: 'Additional documentation is required to support the services billed.',
    weight: 14
  },
  {
    code: 'DOC002',
    group_code: 'PI',
    reason_code: '2',
    category: DenialCategory.DOCUMENTATION,
    severity: DenialSeverity.SOFT_DENIAL,
    description: 'Missing required documentation',
    explanation: 'Required supporting documentation was not provided.',
    weight: 11
  },

  // Timely Filing
  {
    code: 'TIME001',
    group_code: 'CO',
    reason_code: '29',
    category: DenialCategory.TIMELY_FILING,
    severity: DenialSeverity.HARD_DENIAL,
    description: 'Claim filed beyond timely filing limit',
    explanation: 'The claim was submitted after the timely filing deadline.',
    weight: 13
  },

  // Provider Issues  
  {
    code: 'PROV001',
    group_code: 'CO',
    reason_code: '185',
    category: DenialCategory.PROVIDER_ISSUES,
    severity: DenialSeverity.HARD_DENIAL,
    description: 'Provider not certified/eligible',
    explanation: 'The rendering provider is not certified or eligible to provide this service.',
    weight: 8
  },
  {
    code: 'PROV002',
    group_code: 'PI',
    reason_code: '8',
    category: DenialCategory.PROVIDER_ISSUES,
    severity: DenialSeverity.SOFT_DENIAL,
    description: 'Provider not enrolled',
    explanation: 'The provider is not enrolled in our network for this service.',
    weight: 6
  },

  // Technical/Administrative
  {
    code: 'TECH001',
    group_code: 'OA',
    reason_code: '1',
    category: DenialCategory.TECHNICAL,
    severity: DenialSeverity.ADMINISTRATIVE,
    description: 'Claim format error',
    explanation: 'The claim format does not meet submission requirements.',
    weight: 5
  },
  {
    code: 'TECH002',
    group_code: 'OA',
    reason_code: '15',
    category: DenialCategory.TECHNICAL,
    severity: DenialSeverity.ADMINISTRATIVE,
    description: 'Missing required field',
    explanation: 'A required field is missing from the claim submission.',
    weight: 4
  }
];

/**
 * Get denial reasons by category
 */
export function getDenialReasonsByCategory(category: DenialCategory): DenialReason[] {
  return DENIAL_REASONS.filter(reason => reason.category === category);
}

/**
 * Get denial reasons by severity
 */
export function getDenialReasonsBySeverity(severity: DenialSeverity): DenialReason[] {
  return DENIAL_REASONS.filter(reason => reason.severity === severity);
}

/**
 * Randomly select a denial reason based on weights
 */
export function selectRandomDenialReason(): DenialReason {
  const totalWeight = DENIAL_REASONS.reduce((sum, reason) => sum + reason.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const reason of DENIAL_REASONS) {
    random -= reason.weight;
    if (random <= 0) {
      return reason;
    }
  }
  
  // Fallback to first reason if something goes wrong
  return DENIAL_REASONS[0];
}

/**
 * Select denial reason by category with weighted randomization
 */
export function selectDenialReasonByCategory(category: DenialCategory): DenialReason {
  const categoryReasons = getDenialReasonsByCategory(category);
  const totalWeight = categoryReasons.reduce((sum, reason) => sum + reason.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const reason of categoryReasons) {
    random -= reason.weight;
    if (random <= 0) {
      return reason;
    }
  }
  
  return categoryReasons[0];
}

/**
 * Get summary statistics of denial reasons
 */
export function getDenialReasonStats() {
  const totalReasons = DENIAL_REASONS.length;
  const categoryCounts = Object.values(DenialCategory).reduce((acc, category) => {
    acc[category] = getDenialReasonsByCategory(category).length;
    return acc;
  }, {} as Record<DenialCategory, number>);
  
  const severityCounts = Object.values(DenialSeverity).reduce((acc, severity) => {
    acc[severity] = getDenialReasonsBySeverity(severity).length;
    return acc;
  }, {} as Record<DenialSeverity, number>);
  
  return {
    totalReasons,
    categoryCounts,
    severityCounts
  };
}