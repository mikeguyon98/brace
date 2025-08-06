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

# Generate and process claims with PostgreSQL
node scripts/generate-claims.js 50 test-aging-buckets.jsonl
curl -s -X POST http://localhost:3001/api/simulator/start > /dev/null
curl -s -X POST -F "claimsFile=@test-aging-buckets.jsonl" http://localhost:3001/api/simulator/process > /dev/null

echo ""
echo "✅ AR Aging demonstration complete!"
echo "You should have seen claims progress through all aging buckets over time."