# Payer Adjudicator Test Documentation

## Overview
The Payer Adjudicator contains the core business logic for claim adjudication, denial decisions, and remittance generation. This is critical healthcare business logic that determines payment outcomes.

## Functions to Test

### 1. PayerAdjudicator.adjudicateClaim()
**Location**: `src/services/payer/adjudicator.ts:31-77`

**Purpose**: Main entry point for claim adjudication with full business logic workflow

**Business Logic**:
- Determine if entire claim should be denied upfront
- Process individual service lines through adjudication rules
- Calculate overall claim status from line-level decisions
- Generate EDI-835 remittance responses
- Apply payer-specific configuration and rules

**Test Cases**:

#### Unit Tests
1. **Successful Claim Adjudication**
   - Input: Valid claim with standard service lines
   - Expected: Approved remittance with calculated payments
   - Verify: Correct payment amounts and status

2. **Full Claim Denial**
   - Input: Claim triggering upfront denial logic
   - Expected: Denied remittance with zero payments
   - Verify: Proper denial codes and EDI response

3. **Mixed Line Results**
   - Input: Claim with some approved, some denied lines
   - Expected: Partial payment remittance
   - Verify: Correct overall status calculation

4. **Empty Service Lines**
   - Input: Claim with no service lines
   - Expected: Error handling or empty remittance
   - Verify: No processing errors

5. **Large Claims** (100+ service lines)
   - Input: Claim with many service lines
   - Expected: All lines processed correctly
   - Verify: Performance and accuracy

#### Edge Cases
1. **Zero Dollar Claims**
   - Input: Claim with $0.00 billed amounts
   - Expected: Proper adjudication without payment

2. **Duplicate Claim ID**
   - Input: Same claim ID processed twice
   - Expected: Consistent adjudication results

3. **Invalid Payer Configuration**
   - Input: Claim with missing adjudication rules
   - Expected: Graceful error handling

### 2. PayerAdjudicator.shouldDenyClaim()
**Location**: `src/services/payer/adjudicator.ts:38` (referenced)

**Purpose**: Upfront claim denial logic based on payer rules

**Business Logic**:
- Apply denial rate configuration
- Check claim-level denial criteria
- Random denial simulation for testing

**Test Cases**:
1. **Denial Rate Testing**
   - Input: Configure 50% denial rate
   - Expected: Approximately 50% of claims denied over large sample
   - Verify: Statistical accuracy of denial rate

2. **Always Approve Configuration**
   - Input: 0% denial rate
   - Expected: No upfront denials
   - Verify: All claims proceed to line adjudication

3. **Always Deny Configuration**
   - Input: 100% denial rate
   - Expected: All claims denied upfront
   - Verify: No line-level processing

### 3. PayerAdjudicator.adjudicateServiceLine()
**Location**: `src/services/payer/adjudicator.ts:82-100`

**Purpose**: Individual service line adjudication with payment calculations

**Business Logic**:
- Apply line-level adjudication rules
- Calculate payment amounts based on contracts
- Determine patient cost-sharing (copay, coinsurance, deductible)
- Apply not-allowed amount reductions
- Generate denial codes when appropriate

**Test Cases**:

#### Unit Tests
1. **Standard Approved Line**
   - Input: Service line within contract rates
   - Expected: Full or partial payment calculation
   - Verify: Correct payment breakdown

2. **Denied Service Line**
   - Input: Service line failing adjudication rules
   - Expected: Zero payment with denial code
   - Verify: Appropriate denial reason

3. **Partial Payment Scenarios**
   - Input: Service line with contract rate < billed amount
   - Expected: Payment at contract rate + patient responsibility
   - Verify: Correct not-allowed amount calculation

4. **Patient Cost Sharing Calculations**
   - Input: Service lines with different insurance plan types
   - Expected: Accurate copay, coinsurance, deductible calculations
   - Verify: Total patient responsibility

5. **Multiple Service Lines**
   - Input: Claim with different procedure codes
   - Expected: Each line adjudicated independently
   - Verify: No cross-line interference

#### Edge Cases
1. **Missing Procedure Codes**
   - Input: Service line without valid procedure code
   - Expected: Technical denial with appropriate code

