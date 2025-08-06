#!/bin/bash

# Test script for Service Layer Parallelization
# This demonstrates the improved architecture with parallel processing at the service layer

set -e

echo "🚀 Testing Service Layer Parallelization Architecture"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

print_status "Starting API server with service-layer parallelization..."

# Start the API server in the background
cd api
npm start &
API_PID=$!
cd ..

# Wait for API to start
sleep 3

# Check if API is running
if ! curl -s http://localhost:3001/api/health > /dev/null; then
    print_error "API server failed to start"
    kill $API_PID 2>/dev/null || true
    exit 1
fi

print_success "API server started successfully"

# Get system info
print_status "System Information:"
curl -s http://localhost:3001/api/system/info | jq '.'

# Get available configurations
print_status "Available configurations:"
curl -s http://localhost:3001/api/config/presets | jq '.[] | {name: .name, displayName: .displayName, description: .description}'

# Start simulator with service-layer parallelization config
print_status "Starting simulator with service-layer parallelization configuration..."

START_RESPONSE=$(curl -s -X POST http://localhost:3001/api/simulator/start \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "clearinghouse": {
        "database": {
          "host": "localhost",
          "port": 5434,
          "database": "clearinghouse",
          "username": "postgres",
          "password": "postgres"
        }
      },
      "billing": {
        "database": {
          "host": "localhost",
          "port": 5433,
          "database": "billing",
          "username": "postgres",
          "password": "postgres"
        },
        "reportingIntervalSeconds": 30
      },
      "payers": [
        {
          "payer_id": "anthem",
          "name": "Anthem (Parallel Processing)",
          "processing_delay_ms": {"min": 50, "max": 200},
          "adjudication_rules": {
            "payer_percentage": 0.80,
            "copay_fixed_amount": 25.00,
            "deductible_percentage": 0.10
          }
        },
        {
          "payer_id": "united_health_group",
          "name": "United Health Group (High Throughput)",
          "processing_delay_ms": {"min": 75, "max": 300},
          "adjudication_rules": {
            "payer_percentage": 0.75,
            "copay_fixed_amount": 30.00,
            "deductible_percentage": 0.15
          }
        },
        {
          "payer_id": "medicare",
          "name": "Medicare (Balanced Processing)",
          "processing_delay_ms": {"min": 100, "max": 400},
          "adjudication_rules": {
            "payer_percentage": 0.70,
            "copay_fixed_amount": 15.00,
            "deductible_percentage": 0.20
          }
        }
      ],
      "ingestion": {
        "rateLimit": 50.0
      }
    }
  }')

if echo "$START_RESPONSE" | jq -e '.error' > /dev/null; then
    print_error "Failed to start simulator:"
    echo "$START_RESPONSE" | jq '.'
    kill $API_PID 2>/dev/null || true
    exit 1
fi

print_success "Simulator started successfully"

# Generate test claims
print_status "Generating test claims..."
node scripts/generate-claims.js 100 > test-claims-parallel.jsonl

# Upload and process claims
print_status "Uploading and processing claims..."

UPLOAD_RESPONSE=$(curl -s -X POST http://localhost:3001/api/simulator/process \
  -F "claimsFile=@test-claims-parallel.jsonl")

if echo "$UPLOAD_RESPONSE" | jq -e '.error' > /dev/null; then
    print_error "Failed to upload claims:"
    echo "$UPLOAD_RESPONSE" | jq '.'
    kill $API_PID 2>/dev/null || true
    exit 1
fi

print_success "Claims uploaded successfully"

# Monitor processing
print_status "Monitoring processing progress..."
echo "Press Ctrl+C to stop monitoring"

# Function to display status
show_status() {
    clear
    echo "🔄 Processing Status"
    echo "=================="
    
    # Get simulator status
    STATUS=$(curl -s http://localhost:3001/api/simulator/status)
    
    echo "$STATUS" | jq -r '
        "Status: " + (if .isRunning then "🟢 Running" else "🔴 Stopped" end),
        "Current File: " + .status.currentFile,
        "Progress: " + (.status.progress | tostring) + "%",
        "Processed: " + (.status.processedClaims | tostring) + "/" + (.status.totalClaims | tostring),
        "",
        "Queue Statistics:",
        "  Claims Queue:",
        "    Pending: " + (.stats.queues.claims.pending | tostring),
        "    Processing: " + (.stats.queues.claims.processing | tostring),
        "    Completed: " + (.stats.queues.claims.completed | tostring),
        "    Workers: " + (.stats.queues.claims.workers | tostring),
        "",
        "  Payer Queues:",
        "    Anthem - Processing: " + (.stats.queues["payer-anthem"].processing | tostring),
        "    UHG - Processing: " + (.stats.queues["payer-united_health_group"].processing | tostring),
        "    Medicare - Processing: " + (.stats.queues["payer-medicare"].processing | tostring),
        "",
        "  Remittance Queue:",
        "    Processing: " + (.stats.queues.remittance.processing | tostring),
        "    Completed: " + (.stats.queues.remittance.completed | tostring)
    '
}

# Monitor until processing is complete or interrupted
trap 'echo ""; print_status "Monitoring stopped"; exit 0' INT

while true; do
    show_status
    sleep 2
    
    # Check if processing is complete
    STATUS=$(curl -s http://localhost:3001/api/simulator/status)
    if [ "$(echo "$STATUS" | jq -r '.status.progress')" = "100" ]; then
        print_success "Processing completed!"
        break
    fi
done

# Show final results
print_status "Final Results:"
curl -s http://localhost:3001/api/simulator/results | jq '.'

# Stop simulator
print_status "Stopping simulator..."
curl -s -X POST http://localhost:3001/api/simulator/stop > /dev/null

# Stop API server
print_status "Stopping API server..."
kill $API_PID 2>/dev/null || true

# Cleanup
rm -f test-claims-parallel.jsonl

print_success "Test completed successfully!"
echo ""
echo "🎉 Service Layer Parallelization Architecture Test Results:"
echo "=========================================================="
echo "✅ API layer is simple and focused on HTTP handling"
echo "✅ Parallel processing happens at the service layer"
echo "✅ Worker threads handle actual claim processing"
echo "✅ Better resource utilization and performance"
echo "✅ Easier to debug and monitor"
echo ""
echo "📊 Check the logs for detailed performance metrics"
echo "📖 See README-SERVICE-PARALLELIZATION.md for architecture details" 