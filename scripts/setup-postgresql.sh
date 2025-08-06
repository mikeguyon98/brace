#!/bin/bash

# PostgreSQL Setup Script for Billing Simulator
# Creates the database and tables needed for the simplified architecture

set -e

echo "🐘 Setting up PostgreSQL for Billing Simulator"
echo "============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    print_error "PostgreSQL is not installed. Please install PostgreSQL first."
    exit 1
fi

print_success "PostgreSQL is installed"

# Default database connection parameters (can be overridden by environment variables)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"  # Changed to match your postgres-billing container
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"  # Default password from docker-compose.yml
DB_NAME="billing_simulator"

# Set PGPASSWORD environment variable to avoid password prompts
export PGPASSWORD="$DB_PASSWORD"

print_status "Database connection parameters:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Password: [CONFIGURED]"
echo "  Database: $DB_NAME"

# Create database if it doesn't exist
print_status "Creating database '$DB_NAME'..."

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    print_warning "Database '$DB_NAME' already exists"
else
    createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
    print_success "Database '$DB_NAME' created"
fi

# Run the schema file
print_status "Setting up database schema..."

if [ -f "database/schema.sql" ]; then
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f database/schema.sql
    print_success "Database schema created successfully"
else
    print_error "Schema file 'database/schema.sql' not found"
    exit 1
fi

# Verify tables were created
print_status "Verifying table creation..."

TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")

if [ "$TABLE_COUNT" -gt 0 ]; then
    print_success "Found $TABLE_COUNT tables in the database"
    
    # List the tables
    print_status "Tables created:"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\dt"
    
    # List the views
    print_status "Views created:"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\dv"
    
else
    print_error "No tables found. Schema setup may have failed."
    exit 1
fi

print_success "PostgreSQL setup completed successfully!"
echo ""
echo "🎉 Your database is ready for the Billing Simulator"
echo "=================================================="
echo "✅ Database: $DB_NAME"
echo "✅ Tables: claims (with indexes)"
echo "✅ Views: processing_stats, payer_stats, recent_activity, throughput_stats"
echo ""
echo "📖 Next steps:"
echo "1. Install dependencies: npm install"
echo "2. Build the project: npm run build"
echo "3. Start the API: cd api && npm start"
echo "4. Test with claims processing"
echo ""
echo "🔗 The frontend will now show real-time data from PostgreSQL!"