2. **Negative Billed Amounts** (Adjustments)
   - Input: Service line with negative amount
   - Expected: Proper handling of adjustments

3. **Zero Unit Quantities**
   - Input: Service line with 0 units
   - Expected: No payment calculation

### 4. PayerAdjudicator.calculateOverallStatus()
**Location**: Referenced in adjudicateClaim method

**Purpose**: Determine final claim status from line results

**Business Logic**:
- Analyze all remittance line statuses
- Apply business rules for overall status
- Handle mixed approval/denial scenarios

**Test Cases**:
1. **All Lines Approved**
   - Input: All remittance lines with approved status
   - Expected: Overall status = "APPROVED"

2. **All Lines Denied**
   - Input: All remittance lines with denied status
   - Expected: Overall status = "DENIED"

3. **Mixed Results**
   - Input: Some approved, some denied lines
   - Expected: Overall status = "PARTIAL" or "APPROVED"

### 5. PayerAdjudicator.createDeniedClaimRemittance()
**Location**: Referenced in adjudicateClaim method

**Purpose**: Generate complete denial remittance

**Business Logic**:
- Create denial remittance for entire claim
- Apply appropriate denial codes
- Generate EDI-835 denial response

**Test Cases**:
1. **Standard Claim Denial**
   - Input: Claim requiring full denial
   - Expected: Denial remittance with zero payments
   - Verify: Proper denial codes and EDI format

2. **High-Value Claim Denial**
   - Input: Expensive claim ($10,000+) requiring denial
   - Expected: Proper denial handling regardless of amount

## Integration Tests

### 1. End-to-End Claim Processing
**Scenario**: Complete claim adjudication workflow
- Setup: Mock payer configuration with realistic rules
- Execute: Process various claim types
- Verify: Consistent adjudication results and EDI generation

### 2. Denial Rate Accuracy
**Scenario**: Statistical validation of denial rates
- Setup: Configure known denial rate (e.g., 25%)
- Execute: Process 1000+ claims
- Verify: Actual denial rate within acceptable variance (±5%)

### 3. Payment Calculation Accuracy
**Scenario**: Financial accuracy across claim types
- Setup: Various service types with known contract rates
- Execute: Process claims with different scenarios
- Verify: Payment calculations match expected amounts

### 4. EDI-835 Generation Integration
**Scenario**: Remittance response formatting
- Setup: Adjudicated claims with different outcomes
- Execute: Generate EDI-835 responses
- Verify: Proper EDI format and data accuracy

## Performance Tests

### 1. High Volume Adjudication
- Input: 10,000+ claims with multiple service lines
- Expected: Consistent processing times
- Verify: No memory leaks or performance degradation

### 2. Complex Claims Processing
- Input: Claims with 50+ service lines each
- Expected: Accurate adjudication within time limits
- Verify: All lines processed correctly

## Test Data Requirements

### Sample Claims
```json
{
  "claim_id": "CLM123456",
  "service_lines": [
    {
      "procedure_code": "99213",
      "billed_amount": 150.00,
      "units": 1,
      "service_date": "2024-01-15"
    }
  ]
}
```

### Payer Configurations
```json
{
  "payer_id": "TEST001",
  "name": "Test Insurance",
  "adjudication_rules": {
    "denial_rate": 0.20,
    "contract_rates": {
      "99213": 120.00
    },
    "copay_amount": 25.00
  }
}
```

### Edge Case Data
- Claims with 0, 1, and 100+ service lines
- Invalid procedure codes
- Zero and negative amounts
- Missing required fields
- Very large monetary values

## Mock Requirements
- PayerConfig with various denial rates and rules
- ClaimMessage with different claim structures
- EDI-835 generation utilities
- Denial reason selection functions
- Random number generation for consistent testing

## Business Rule Validation

### 1. Healthcare Compliance
- Verify denial codes match EDI-835 standards
- Ensure patient cost-sharing calculations follow insurance rules
- Validate contract rate applications

### 2. Financial Accuracy
- Confirm payment calculations to penny accuracy
- Verify no rounding errors in large amounts
- Test adjustment handling for negative amounts

### 3. Audit Trail
- Ensure all adjudication decisions are logged
- Verify correlation IDs maintained throughout process
- Test remittance traceability back to original claims