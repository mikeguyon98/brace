# Ingestion Service Test Documentation

## Overview
The Ingestion Service handles file processing, rate limiting, and claim ingestion with sophisticated business logic for data validation, throughput control, and error recovery. It's the entry point for all claim data into the system.

## Functions to Test

### 1. IngestionService.ingestFile()
**Location**: `src/services/ingestion/service.ts:38-120`

**Purpose**: Core file processing workflow with rate limiting and progress tracking

**Business Logic**:
- Read and validate claim files
- Apply rate limiting for controlled processing
- Track ingestion statistics and progress
- Handle processing failures and recovery
- Coordinate with downstream services

**Test Cases**:

#### Unit Tests
1. **Successful File Ingestion**
   - Input: Valid JSON file with multiple claims
   - Expected: All claims processed and forwarded to clearinghouse
   - Verify: Correct success/failure counts and statistics

2. **Rate Limiting Application**
   - Input: File with 100 claims, rate limit 10/second
   - Expected: Processing time approximately 10 seconds
   - Verify: Rate limiting intervals maintained

3. **Progress Tracking Accuracy**
   - Input: File with known number of claims
   - Expected: Progress logging at correct intervals (every 100 claims)
   - Verify: Statistics match actual processing

4. **Partial Processing Success**
   - Input: File with mix of valid and invalid claims
   - Expected: Valid claims processed, invalid claims skipped
   - Verify: Accurate success/failure reporting

5. **Processing Interruption**
   - Input: Stop ingestion mid-process
   - Expected: Graceful shutdown, accurate partial statistics
   - Verify: System state remains consistent

#### Edge Cases
1. **Empty Files**
   - Input: Empty file or file with no valid claims
   - Expected: Zero claims processed, no errors
   - Verify: Proper handling of empty datasets

2. **Very Large Files** (10,000+ claims)
   - Input: Large claim files
   - Expected: Memory-efficient processing
   - Verify: No memory leaks or performance degradation

3. **File Read Failures**
   - Input: Non-existent or unreadable files
   - Expected: Descriptive error messages and graceful failure
   - Verify: No system crashes

4. **Concurrent File Processing**
   - Input: Multiple files processed simultaneously
   - Expected: Independent processing with isolation
   - Verify: No cross-file contamination

### 2. IngestionService.ingestClaim()
**Location**: `src/services/ingestion/service.ts:125-137`

**Purpose**: Individual claim processing with correlation ID generation

**Business Logic**:
- Generate unique correlation IDs for tracking
- Create claim messages with timestamps
- Forward claims to clearinghouse queue
- Handle individual claim failures

**Test Cases**:

#### Unit Tests
1. **Standard Claim Ingestion**
   - Input: Valid claim object
   - Expected: Claim message created and queued
   - Verify: Correlation ID uniqueness and timestamp accuracy

2. **Correlation ID Uniqueness**
   - Input: Multiple claims processed rapidly
   - Expected: All correlation IDs unique
   - Verify: No ID collisions over large volumes

3. **Timestamp Precision**
   - Input: Claims ingested in rapid succession
   - Expected: Accurate, monotonic timestamps
   - Verify: Timestamp precision and ordering

#### Edge Cases
1. **Queue Failure Handling**
   - Input: Claim when queue is unavailable
   - Expected: Error thrown, processing halted
   - Verify: Proper error propagation

2. **Invalid Claim Data**
   - Input: Null or malformed claim objects
   - Expected: Validation errors and rejection
   - Verify: Data integrity maintained

### 3. FileProcessor.readClaimsFromFile()
**Location**: `src/services/ingestion/file-processor.ts:15-59`

**Purpose**: File parsing and claim validation with error recovery

**Business Logic**:
- Read and parse JSON files line by line
- Validate individual claims against schema
- Collect parsing errors for reporting
- Filter valid claims for processing

**Test Cases**:

#### Unit Tests
1. **Valid JSON File Parsing**
   - Input: Well-formed JSON file with valid claims
   - Expected: All claims parsed successfully
   - Verify: Data integrity and structure preservation

2. **Mixed Valid/Invalid Lines**
   - Input: File with some invalid JSON lines
   - Expected: Valid claims extracted, errors reported
   - Verify: Error reporting accuracy and valid claim preservation

3. **Large File Processing**
   - Input: Files with 10,000+ lines
   - Expected: Efficient memory usage and processing
   - Verify: Performance and memory stability

