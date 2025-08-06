# Medical Billing Simulator - New PayerClaim Schema

This document outlines how to run the medical billing simulator with the updated PayerClaim JSON schema that matches industry standards.

## 🎯 Overview

The simulator has been updated to use a comprehensive PayerClaim JSON schema that includes:
- **Nested patient information** (name, DOB, gender, address)
- **Organization details** (name, NPI, EIN, contact info)
- **Rendering provider information** (name, NPI)
- **Insurance details** (payer ID, member ID)
- **Enhanced service lines** (unit charges, details, currency)

## 📋 Prerequisites

- Node.js 18+ 
- pnpm package manager
- Git

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Generate Sample Claims
```bash
# Generate 100 claims with new schema format
node scripts/generate-claims.js 100 sample-claims.jsonl
```

### 3. Run the Simulator
```bash
# Process claims through the complete pipeline (default rate: 2 claims/second)
pnpm run start:single-process -- --config config/single-process.json ingest sample-claims.jsonl

# Process with custom ingestion rate (10 claims/second)
pnpm run start:single-process -- --config config/single-process.json ingest sample-claims.jsonl --rate 10.0
```

## 📊 Schema Overview

### New PayerClaim Structure
```json
{
  "claim_id": "CLM123456789",
  "place_of_service_code": 11,
  "insurance": {
    "payer_id": "medicare",
    "patient_member_id": "MEM123456789"
  },
  "patient": {
    "first_name": "John",
    "last_name": "Doe",
    "gender": "m",
    "dob": "1980-01-15",
    "address": {
      "street": "123 Main St",
      "city": "Anytown",
      "state": "CA",
      "zip": "90210",
      "country": "US"
    }
  },
  "organization": {
    "name": "Metropolitan Medical Center",
    "billing_npi": "1234567890",
    "ein": "12-3456789",
    "contact": {
      "first_name": "Jane",
      "last_name": "Smith",
      "phone_number": "555-123-4567"
    }
  },
  "rendering_provider": {
    "first_name": "Dr. Robert",
    "last_name": "Johnson",
    "npi": "9876543210"
  },
  "service_lines": [
    {
      "service_line_id": "SL001",
      "procedure_code": "99214",
      "units": 1,
      "details": "99214 - Office visit, established patient",
      "unit_charge_currency": "USD",
      "unit_charge_amount": 150.00
    }
  ]
}
```

### Supported Payer IDs
- `medicare` - Medicare
- `united_health_group` - United Health Group  
- `anthem` - Anthem

## 🔧 Configuration

### Payer Configuration (`config/single-process.json`)
```json
{
  "payers": [
    {
      "payer_id": "anthem",
      "name": "Anthem",
      "processing_delay_ms": { "min": 100, "max": 500 },
      "adjudication_rules": {
        "payer_percentage": 0.80,
        "copay_fixed_amount": 25.00,
        "deductible_percentage": 0.10
      },
      "denial_settings": {
        "denial_rate": 0.08,
        "hard_denial_rate": 0.75,
        "preferred_categories": ["AUTHORIZATION", "MEDICAL_NECESSITY"]
      }
    }
  ],
  "ingestion": {
    "rateLimit": 2.0
  }
}
```

## 📈 Running the Simulator

### Command Options

#### 1. Start Simulator Only
```bash
# Start simulator without processing files
pnpm run start:single-process -- --config config/single-process.json
```

#### 2. Process Claims File
```bash
# Process a claims file through the complete pipeline
pnpm run start:single-process -- --config config/single-process.json ingest claims.jsonl

# Process with custom ingestion rate (5 claims per second)
pnpm run start:single-process -- --config config/single-process.json ingest claims.jsonl --rate 5.0

# Process with high throughput (20 claims per second)
pnpm run start:single-process -- --config config/single-process.json ingest claims.jsonl --rate 20.0
```

#### 3. Direct Command
```bash
# Run directly with tsx
npx tsx src/app.ts ingest claims.jsonl --config config/single-process.json

# Run with custom ingestion rate
npx tsx src/app.ts ingest claims.jsonl --config config/single-process.json --rate 10.0
```

### Ingestion Rate Control

The simulator supports configurable ingestion rates to control processing speed:

