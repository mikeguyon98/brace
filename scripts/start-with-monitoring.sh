#!/bin/bash

echo "🚀 Starting Medical Billing Claims Processing Simulator with Monitoring Dashboard"
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

echo "🚀 Starting services with monitoring..."
docker-compose --profile monitoring up -d

echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Services started successfully!"
    echo ""
    echo "📊 Monitoring Dashboard: http://localhost:3001"
    echo "🔍 Redis Queue Browser: redis://localhost:6380"
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
    echo "▶️ To start processing claims, use the dashboard or run:"
    echo "   docker-compose run --rm -v \$(pwd):/data ingestion /data/claims.jsonl --rate=2.0"
else
    echo "❌ Some services failed to start. Check logs with:"
    echo "   docker-compose logs"
fi