4. **Error Collection and Reporting**
   - Input: File with various types of parsing errors
   - Expected: Comprehensive error reporting with line numbers
   - Verify: Error message accuracy and completeness

#### Edge Cases
1. **Completely Invalid Files**
   - Input: Non-JSON files, binary files
   - Expected: Graceful failure with descriptive errors
   - Verify: No system crashes or data corruption

2. **Very Long Lines**
   - Input: JSON lines exceeding normal limits
   - Expected: Proper handling or controlled failure
   - Verify: Memory usage remains reasonable

3. **Unicode and Special Characters**
   - Input: Files with international characters
   - Expected: Proper encoding handling
   - Verify: Character data integrity

### 4. FileProcessor.validateClaim()
**Location**: `src/services/ingestion/file-processor.ts:64-122`

**Purpose**: Business rule validation for individual claims

**Business Logic**:
- Validate required fields presence
- Check data types and formats
- Validate business logic constraints
- Generate detailed validation messages

**Test Cases**:

#### Unit Tests
1. **Complete Valid Claim**
   - Input: Claim with all required fields and valid data
   - Expected: Validation passes with no errors
   - Verify: All validation rules satisfied

2. **Missing Required Fields**
   - Input: Claims missing claim_id, payer_id, or service_lines
   - Expected: Validation fails with specific field errors
   - Verify: Error messages identify missing fields

3. **Invalid Data Types**
   - Input: Claims with wrong data types (string amounts, etc.)
   - Expected: Validation fails with type errors
   - Verify: Type validation accuracy

4. **Business Rule Validation**
   - Input: Claims violating business rules (negative amounts, etc.)
   - Expected: Validation fails with business rule errors
   - Verify: Business logic enforcement

5. **Service Line Validation**
   - Input: Claims with invalid service line data
   - Expected: Service line specific validation errors
   - Verify: Nested validation accuracy

#### Edge Cases
1. **Empty Service Lines**
   - Input: Claims with empty service_lines array
   - Expected: Validation failure for missing services
   - Verify: Array validation logic

2. **Extreme Values**
   - Input: Claims with very large or very small amounts
   - Expected: Range validation applied appropriately
   - Verify: Value range checking

3. **Null vs Undefined Fields**
   - Input: Claims with null vs undefined vs missing fields
   - Expected: Consistent handling of missing data
   - Verify: Null handling consistency

### 5. RateLimiter.calculateDelay()
**Location**: `src/services/ingestion/rate-limiter.ts:20-30`

**Purpose**: Calculate processing delays to maintain target rate limits

**Business Logic**:
- Calculate time intervals for rate limiting
- Account for processing time variations
- Maintain consistent throughput rates

**Test Cases**:

#### Unit Tests
1. **Standard Rate Calculation**
   - Input: 10 claims/second rate limit
   - Expected: 100ms delays calculated correctly
   - Verify: Mathematical accuracy of delay calculations

2. **No Delay Scenarios**
   - Input: Processing slower than rate limit
   - Expected: Zero delay returned
   - Verify: No unnecessary delays introduced

3. **High Frequency Rates**
   - Input: 1000+ claims/second rate limits
   - Expected: Sub-millisecond delay calculations
   - Verify: Precision at high frequencies

#### Edge Cases
1. **Zero Rate Limit**
   - Input: Rate limit of 0 (unlimited)
   - Expected: Zero delays always returned
   - Verify: Unlimited processing mode

2. **Clock Adjustments**
   - Input: System clock changes during processing
   - Expected: Graceful handling of time anomalies
   - Verify: Rate limiting stability

### 6. RateLimiter.getCurrentRate()
**Location**: `src/services/ingestion/rate-limiter.ts:49-52`

**Purpose**: Calculate actual processing rates for monitoring

**Business Logic**:
- Calculate rates based on elapsed time and processed count
- Handle edge cases in rate calculations
- Provide accurate performance metrics

**Test Cases**:

#### Unit Tests
1. **Accurate Rate Calculation**
   - Input: Known processing count and elapsed time
   - Expected: Mathematically correct rate calculation
   - Verify: Rate calculation accuracy

2. **Zero Time Handling**
   - Input: Zero elapsed time
   - Expected: Zero rate returned (no division by zero)
   - Verify: Edge case handling

