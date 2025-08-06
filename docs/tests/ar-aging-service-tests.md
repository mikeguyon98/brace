# AR Aging Service Test Documentation

## Overview
The AR Aging Service tracks accounts receivable aging with precise timing and healthcare industry compliance. It contains critical business logic for aging calculations, alerting, and reporting that mirrors real-world medical billing systems.

## Functions to Test

### 1. ARAgingService.recordClaimSubmission()
**Location**: `src/services/ar-aging/service.ts:42-78`

**Purpose**: Record claim submission with precise timestamp tracking for aging calculations

**Business Logic**:
- Create AR claim records with submission timestamps
- Track claims by payer for aging analysis
- Validate claim data and amounts
- Initialize aging tracking state

**Test Cases**:

#### Unit Tests
1. **Standard Claim Submission Recording**
   - Input: Valid claim message with complete data
   - Expected: AR record created with correct timestamp
   - Verify: Claim tracked under correct payer

2. **Claim Validation During Recording**
   - Input: Claim with missing or invalid billed amounts
   - Expected: Validation warnings logged, record still created
   - Verify: Data integrity maintained

3. **Multiple Claims Same Payer**
   - Input: Sequential claims for same payer
   - Expected: All claims tracked separately under payer
   - Verify: Payer claim set contains all correlation IDs

4. **Concurrent Claim Submissions**
   - Input: Multiple claims submitted simultaneously
   - Expected: All claims recorded with accurate timestamps
   - Verify: No race conditions in record creation

#### Edge Cases
1. **Duplicate Correlation IDs**
   - Input: Same correlation ID submitted twice
   - Expected: Warning logged, existing record preserved
   - Verify: No duplicate entries in tracking

2. **Empty/Null Payer Names**
   - Input: Claim with missing payer information
   - Expected: Graceful handling with default payer assignment

3. **Very Large Claims** ($1M+)
   - Input: High-value claims
   - Expected: Accurate amount tracking without precision loss

### 2. ARAgingService.recordClaimCompletion()
**Location**: `src/services/ar-aging/service.ts:83-122`

**Purpose**: Record claim completion with payment details and aging calculations

**Business Logic**:
- Update AR records with completion timestamp
- Calculate payment amounts from remittance
- Perform financial validations
- Calculate claim aging duration
- Trigger aging alerts if thresholds exceeded

**Test Cases**:

#### Unit Tests
1. **Standard Claim Completion**
   - Input: Remittance for existing AR record
   - Expected: Record updated with payment details and completion time
   - Verify: Age calculation accuracy to the minute

2. **Payment Amount Calculations**
   - Input: Remittance with multiple lines and payment types
   - Expected: Correct summation of paid, patient share, not-allowed amounts
   - Verify: Financial calculations match remittance totals

3. **Aging Duration Calculation**
   - Input: Claims with various submission-to-completion times
   - Expected: Accurate age calculation in minutes
   - Verify: Proper handling of timezone and daylight savings

4. **Missing AR Record Handling**
   - Input: Remittance for non-existent correlation ID
   - Expected: Warning logged, no processing errors
   - Verify: System remains stable

#### Edge Cases
1. **Same-Second Completion**
   - Input: Claim completed within 1 second of submission
   - Expected: Age calculation handles sub-minute timing
   - Verify: No division by zero or negative ages

2. **Zero Payment Claims**
   - Input: Denial remittances with $0 payments
   - Expected: Proper recording of denial completion
   - Verify: Patient share and not-allowed amounts still calculated

3. **Adjustment Remittances**
   - Input: Negative payment amounts (refunds)
   - Expected: Correct handling of negative values
   - Verify: Financial validation logic handles adjustments

### 3. ARReportGenerator.assignAgingBucket()
**Location**: `src/services/ar-aging/reporting.ts:13-18`

**Purpose**: Categorize claims into industry-standard aging buckets

**Business Logic**:
- Assign claims to aging buckets based on minutes elapsed
- Follow healthcare industry aging standards
- Handle edge cases for bucket boundaries

**Test Cases**:

#### Unit Tests
1. **Bucket Boundary Testing**
   - Input: Ages of 0.5, 1.0, 1.5, 2.0, 2.5, 3.0+ minutes
   - Expected: Correct bucket assignment for each boundary
   - Verify: No overlap or gaps in bucket logic

2. **Edge Age Values**
   - Input: Ages of exactly 1.0 and 2.0 minutes
   - Expected: Consistent bucket assignment
   - Verify: Boundary conditions handled properly

3. **Very Large Ages**
   - Input: Claims aged 60+ minutes
   - Expected: All assigned to THREE_PLUS_MIN bucket
   - Verify: No overflow or special case errors

#### Edge Cases
1. **Negative Ages** (System Clock Issues)
   - Input: Negative age values
   - Expected: Graceful handling, possibly ZERO_TO_ONE_MIN assignment

2. **Zero Age**
   - Input: Exactly 0.0 minutes
   - Expected: ZERO_TO_ONE_MIN bucket assignment

### 4. ARReportGenerator.generateAgingMetrics()
**Location**: `src/services/ar-aging/reporting.ts:23-96`

**Purpose**: Generate comprehensive aging analytics for all payers

**Business Logic**:
- Calculate aging metrics per payer
- Sum billed and paid amounts by bucket
- Calculate average ages and oldest claim ages
- Handle outstanding vs completed claims

**Test Cases**:

#### Unit Tests
1. **Single Payer Metrics**
   - Input: Claims for one payer across different buckets
   - Expected: Accurate metrics calculation for that payer
   - Verify: Totals, averages, and bucket distributions

