# 🏥 Medical Billing Simulator

A comprehensive medical claims processing simulation system that models real-world healthcare billing workflows with realistic payer interactions, claim adjudication, and financial reporting.

## 🚀 Quick Start

### Prerequisites
- **Docker** and **Docker Compose**
- **Node.js** (v18 or higher)
- **pnpm** (install with: `npm install -g pnpm`)

### Start the System (One Command)

```bash
# Navigate to project directory
cd brace

# Start everything with Docker + PostgreSQL
./scripts/start-with-docker-postgresql.sh
```

This script will:
1. Start PostgreSQL containers with Docker
2. Install all dependencies with pnpm
3. Build the entire project
4. Set up the database schema
5. Start the API server (port 3001)
6. Start the frontend (port 3000)

### Access Your Application
- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001

### Test the System
1. Open http://localhost:3000 in your browser
2. Go to **Configuration** → Start the simulator
3. Go to **Processing** → Upload a test file (try `test-output.jsonl`)
4. Watch real-time processing!

### Stop the System
Press **Ctrl+C** in the terminal to stop all services (frontend, API, and Docker containers).

### Clear Data (Optional)
To reset the database and clear all processed claims:
```bash
./scripts/clear-claims.sh
```

## 🎯 Overview

This billing simulator processes medical claims through a complete healthcare revenue cycle, from initial claim submission to final payment posting. It simulates:

- **Multi-payer processing** (Medicare, Anthem, United Health Group)
- **Complex adjudication rules** (copays, deductibles, coinsurance)
- **Claim denials** with realistic denial reasons and codes
- **AR aging analysis** with industry-standard buckets
- **Real-time financial reporting** and analytics

## 🏗️ Architecture

### System Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │      API        │    │   Billing       │
│   (React)       │◄──►│   (Node.js)     │◄──►│   PostgreSQL    │
│   Port: 3000    │    │   Port: 3001    │    │   Port: 5433    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  Clearinghouse  │
                       │   PostgreSQL    │
                       │   Port: 5434    │
                       └─────────────────┘
```

### Processing Pipeline

```
Claims File Upload
       ↓
Ingestion Service (validates & queues claims)
       ↓
Clearinghouse Router (routes to appropriate payers)
       ↓
Payer Services (Medicare, Anthem, UHG - adjudication logic)
       ↓
Billing Service (payment posting & reconciliation)
       ↓
PostgreSQL Database (stores results)
       ↓
Real-time Dashboard (displays metrics & progress)
```

### Key Architecture Decisions

- **Dual PostgreSQL Databases**: Separate databases for billing (port 5433) and clearinghouse (port 5434) operations to isolate concerns and improve performance
- **Microservice-style Design**: Independent services for ingestion, routing, payer adjudication, billing, and AR aging
- **Queue-based Processing**: Asynchronous claim processing with in-memory queues for scalability
- **Real-time Updates**: WebSocket-like polling for live dashboard updates during processing

### Core Services

1. **Ingestion Service**: Validates and queues uploaded claims files
2. **Clearinghouse Service**: Routes claims to appropriate payers
3. **Payer Services**: Simulates insurance company adjudication (Medicare, Anthem, UHG)
4. **Billing Service**: Posts payments and calculates patient responsibility
5. **AR Aging Service**: Tracks outstanding receivables and generates aging reports

## 📖 Usage Guide

### Configuration Modes

#### Fast Demo Mode (Recommended for Testing)
```bash
./scripts/demo-denials.sh
```
- Processing: 100-700ms per claim - perfect for demonstrations

#### Realistic Mode  
```bash
./scripts/start-with-postgresql.sh
```
- Claims process in 30-180 seconds (like real healthcare)

### Generating Test Data

```bash
# Generate claims with different volumes
node scripts/generate-claims.js 10 small-test.jsonl
node scripts/generate-claims.js 100 medium-test.jsonl

# Pre-generated files available in data/ directory
```

### Web Interface

1. **Start**: Click "Start Simulator" in Configuration tab
2. **Upload**: Upload claims file (JSONL format) in Processing tab  
3. **Monitor**: Watch real-time progress and metrics
4. **Results**: View financial summary and payer breakdowns

### Key API Endpoints

- `POST /api/simulator/start` - Start the processing engine
- `POST /api/simulator/process` - Upload and process claims file
- `GET /api/simulator/status` - Get real-time processing status
- `GET /api/simulator/results` - Get final processing results

## ⚙️ Configuration

### Available Configurations (`config/`)

- **`default.json`** - Realistic healthcare timing (30-180 sec delays)
- **`denial-demo.json`** - Fast demo mode (100-700ms delays) - **Recommended for testing**
- **`single-process.json`** - Single-threaded processing

### Payer Settings
Each payer (Medicare, Anthem, UHG) can be configured with:
- Processing delays (realistic vs demo timing)
- Adjudication rules (payer percentage, copays, deductibles)
- Denial rates and preferred denial categories

### Environment Variables
```bash
# Database connections
DB_HOST=localhost
DB_PORT=5433  # Billing database
API_PORT=3001
```

## 🧪 Testing & Management

### Useful Scripts
```bash
# Demo with fast processing
./scripts/demo-denials.sh

# Clear all claim data
./scripts/clear-claims.sh

# Generate test data
node scripts/generate-claims.js 100 test.jsonl
```

### Running Tests
```bash
cd src && pnpm test
```

## 🔧 Troubleshooting

### Common Issues

**Database Connection Failed**
```bash
# Check containers are running
docker ps

# Restart if needed
docker-compose down && docker-compose up -d
```

**Ports Already in Use**
```bash
# Kill processes on required ports
./scripts/stop-all-services.sh
```

**Slow Processing**
The default config uses realistic healthcare timing (30-180 seconds per claim). For faster testing use:
```bash
./scripts/demo-denials.sh  # 100-700ms per claim
```

**Claims Stuck in Processing**
```bash
# Clear all claims and restart
./scripts/clear-claims.sh --force
```

## 📁 Project Structure

```
brace/
├── frontend/           # React app (port 3000)
├── api/               # Express API (port 3001)  
├── src/               # Core processing services
├── database/          # PostgreSQL schema
├── config/            # Configuration presets
├── scripts/           # Management scripts
└── docker-compose.yml # PostgreSQL containers (ports 5433, 5434)
```

### Key Features

- **Dual PostgreSQL Setup**: Separate billing (5433) and clearinghouse (5434) databases
- **Multiple File Processing**: Upload files sequentially without restarting
- **One-Command Setup**: `./scripts/start-with-docker-postgresql.sh`
- **Real-time Dashboard**: Live progress tracking and financial metrics

---

*This system demonstrates modern healthcare billing workflows and real-time data processing patterns.*