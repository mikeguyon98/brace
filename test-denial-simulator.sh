#!/bin/bash
echo "🏥 Testing Medical Billing Simulator with Denials"
echo "================================================"
echo ""
cd /Users/mike/Personal/brace/src
npx tsx app.ts ingest ../test-aging-demo.jsonl --config ../config/denial-demo.json --rate 2.0