2. **Multi-Payer Separation**
   - Input: Claims for 5+ different payers
   - Expected: Isolated metrics per payer
   - Verify: No cross-payer contamination

3. **Outstanding vs Completed Claims**
   - Input: Mix of completed and outstanding claims
   - Expected: Outstanding claims aged to current time
   - Verify: Proper handling of incomplete claims

4. **Average Age Calculations**
   - Input: Claims with known ages
   - Expected: Mathematically correct average calculations
   - Verify: Precision and accuracy of averages

#### Edge Cases
1. **Empty Claim Sets**
   - Input: No claims for a registered payer
   - Expected: Zero metrics with no calculation errors

2. **All Claims Same Age**
   - Input: All claims processed at exactly same time
   - Expected: Correct average and oldest age calculations

3. **Very Large Claim Volumes**
   - Input: 10,000+ claims per payer
   - Expected: Accurate calculations without performance issues

### 5. ARAlertManager.checkAgingAlerts()
**Location**: `src/services/ar-aging/alerting.ts:19-33`

**Purpose**: Generate alerts for claims exceeding aging thresholds

**Business Logic**:
- Check claim age against critical thresholds
- Generate appropriate alert types
- Apply business rules for alert severity

**Test Cases**:

#### Unit Tests
1. **Critical Age Threshold**
   - Input: Claims exceeding critical age (3+ minutes)
   - Expected: Critical aging alerts generated
   - Verify: Alert severity and content accuracy

2. **Below Threshold Claims**
   - Input: Claims under aging thresholds
   - Expected: No alerts generated
   - Verify: Clean processing without alerts

3. **Threshold Boundary Testing**
   - Input: Claims at exactly threshold values
   - Expected: Consistent alert generation
   - Verify: Boundary condition handling

4. **Multiple Threshold Violations**
   - Input: Claims exceeding multiple thresholds
   - Expected: Appropriate alert prioritization
   - Verify: Most severe alert generated

## Integration Tests

### 1. Complete Aging Workflow
**Scenario**: Claim submission through completion with aging tracking
- Setup: Submit claims at known intervals
- Execute: Complete claims after measurable delays
- Verify: Age calculations match expected durations

### 2. Aging Bucket Distribution
**Scenario**: Statistical validation of bucket assignments
- Setup: Submit large volume of claims with staggered completions
- Execute: Allow claims to age across all buckets
- Verify: Bucket distribution matches submission pattern

### 3. Multi-Payer Aging Analysis
**Scenario**: Concurrent aging tracking across multiple payers
- Setup: Claims for different payers with varying processing speeds
- Execute: Track aging independently per payer
- Verify: Payer-specific metrics remain isolated

### 4. Alert System Integration
**Scenario**: End-to-end alert generation and processing
- Setup: Configure alert thresholds
- Execute: Allow claims to exceed thresholds
- Verify: Alerts generated and processed correctly

## Performance Tests

### 1. High Volume Aging Tracking
- Input: 50,000+ claims across multiple payers
- Expected: Consistent performance for aging calculations
- Verify: Memory usage remains stable

### 2. Real-Time Metrics Generation
- Input: Continuous claim flow with frequent reporting
- Expected: Reports generated without impacting processing
- Verify: No performance degradation

## Test Data Requirements

### Sample Claim Messages
```json
{
  "correlation_id": "test-aging-12345",
  "claim": {
    "claim_id": "CLM789",
    "service_lines": [
      {
        "billed_amount": 250.00
      }
    ]
  },
  "ingested_at": "2024-01-15T10:00:00Z"
}
```

### Sample Remittance Messages
```json
{
  "correlation_id": "test-aging-12345",
  "remittance": {
    "payer_id": "PAYER001",
    "remittance_lines": [
      {
        "billed_amount": 250.00,
        "payer_paid_amount": 200.00,
        "coinsurance_amount": 25.00,
        "copay_amount": 15.00,
        "deductible_amount": 10.00,
        "not_allowed_amount": 0.00
      }
    ]
  }
}
```

### Time-Based Test Scenarios
- Claims with 0-59 second aging
- Claims with 1-2 minute aging  
- Claims with 2-3 minute aging
- Claims with 3+ minute aging
- Claims spanning multiple days (for stress testing)

## Mock Requirements
- Date/Time mocking for controlled aging tests
- Logger mocks for validation and alert verification
- Timer mocks for reporting interval testing
- Alert threshold configuration mocks

## Business Rule Validation

### 1. Healthcare Industry Standards
- Verify aging buckets match industry practices
- Ensure alert thresholds align with regulatory requirements
- Validate financial calculation accuracy

### 2. Audit and Compliance
- Verify all aging calculations are auditable
- Ensure proper logging of aging milestones
- Test data retention and cleanup policies

### 3. Financial Accuracy
- Confirm payment calculations to penny accuracy
- Verify aging calculations handle timezone changes
- Test handling of weekend and holiday processing delays

## Regression Test Scenarios

### 1. Daylight Savings Time
**Scenario**: Claims processed during DST transitions
- Setup: Submit claims before DST change
- Execute: Complete claims after DST change
- Verify: Age calculations remain accurate

### 2. Year Boundary Crossing
**Scenario**: Claims spanning year boundaries
- Setup: Submit claims in December
- Execute: Complete claims in January
- Verify: Age calculations handle year transition

### 3. High Frequency Processing
**Scenario**: Rapid claim submission and completion
- Setup: Submit claims every few seconds
- Execute: Complete claims in rapid succession
- Verify: Timestamp precision maintained