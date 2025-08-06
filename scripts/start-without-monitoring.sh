#!/bin/bash

echo "🚀 Starting Medical Billing Claims Processing Simulator (No Monitoring)"
echo "=================================================================="

# Check if Docker and Docker Compose are available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed or not in PATH"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed or not in PATH"
    exit 1
fi

echo "🔨 Building containers..."
docker-compose build

echo "🚀 Starting core services..."
docker-compose up -d redis postgres-clearinghouse postgres-billing clearinghouse billing payer-aetna payer-bcbs payer-cigna payer-humana payer-medicare

echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Services started successfully!"
    echo ""
    echo "🔍 Redis: redis://localhost:6380"
    echo ""
    echo "🗄️  Database connections:"
    echo "   - Clearinghouse: postgresql://postgres:postgres@localhost:5434/clearinghouse"
    echo "   - Billing:       postgresql://postgres:postgres@localhost:5433/billing"
    echo ""
    echo "📋 To view logs:"
    echo "   docker-compose logs -f [service-name]"
    echo ""
    echo "🛑 To stop all services:"
    echo "   docker-compose down"
    echo ""
    echo "▶️ To start processing claims, run:"
    echo "   docker-compose run --rm -v \$(pwd):/data ingestion /data/claims.jsonl --rate=2.0"
else
    echo "❌ Some services failed to start. Check logs with:"
    echo "   docker-compose logs"
fi