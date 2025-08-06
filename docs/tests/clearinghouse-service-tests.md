# Clearinghouse Service Test Documentation

## Overview
The Clearinghouse Service acts as the central routing hub for claims, managing correlation tracking, payer routing logic, and claim storage. It contains critical business logic for healthcare claim workflow orchestration.

## Functions to Test

### 1. ClearinghouseService.processClaim()
**Location**: `src/services/clearinghouse/service.ts:57-96`

**Purpose**: Core claim processing workflow through clearinghouse operations

**Business Logic**:
- Route claims to appropriate payer queues
- Store claims for correlation tracking
- Integrate with AR aging for submission tracking
- Handle routing failures and error recovery

**Test Cases**:

#### Unit Tests
1. **Successful Claim Processing**
   - Input: Valid claim with known payer ID
   - Expected: Claim routed to correct payer queue and stored
   - Verify: AR aging notified of submission

2. **Routing Failure Handling**
   - Input: Claim with invalid or unknown payer
   - Expected: Error thrown, no partial processing
   - Verify: System state remains consistent

3. **Correlation Tracking**
   - Input: Multiple claims with unique correlation IDs
   - Expected: All claims stored with proper correlation
   - Verify: Claims retrievable by correlation ID

4. **Progress Logging Thresholds**
   - Input: Process exactly 10 and 100 claims
   - Expected: Progress logging at correct intervals
   - Verify: Logging frequency matches configuration

#### Edge Cases
1. **Empty Claim Data**
   - Input: Claim message with null/undefined claim object
   - Expected: Graceful error handling
   - Verify: No system crashes or data corruption

2. **Concurrent Claim Processing**
   - Input: Multiple claims processed simultaneously
   - Expected: All claims processed independently
   - Verify: No race conditions in storage or routing

3. **Storage Failure Recovery**
   - Input: Claims when storage system fails
   - Expected: Appropriate error handling and recovery
   - Verify: System remains stable

### 2. ClaimRouter.routeClaim()
**Location**: `src/services/clearinghouse/router.ts:26-55`

**Purpose**: Route claims to appropriate payer queues with fallback logic

**Business Logic**:
- Determine target payer from claim data
- Apply fallback routing when primary payer unavailable
- Manage payer queue load balancing
- Generate routing result metadata

**Test Cases**:

#### Unit Tests
1. **Direct Payer Routing**
   - Input: Claim with valid payer ID in system
   - Expected: Claim routed to specific payer queue
   - Verify: No fallback logic triggered

2. **Fallback Payer Routing**
   - Input: Claim with unavailable payer ID
   - Expected: Claim routed to fallback payer
   - Verify: Fallback flag set in routing result

3. **Queue Statistics Integration**
   - Input: Claim routed to payer with known queue stats
   - Expected: Current queue stats included in result
   - Verify: Accurate pending/processing counts

4. **Payer Name Resolution**
   - Input: Claims for payers with configured names
   - Expected: Human-readable payer names in results
   - Verify: Name mapping accuracy

#### Edge Cases
1. **No Available Payers**
   - Input: Claim when all payer queues unavailable
   - Expected: Routing failure with descriptive error
   - Verify: Error message indicates specific issue

2. **Queue Overflow Conditions**
   - Input: Claim when target queue at capacity
   - Expected: Appropriate handling or fallback
   - Verify: Queue limits respected

### 3. ClaimRouter.determinePayer()
**Location**: `src/services/clearinghouse/router.ts:60-90`

**Purpose**: Business logic for payer selection and fallback decisions

**Business Logic**:
- Extract payer information from claims
- Apply payer availability rules
- Implement fallback payer selection
- Handle edge cases in payer determination

**Test Cases**:

#### Unit Tests
1. **Primary Payer Selection**
   - Input: Claim with valid, available payer
   - Expected: Primary payer selected, no fallback
   - Verify: Correct payer queue returned

2. **Fallback Trigger Conditions**
   - Input: Claim with unavailable primary payer
   - Expected: Fallback payer selection logic activated
   - Verify: Fallback flag properly set

3. **Payer Queue Lookup**
   - Input: Various payer IDs (valid and invalid)
   - Expected: Correct queue object or undefined returned
   - Verify: Queue mapping accuracy

#### Edge Cases
1. **Missing Payer ID in Claim**
   - Input: Claim without payer identification
   - Expected: Default payer assignment or error
   - Verify: Consistent handling of missing data

2. **Circular Fallback Prevention**
   - Input: Fallback payer that is also unavailable
   - Expected: Proper error handling, no infinite loops
   - Verify: System stability maintained

### 4. ClaimStorage.storeClaim()
**Location**: `src/services/clearinghouse/storage.ts:15-27`

**Purpose**: Store claims for correlation tracking and audit trails

**Business Logic**:
- Create stored claim records with metadata
- Generate submission timestamps
- Maintain correlation mapping
- Handle storage lifecycle management

**Test Cases**:

#### Unit Tests
1. **Standard Claim Storage**
   - Input: Valid claim message with complete data
   - Expected: Stored claim created with all fields populated
   - Verify: Timestamp accuracy and data integrity

2. **Metadata Generation**
   - Input: Claim with various data patterns
   - Expected: Consistent metadata generation
   - Verify: Submission timestamps and correlation tracking

3. **Storage Retrieval**
   - Input: Store claim, then retrieve by correlation ID
   - Expected: Exact claim data returned
   - Verify: Data fidelity through storage cycle

