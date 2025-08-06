# Shared Utilities Test Documentation

## Overview
The shared utilities contain critical business logic for healthcare-specific operations including denial reason selection, EDI-835 generation, and correlation ID management. These utilities are used across multiple services and require thorough testing.

## Functions to Test

### 1. selectRandomDenialReason()
**Location**: `src/shared/denial-reasons.ts:286-299`

**Purpose**: Weighted random selection of denial reasons for realistic claim adjudication

**Business Logic**:
- Apply weighted probability distribution across denial reasons
- Ensure statistical accuracy over large samples
- Provide realistic denial reason variety
- Handle edge cases in random selection

**Test Cases**:

#### Unit Tests
1. **Statistical Distribution Accuracy**
   - Input: Call function 10,000 times
   - Expected: Distribution matches weights within statistical variance
   - Verify: Each denial reason appears proportional to its weight

2. **Non-Empty Result Guarantee**
   - Input: Multiple function calls
   - Expected: Always returns a valid DenialReason object
   - Verify: Never returns null, undefined, or empty objects

3. **Weight Boundary Testing**
   - Input: Test with modified weights (0, very small, very large)
   - Expected: Proper handling of edge weight values
   - Verify: Algorithm stability with extreme weights

4. **Fallback Mechanism**
   - Input: Simulate edge cases in random selection
   - Expected: Fallback to first denial reason when needed
   - Verify: No infinite loops or crashes

#### Edge Cases
1. **Zero Weight Scenarios**
   - Input: Denial reasons with zero weights
   - Expected: Zero-weight reasons never selected
   - Verify: Statistical exclusion of zero weights

2. **Single Denial Reason**
   - Input: Modified list with only one denial reason
   - Expected: Always returns the single available reason
   - Verify: No selection errors with minimal data

3. **Floating Point Precision**
   - Input: Weights with many decimal places
   - Expected: Accurate weight handling despite precision limits
   - Verify: No rounding errors affecting distribution

### 2. selectDenialReasonByCategory()
**Location**: `src/shared/denial-reasons.ts:304-324`

**Purpose**: Select denial reasons filtered by specific categories with weighted randomization

**Business Logic**:
- Filter denial reasons by category first
- Apply weighted selection within category
- Handle empty category scenarios
- Ensure category-specific distributions

**Test Cases**:

#### Unit Tests
1. **Category Filtering Accuracy**
   - Input: Each DenialCategory enum value
   - Expected: Only reasons from specified category returned
   - Verify: No cross-category contamination

2. **Weighted Selection Within Category**
   - Input: Category with multiple denial reasons
   - Expected: Selection distribution matches weights within category
   - Verify: Category-specific statistical accuracy

3. **All Categories Coverage**
   - Input: Test each defined denial category
   - Expected: Valid denial reasons returned for all categories
   - Verify: Complete category coverage

#### Edge Cases
1. **Empty Category Handling**
   - Input: Category with no matching denial reasons
   - Expected: Graceful error handling or fallback
   - Verify: No crashes with empty categories

2. **Single Reason Categories**
   - Input: Categories with only one denial reason
   - Expected: Always returns the single reason for that category
   - Verify: Consistent behavior with minimal category data

### 3. getDenialReasonsBySeverity()
**Location**: `src/shared/denial-reasons.ts:279-281`

**Purpose**: Filter denial reasons by severity level for compliance reporting

**Business Logic**:
- Filter denial reasons by severity enum
- Maintain data integrity during filtering
- Support compliance and reporting needs

**Test Cases**:

#### Unit Tests
1. **Severity Filtering Accuracy**
   - Input: Each DenialSeverity enum value
   - Expected: Only reasons with matching severity returned
   - Verify: Filtering precision and completeness

2. **Complete Severity Coverage**
   - Input: All defined severity levels
   - Expected: At least one denial reason per severity
   - Verify: Data completeness across severities

3. **Filter Result Consistency**
   - Input: Same severity called multiple times
   - Expected: Identical results on repeated calls
   - Verify: Function determinism and stability

### 4. generateEDI835Response()
**Location**: `src/shared/edi-835-generator.ts` (referenced in codebase)

**Purpose**: Generate compliant EDI-835 remittance advice documents