```bash
# Default rate (2 claims per second)
npx tsx src/app.ts ingest claims.jsonl --config config/single-process.json

# Slow processing (1 claim per second)
npx tsx src/app.ts ingest claims.jsonl --config config/single-process.json --rate 1.0

# Fast processing (10 claims per second)
npx tsx src/app.ts ingest claims.jsonl --config config/single-process.json --rate 10.0

# High throughput (50 claims per second)
npx tsx src/app.ts ingest claims.jsonl --config config/single-process.json --rate 50.0
```

**Rate Guidelines:**
- **1-2 cps**: Good for testing and debugging
- **5-10 cps**: Standard processing speed
- **20-50 cps**: High throughput for large files
- **50+ cps**: Maximum performance (may overwhelm downstream services)

### Processing Pipeline

The simulator processes claims through 5 stages:

1. **📥 Ingestion** - Read claims from file (rate-controlled)
2. **🏢 Clearinghouse** - Route claims to appropriate payers
3. **🏥 Payer Adjudication** - Process claims and generate remittances
4. **💰 Billing** - Process remittances and calculate patient responsibility
5. **📊 AR Aging** - Track claim aging and generate reports

## 📊 Monitoring & Reports

### Real-time Status
The simulator provides live updates showing:
- Claims in each pipeline stage
- Processing throughput
- Financial summaries
- Queue depths

### AR Aging Reports
Comprehensive reports showing:
- Claims by aging buckets (0-1min, 1-2min, 2-3min, 3+min)
- Payer performance breakdown
- Financial summaries
- Outstanding claims

### Final Statistics
```
🎯 TOTAL CLAIMS PROCESSED: 100
💰 TOTAL AMOUNT BILLED: $45,678.90
💳 TOTAL AMOUNT PAID: $34,567.89
👥 TOTAL PATIENT RESPONSIBILITY: $8,234.56
📈 OVERALL PAYMENT RATE: 75.7%
⚡ AVERAGE THROUGHPUT: 2.1 claims/second
```

## 🛠️ Development

### Generate Test Claims
```bash
# Generate 50 claims for testing
node scripts/generate-claims.js 50 test-claims.jsonl

# Generate claims with specific output file
node scripts/generate-claims.js 1000 production-claims.jsonl
```

### Validate Claims
```bash
# Validate claim format
node test-ingestion.js
```

### TypeScript Compilation
```bash
# Check for compilation errors
cd src && npx tsc --noEmit
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Claims Not Processing
- Ensure you're using the `ingest` command, not just `start`
- Check that payer IDs in claims match configuration (`medicare`, `united_health_group`, `anthem`)
- Verify claim schema matches the new format

#### 2. TypeScript Errors
- Run `npx tsc --noEmit` to check for compilation errors
- Ensure all schema updates are complete

#### 3. Payer Routing Issues
- Verify payer configuration in `config/single-process.json`
- Check that payer IDs match the enum values in the schema

### Debug Mode
```bash
# Run with debug logging
DEBUG=* npx tsx src/app.ts ingest claims.jsonl --config config/single-process.json
```

## 📁 File Structure

```
brace/
├── config/
│   └── single-process.json          # Main configuration
├── scripts/
│   └── generate-claims.js           # Claim generation script
├── src/
│   ├── app.ts                       # Main application
│   ├── shared/
│   │   ├── types.ts                 # Schema definitions
│   │   └── edi-835-generator.ts     # EDI response generator
│   └── services/
│       ├── ingestion/               # File ingestion service
│       ├── clearinghouse/           # Claim routing service
│       ├── payer/                   # Payer adjudication service
│       ├── billing/                 # Billing processing service
│       └── ar-aging/                # AR aging service
└── packages/shared/                 # Shared package
    └── src/
        ├── types.ts                 # Shared schema definitions
        └── edi-835-generator.ts     # Shared EDI generator
```

## 🎯 Key Features

- **Realistic Healthcare Simulation** - Processes claims through complete medical billing pipeline
- **Configurable Payers** - Support for major US insurance payers
- **Denial Simulation** - Realistic claim denials with industry-standard reason codes
- **EDI-835 Generation** - Produces Electronic Remittance Advice responses
- **AR Aging Tracking** - Comprehensive accounts receivable aging reports
- **Performance Monitoring** - Real-time throughput and queue monitoring
- **Single-Process Architecture** - All services run in one Node.js process with in-memory queuing

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify claim schema matches the new format
3. Ensure all dependencies are installed with `pnpm install`
4. Run with debug logging for detailed error information

---

**Note**: This simulator is designed for testing and development purposes. It simulates realistic healthcare billing scenarios but is not intended for production use with real patient data. 