3. **Long Running Calculations**
   - Input: Extended processing periods
   - Expected: Stable rate calculations over time
   - Verify: Long-term accuracy

## Integration Tests

### 1. End-to-End File Processing
**Scenario**: Complete file ingestion workflow
- Setup: Sample file with various claim types
- Execute: Full ingestion process with rate limiting
- Verify: All valid claims reach clearinghouse

### 2. Rate Limiting Integration
**Scenario**: Rate limiting under various load conditions
- Setup: Configure different rate limits
- Execute: Process files with varying claim counts
- Verify: Target rates maintained across conditions

### 3. Error Recovery Workflow
**Scenario**: Processing files with various error conditions
- Setup: Files with parsing errors, validation failures
- Execute: Complete ingestion process
- Verify: Error handling and partial success reporting

### 4. Progress Tracking Integration
**Scenario**: Progress reporting during large file processing
- Setup: Large files with progress tracking enabled
- Execute: Monitor progress updates during processing
- Verify: Progress accuracy and update frequency

## Performance Tests

### 1. High Volume File Processing
- Input: Files with 100,000+ claims
- Expected: Consistent processing performance
- Verify: Memory usage and processing speed stability

### 2. Rate Limiting Accuracy
- Input: Various rate limits from 1 to 1000 claims/second
- Expected: Actual rates within 5% of target
- Verify: Rate limiting precision across range

### 3. Concurrent File Processing
- Input: Multiple files processed simultaneously
- Expected: Independent processing with no interference
- Verify: No resource contention or data mixing

## Test Data Requirements

### Sample Claim Files
```json
{"claim_id": "CLM001", "payer_id": "PAYER001", "service_lines": [{"procedure_code": "99213", "billed_amount": 150.00}]}
{"claim_id": "CLM002", "payer_id": "PAYER002", "service_lines": [{"procedure_code": "99214", "billed_amount": 200.00}]}
```

### Invalid Data Scenarios
```json
{"claim_id": "CLM003", "service_lines": []}
{"claim_id": "", "payer_id": "PAYER001", "service_lines": [{"billed_amount": -50.00}]}
invalid json line
{"claim_id": "CLM004", "payer_id": null, "service_lines": [{"procedure_code": "99213"}]}
```

### Large Dataset Generation
- Files with 1, 100, 1000, 10000, 100000 claims
- Files with various error rates (0%, 10%, 50%, 90%)
- Files with different claim complexity levels
- Files with unicode and special characters

## Mock Requirements
- InMemoryQueue for clearinghouse integration
- File system mocks for controlled file operations
- Timer mocks for rate limiting tests
- Logger mocks for progress tracking verification
- Error injection capabilities for failure testing

## Business Rule Validation

### 1. Healthcare Data Standards
- Verify claim structure matches healthcare standards
- Ensure required healthcare fields are validated
- Test compliance with medical coding requirements

### 2. Financial Data Integrity
- Confirm monetary amount validation accuracy
- Verify precision handling for financial calculations
- Test handling of negative amounts and adjustments

### 3. Processing Throughput
- Validate rate limiting meets operational requirements
- Ensure processing speeds support business volumes
- Test scalability for future growth

## Stress Testing Scenarios

### 1. Memory Stress Testing
**Scenario**: Process extremely large files
- Setup: Files exceeding available RAM
- Execute: Stream processing validation
- Verify: Memory usage remains stable

### 2. CPU Intensive Processing
**Scenario**: Complex validation with high CPU usage
- Setup: Files requiring intensive validation
- Execute: Monitor CPU usage and processing times
- Verify: System remains responsive

### 3. Disk I/O Stress
**Scenario**: Process many files simultaneously
- Setup: Multiple large files for concurrent processing
- Execute: Monitor disk I/O and processing performance
- Verify: I/O operations don't bottleneck processing

## Error Injection Testing

### 1. File System Failures
**Scenario**: Simulate file system errors during processing
- Setup: Mock file system failures at various points
- Execute: Attempt file processing
- Verify: Graceful error handling and recovery

### 2. Memory Exhaustion
**Scenario**: Test behavior under memory pressure
- Setup: Limit available memory
- Execute: Process large files
- Verify: Graceful degradation or appropriate errors

### 3. Network Interruptions
**Scenario**: Test resilience to network-related failures
- Setup: Simulate network interruptions
- Execute: Continue processing operations
- Verify: System stability and data consistency