#### Edge Cases
1. **Large Claim Data**
   - Input: Claims with extensive service line data
   - Expected: Complete data storage without truncation
   - Verify: Memory usage remains reasonable

2. **Special Characters in Data**
   - Input: Claims with unicode or special characters
   - Expected: Proper data encoding and storage
   - Verify: Character data integrity

### 5. ClaimStorage.getClaimsByPayer()
**Location**: `src/services/clearinghouse/storage.ts:70-73`

**Purpose**: Retrieve claims filtered by payer for analysis

**Business Logic**:
- Filter stored claims by payer ID
- Maintain data consistency
- Support analytical queries

**Test Cases**:

#### Unit Tests
1. **Payer-Specific Retrieval**
   - Input: Multiple claims for different payers
   - Expected: Only claims for specified payer returned
   - Verify: No cross-payer data leakage

2. **Empty Result Handling**
   - Input: Query for payer with no stored claims
   - Expected: Empty array returned (not null/undefined)
   - Verify: Consistent return type

3. **Large Dataset Filtering**
   - Input: 1000+ claims across multiple payers
   - Expected: Efficient filtering and accurate results
   - Verify: Performance and accuracy

## Integration Tests

### 1. End-to-End Claim Flow
**Scenario**: Complete claim processing from ingestion to payer routing
- Setup: Mock all external dependencies
- Execute: Process claims through complete workflow
- Verify: Claims reach payer queues with proper correlation

### 2. AR Aging Integration
**Scenario**: Claim submission tracking integration
- Setup: Mock AR aging service
- Execute: Process claims through clearinghouse
- Verify: AR aging notified with correct claim data

### 3. Multi-Payer Routing Validation
**Scenario**: Claims for different payers processed concurrently
- Setup: Configure multiple payer queues
- Execute: Submit claims for different payers
- Verify: Correct routing isolation and queue distribution

### 4. Storage and Retrieval Workflow
**Scenario**: Claim storage followed by various retrieval patterns
- Setup: Store claims across multiple payers
- Execute: Test different retrieval methods
- Verify: Data consistency and query accuracy

## Performance Tests

### 1. High Volume Claim Processing
- Input: 10,000+ claims in rapid succession
- Expected: Consistent processing times
- Verify: No memory leaks or performance degradation

### 2. Concurrent Routing Operations
- Input: Multiple simultaneous routing requests
- Expected: Thread-safe operations
- Verify: No race conditions or data corruption

### 3. Large Claim Storage
- Input: Claims with extensive data payloads
- Expected: Efficient storage without memory issues
- Verify: Storage scalability and retrieval performance

## Test Data Requirements

### Sample Claim Messages
```json
{
  "correlation_id": "test-clearinghouse-12345",
  "claim": {
    "claim_id": "CLM456789",
    "payer_id": "PAYER001",
    "service_lines": [
      {
        "procedure_code": "99213",
        "billed_amount": 150.00
      }
    ]
  },
  "ingested_at": "2024-01-15T10:00:00Z"
}
```

### Payer Configuration Data
```json
{
  "PAYER001": {
    "name": "Primary Insurance Co",
    "queue_capacity": 1000
  },
  "FALLBACK": {
    "name": "Fallback Payer",
    "queue_capacity": 5000
  }
}
```

### Edge Case Test Data
- Claims with missing payer IDs
- Claims with invalid JSON structure
- Claims with very large payloads (1MB+)
- Claims with special characters and unicode
- Claims with duplicate correlation IDs

## Mock Requirements
- InMemoryQueue instances for payer queues
- ARAgingService for submission tracking
- Payer configuration maps
- Logger mocks for verification
- Timer mocks for progress logging intervals

## Business Rule Validation

### 1. Healthcare Workflow Compliance
- Verify claim routing follows healthcare industry standards
- Ensure proper audit trail maintenance
- Validate correlation tracking for regulatory compliance

### 2. Data Integrity
- Confirm no claim data loss during processing
- Verify correlation ID uniqueness and tracking
- Test data consistency across storage operations

### 3. Error Recovery
- Validate graceful handling of routing failures
- Ensure system stability during error conditions
- Test recovery mechanisms for storage failures

## Load Testing Scenarios

### 1. Peak Volume Processing
**Scenario**: Simulate peak daily claim volumes
- Setup: Configure realistic payer distribution
- Execute: Process 100,000+ claims over time period
- Verify: System maintains performance and accuracy

### 2. Payer Queue Saturation
**Scenario**: Test behavior when payer queues reach capacity
- Setup: Configure small queue limits
- Execute: Submit more claims than queue capacity
- Verify: Appropriate backpressure and fallback behavior

### 3. Storage Growth Management
**Scenario**: Long-running clearinghouse with continuous claims
- Setup: Process claims continuously over extended period
- Execute: Monitor storage growth and memory usage
- Verify: Memory usage remains stable, no leaks

## Failure Mode Testing

### 1. Payer Queue Failures
**Scenario**: Simulate payer queue unavailability
- Setup: Disable specific payer queues
- Execute: Route claims to unavailable payers
- Verify: Fallback routing and error handling

### 2. Storage System Failures
**Scenario**: Simulate storage subsystem failures
- Setup: Mock storage failures
- Execute: Attempt claim processing
- Verify: Graceful degradation and recovery

### 3. Network Isolation Scenarios
**Scenario**: Test behavior during network partitions
- Setup: Simulate network connectivity issues
- Execute: Continue processing claims
- Verify: System resilience and data consistency