**Business Logic**:
- Create EDI-835 segments following healthcare standards
- Include payment details and denial information
- Generate proper segment terminators and formatting
- Handle various remittance scenarios

**Test Cases**:

#### Unit Tests
1. **Standard Remittance Generation**
   - Input: Approved remittance with payment amounts
   - Expected: Valid EDI-835 with all required segments
   - Verify: EDI format compliance and data accuracy

2. **Denial Remittance Generation**
   - Input: Denied remittance with denial codes
   - Expected: EDI-835 with proper denial segments
   - Verify: Denial code formatting and zero payment amounts

3. **Multi-Line Remittance Handling**
   - Input: Remittances with multiple service lines
   - Expected: All lines represented in EDI output
   - Verify: Complete line processing and segment generation

4. **Financial Amount Formatting**
   - Input: Various payment amounts (whole dollars, cents, large amounts)
   - Expected: Proper financial formatting in EDI segments
   - Verify: Decimal precision and amount accuracy

#### Edge Cases
1. **Zero Payment Remittances**
   - Input: Remittances with $0.00 payments
   - Expected: Valid EDI with zero payment segments
   - Verify: Zero amount handling in EDI format

2. **Very Large Payment Amounts**
   - Input: Remittances with payments >$100,000
   - Expected: Proper handling of large amounts
   - Verify: No truncation or formatting errors

3. **Special Characters in Data**
   - Input: Remittances with special characters in text fields
   - Expected: Proper EDI escaping and formatting
   - Verify: Character handling compliance

### 5. generateSimpleDenialEDI835()
**Location**: `src/shared/edi-835-generator.ts:229-252`

**Purpose**: Generate simplified EDI-835 for quick denial responses

**Business Logic**:
- Create streamlined EDI for denial scenarios
- Include essential denial information
- Optimize for performance in high-denial scenarios
- Maintain EDI compliance with minimal segments

**Test Cases**:

#### Unit Tests
1. **Denial EDI Structure**
   - Input: Claim denial with denial information
   - Expected: Simplified but compliant EDI-835
   - Verify: Required segments present and properly formatted

2. **Denial Code Integration**
   - Input: Various denial codes and reasons
   - Expected: Denial codes properly embedded in EDI
   - Verify: Code formatting and placement accuracy

3. **Amount Handling in Denials**
   - Input: Various billed amounts for denied claims
   - Expected: Billed amounts shown, zero payments
   - Verify: Financial accuracy in denial context

### 6. parseEDI835BasicInfo()
**Location**: `src/shared/edi-835-generator.ts:257-284`

**Purpose**: Extract key information from EDI-835 responses for processing

**Business Logic**:
- Parse EDI segments for critical data elements
- Extract payment amounts and claim identifiers
- Handle various EDI format variations
- Provide structured data from EDI text

**Test Cases**:

#### Unit Tests
1. **Standard EDI Parsing**
   - Input: Valid EDI-835 with complete information
   - Expected: Accurate extraction of all data elements
   - Verify: Data accuracy and completeness

2. **Partial Data Handling**
   - Input: EDI with some missing optional segments
   - Expected: Available data extracted, missing data handled gracefully
   - Verify: Robust parsing with incomplete data

3. **Malformed EDI Handling**
   - Input: Invalid or corrupted EDI segments
   - Expected: Graceful error handling, no crashes
   - Verify: Parser stability with bad input

### 7. generateCorrelationId()
**Location**: `src/shared/types.ts` (referenced in ingestion)

**Purpose**: Generate unique correlation IDs for claim tracking

**Business Logic**:
- Create unique identifiers for claim correlation
- Ensure uniqueness across high-volume processing
- Provide consistent ID format
- Support audit trail requirements

**Test Cases**:

#### Unit Tests
1. **Uniqueness Guarantee**
   - Input: Generate 100,000 correlation IDs rapidly
   - Expected: All IDs unique with no collisions
   - Verify: Uniqueness algorithm effectiveness

2. **Format Consistency**
   - Input: Multiple ID generation calls
   - Expected: Consistent ID format and structure
   - Verify: Format standardization

3. **Performance Under Load**
   - Input: High-frequency ID generation
   - Expected: Consistent performance without degradation
   - Verify: Generation speed and efficiency

