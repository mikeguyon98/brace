#!/bin/bash

# Database-only test script
# Tests PostgreSQL setup without starting the web application

set -e

echo "🧪 Testing PostgreSQL Database Only"
echo "===================================="

# Database connection parameters
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"  # Changed to match your postgres-billing container
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"  # Default password from docker-compose.yml

# Set PGPASSWORD environment variable to avoid password prompts
export PGPASSWORD="$DB_PASSWORD"

# Check if PostgreSQL is running
echo "📡 Checking PostgreSQL connection on ${DB_HOST}:${DB_PORT}..."
if ! pg_isready -h $DB_HOST -p $DB_PORT >/dev/null 2>&1; then
    echo "❌ PostgreSQL is not running"
    echo "💡 Start PostgreSQL first:"
    echo "   macOS: brew services start postgresql"
    echo "   Linux: sudo systemctl start postgresql"
    exit 1
fi

echo "✅ PostgreSQL is running"

# Set up database
echo "📋 Setting up database schema..."
if [ -f "scripts/setup-postgresql.sh" ]; then
    ./scripts/setup-postgresql.sh
else
    echo "❌ Database setup script not found"
    exit 1
fi

# Run integration test
echo "🧪 Running database integration test..."
if [ -f "test-postgresql-integration.js" ]; then
    node test-postgresql-integration.js
else
    echo "❌ Database test script not found"
    exit 1
fi

echo ""
echo "🎉 Database test completed successfully!"
echo "📖 Next steps:"
echo "   - To start the full web app: ./scripts/start-with-postgresql.sh"
echo "   - To query database directly: psql -d billing_simulator"