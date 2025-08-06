#!/bin/bash

echo "🏥 AR Aging Buckets Demonstration"
echo "=================================="
echo "This demo shows claims moving through different aging buckets over time"
echo ""

# Generate test claims
echo "📊 Generating 30 test claims..."
cd /Users/mike/Personal/brace
node scripts/generate-claims.js 30 test-aging-buckets.jsonl

echo ""
echo "🚀 Starting AR Aging demonstration..."
echo "Watch as claims move from 0-1 min → 1-2 min → 2-3 min → 3+ min buckets"
echo ""

# Start ingestion with aging progression config 
cd src
timeout 300 pnpm run ingest ../test-aging-buckets.jsonl --rate 8 --config ../config/aging-progression.json

echo ""
echo "✅ AR Aging demonstration complete!"
echo "You should have seen claims progress through all aging buckets over time."