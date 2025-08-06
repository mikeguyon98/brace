# Claim Denials System

This document describes the comprehensive claim denials system implemented in the medical billing simulator.

## Overview

The denial system simulates realistic healthcare claim denials with configurable rates, detailed reason codes, and complete EDI-835 response generation. This makes the simulator much more representative of real-world medical billing scenarios.

## Features

### 🎯 Realistic Denial Reasons
- **21 different denial reasons** based on industry standards
- **10 categories**: Medical Necessity, Authorization, Duplicate, Eligibility, Coding, Documentation, Timely Filing, Provider Issues, Coordination of Benefits, Technical
- **EDI Group Codes**: CO (Contractual Obligation), PI (Payer Initiated), OA (Other Adjustments)
- **EDI Reason Codes**: Standard healthcare industry codes (e.g., 50, 197, 18, 26, etc.)

### ⚙️ Configurable Denial Settings
Each payer can be configured with:
- **`denial_rate`**: Overall percentage of claims to deny (0.0-1.0)
- **`hard_denial_rate`**: Percentage of denials that are complete vs. partial (0.0-1.0)
- **`preferred_categories`**: Array of denial categories this payer tends to use

### 📊 Two Levels of Denial
1. **Claim-Level Denials**: Entire claim rejected
2. **Service-Line Denials**: Individual procedure codes denied within an approved claim

### 🗄️ Database Tracking
New PostgreSQL tables for comprehensive denial analytics:

#### `claim_denials` Table
```sql
- correlation_id, claim_id, payer_id
- denial_type ('full_claim' or 'service_line')  
- denial_code, group_code, reason_code
- category, severity, description, explanation
- billed_amount, denied_amount
- denied_at timestamp
```

#### `edi_835_responses` Table
```sql
- correlation_id, claim_id, payer_id
- transaction_control_number
- payment_amount, claim_status
- edi_content (full EDI-835 response)
- generated_at timestamp
```

### 📄 EDI-835 Response Generation
Generates realistic Electronic Remittance Advice responses including:
- ISA/GS/ST transaction headers
- BPR payment information segments
- CLP claim payment information
- CAS claim adjustment segments (with denial codes)
- SVC service payment information
- Complete transaction trailers

## Configuration Examples

### Standard Production-Like Settings
```json
{
  "denial_settings": {
    "denial_rate": 0.08,
    "hard_denial_rate": 0.75,
    "preferred_categories": ["AUTHORIZATION", "MEDICAL_NECESSITY"]
  }
}
```

### High-Denial Demo Settings
```json
{
  "denial_settings": {
    "denial_rate": 0.35,
    "hard_denial_rate": 0.90,
    "preferred_categories": ["DUPLICATE", "CODING", "DOCUMENTATION"]
  }
}
```

## Denial Categories & Examples

| Category | Description | Common Codes |
|----------|-------------|--------------|
| **AUTHORIZATION** | Missing or exceeded prior auth | AUTH001, AUTH002 |
| **MEDICAL_NECESSITY** | Service not medically necessary | MN001, MN002 |
| **DUPLICATE** | Previously submitted claim | DUP001, DUP002 |
| **ELIGIBILITY** | Patient not covered | ELIG001, ELIG002 |
| **CODING** | Invalid or inconsistent codes | CODE001, CODE002 |
| **DOCUMENTATION** | Missing required paperwork | DOC001, DOC002 |
| **TIMELY_FILING** | Filed after deadline | TIME001 |
| **PROVIDER_ISSUES** | Provider not certified | PROV001, PROV002 |

## Running the Denial Demo

### Quick Start
```bash
# Run with high denial rates for demonstration
./scripts/demo-denials.sh

# Or run with specific config
pnpm run start:single-process config/denial-demo.json
```

### What You'll See
- 🚫 **Denial Messages**: Claims marked as denied in logs
- 📈 **Statistics**: Denial rates per payer displayed in reports
- 💾 **Database Records**: All denials tracked in PostgreSQL
- 📄 **EDI Responses**: Complete EDI-835 files generated

## Database Queries

### Denial Statistics by Payer
```sql
SELECT 
  payer_id,
  category,
  COUNT(*) as denial_count,
  SUM(denied_amount) as total_denied_amount,
  AVG(denied_amount) as avg_denied_amount
FROM claim_denials 
GROUP BY payer_id, category
ORDER BY total_denied_amount DESC;
```

### Denial Trends Over Time
```sql
SELECT 
  DATE(denied_at) as denial_date,
  payer_id,
  COUNT(*) as denial_count,
  SUM(denied_amount) as total_denied_amount
FROM claim_denials 
WHERE denied_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(denied_at), payer_id
ORDER BY denial_date DESC;
```

### EDI-835 Responses
```sql
SELECT 
  claim_id,
  payer_id,
  payment_amount,
  claim_status,
  length(edi_content) as edi_size,
  generated_at
FROM edi_835_responses 
ORDER BY generated_at DESC
LIMIT 10;
```

## Implementation Details

### Core Files Modified
- **`packages/shared/src/denial-reasons.ts`**: Denial reason database
- **`packages/shared/src/edi-835-generator.ts`**: EDI response generation
- **`packages/shared/src/types.ts`**: Updated schemas for denials
- **`src/services/payer.ts`**: Enhanced adjudication with denial logic
- **`services/billing/src/statistics-service.ts`**: Database schema and tracking

### Key Classes
- **`PayerAdjudicator`**: Handles denial decisions and remittance creation
- **`StatisticsService`**: Records denial data and provides analytics
- **EDI Generator Functions**: Create compliant EDI-835 responses

## Real-World Accuracy

The denial system is based on:
- ✅ **Real EDI Standards**: Uses actual Group/Reason codes from X12 835
- ✅ **Industry Denial Rates**: Typical 5-15% denial rates for most payers
- ✅ **Common Denial Reasons**: Based on actual healthcare denial patterns
- ✅ **Proper Workflows**: Matches real clearinghouse → payer → provider flows

## Testing & Validation

### Denial Rate Validation
Each configuration includes denial rates that can be verified through database queries to ensure the random selection is working correctly.

### EDI Format Validation  
The generated EDI-835 responses follow X12 standards and can be parsed by standard EDI processing tools.

### Database Integrity
All denial records include foreign key relationships and proper indexing for efficient querying.

---

This denial system transforms the simulator from a simple payment processor into a comprehensive representation of real-world medical billing challenges, making it invaluable for testing billing software, training staff, and understanding healthcare revenue cycle complexities.