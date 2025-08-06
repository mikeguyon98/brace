#!/bin/bash

# Claim Denials Demo Script
# This script demonstrates the new claim denial functionality

echo "🚫 MEDICAL BILLING SIMULATOR - CLAIM DENIALS DEMO"
echo "=================================================="
echo ""
echo "This demo showcases:"
echo "• Random claim denials with realistic reasons"  
echo "• Different denial rates per payer"
echo "• EDI-835 response generation"
echo "• Database tracking of denials"
echo ""

# Set the config file for denial demo
DEMO_CONFIG="config/denial-demo.json"

echo "📋 Configuration: $DEMO_CONFIG"
echo "• Strict Aetna: 25% denial rate"
echo "• High Rejection BCBS: 35% denial rate" 
echo "• Lenient Cigna: 5% denial rate"
echo "• Medicare Denial Demo: 30% denial rate"
echo ""

echo "🏥 Starting simulator with denial demo configuration..."
echo "⚠️  Watch for denial messages marked with 🚫"
echo ""

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    echo "Error: Please run this script from the project root directory"
    exit 1
fi

# Run the simulator with the denial demo config and sample claims
cd src
pnpm install
echo "Processing sample claims with denial demo configuration..."
pnpm run dev -- ingest "../test-aging-demo.jsonl" --config "../$DEMO_CONFIG" --rate 5.0