## Integration Tests

### 1. Denial Reason Integration Workflow
**Scenario**: Complete denial reason selection and EDI generation
- Setup: Configure payer with denial rates
- Execute: Process claims through denial workflow
- Verify: Denial reasons properly integrated into EDI output

### 2. EDI Generation and Parsing Round-Trip
**Scenario**: Generate EDI and parse back to verify accuracy
- Setup: Create remittances with various scenarios
- Execute: Generate EDI, then parse back
- Verify: Data fidelity through generation/parsing cycle

### 3. Correlation ID Tracking Integration
**Scenario**: Track correlation IDs through complete claim lifecycle
- Setup: Process claims with generated correlation IDs
- Execute: Follow IDs through all services
- Verify: ID consistency and tracking accuracy

## Performance Tests

### 1. High-Volume Denial Reason Selection
- Input: 1,000,000 denial reason selections
- Expected: Consistent performance and statistical accuracy
- Verify: No performance degradation over large volumes

### 2. EDI Generation Performance
- Input: Generate 10,000+ EDI documents
- Expected: Consistent generation times
- Verify: No memory leaks or performance issues

### 3. Correlation ID Generation Rate
- Input: Generate IDs at maximum rate for extended period
- Expected: Sustained high generation rate
- Verify: No performance bottlenecks

## Test Data Requirements

### Sample Denial Configurations
```json
{
  "category": "MEDICAL_NECESSITY",
  "severity": "HARD_DENIAL",
  "test_weights": [1, 5, 10, 15, 20]
}
```

### Sample Remittance Data
```json
{
  "correlation_id": "test-edi-12345",
  "claim_id": "CLM789",
  "payer_id": "PAYER001",
  "remittance_lines": [
    {
      "billed_amount": 150.00,
      "payer_paid_amount": 120.00,
      "denial_code": "CO50"
    }
  ]
}
```

### EDI Format Validation Data
- Valid EDI-835 samples
- Malformed EDI samples
- Edge case EDI variations
- Large EDI documents

## Mock Requirements
- Random number generator mocks for consistent testing
- Date/time mocks for timestamp testing
- EDI validation utilities
- Statistical analysis helpers for distribution testing

## Business Rule Validation

### 1. Healthcare Standards Compliance
- Verify EDI-835 format compliance with X12 standards
- Ensure denial codes match industry standards
- Validate financial formatting requirements

### 2. Statistical Accuracy
- Confirm weighted selection algorithms are mathematically correct
- Verify distribution accuracy over large samples
- Test edge cases in probability calculations

### 3. Data Integrity
- Ensure correlation ID uniqueness guarantees
- Verify EDI generation/parsing fidelity
- Test data consistency across utility functions

## Regulatory Compliance Testing

### 1. HIPAA Compliance
**Scenario**: Ensure no PHI leakage in correlation IDs or EDI
- Setup: Process claims with sensitive data
- Execute: Generate IDs and EDI documents
- Verify: No patient information in generated artifacts

### 2. EDI Transaction Standards
**Scenario**: Validate EDI compliance with X12 standards
- Setup: Generate various EDI scenarios
- Execute: Validate against X12 specifications
- Verify: Full compliance with healthcare EDI standards

### 3. Financial Accuracy Requirements
**Scenario**: Ensure financial calculations meet regulatory precision
- Setup: Process claims with various financial scenarios
- Execute: Generate EDI with financial data
- Verify: Financial accuracy to required decimal places

## Statistical Validation Testing

### 1. Denial Rate Accuracy
**Scenario**: Validate statistical accuracy of denial selection
- Setup: Configure known denial weights
- Execute: Generate large sample of denials
- Verify: Statistical distribution within acceptable variance

### 2. Category Distribution Testing
**Scenario**: Ensure denial categories are properly distributed
- Setup: Process claims with category-specific selection
- Execute: Analyze category distribution over large sample
- Verify: Category weights properly applied

### 3. Correlation ID Collision Testing
**Scenario**: Stress test correlation ID uniqueness
- Setup: Generate massive numbers of correlation IDs
- Execute: Check for any collisions or patterns
- Verify: True uniqueness at scale