#!/bin/bash

# Clear Claims Database Script
# Removes all prior claims from the PostgreSQL database
# This script will PERMANENTLY DELETE all data in the claims table

set -e

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

echo "🗑️  Clear Claims Database Script"
echo "================================="

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    print_error "PostgreSQL is not installed. Please install PostgreSQL first."
    exit 1
fi

# Database connection parameters (can be overridden by environment variables)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
DB_NAME="billing_simulator"

# Set PGPASSWORD environment variable to avoid password prompts
export PGPASSWORD="$DB_PASSWORD"

print_status "Database connection parameters:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Database: $DB_NAME"

# Check if database exists
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    print_error "Database '$DB_NAME' does not exist"
    exit 1
fi

# Get current claim count
print_status "Checking current claim count..."
CLAIM_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM claims;" | tr -d ' ')

if [ "$CLAIM_COUNT" -eq 0 ]; then
    print_warning "No claims found in the database"
    exit 0
fi

print_warning "Found $CLAIM_COUNT claims in the database"

# Confirmation prompt (unless --force flag is used)
if [[ "$1" != "--force" ]]; then
    echo ""
    print_warning "⚠️  WARNING: This will PERMANENTLY DELETE all $CLAIM_COUNT claims from the database!"
    print_warning "This action cannot be undone."
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_status "Operation cancelled"
        exit 0
    fi
fi

# Clear the claims table
print_status "Clearing claims table..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "TRUNCATE TABLE claims RESTART IDENTITY CASCADE;"

# Verify the table is empty
REMAINING_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM claims;" | tr -d ' ')

if [ "$REMAINING_COUNT" -eq 0 ]; then
    print_success "Successfully cleared all claims from the database"
    print_success "Claims table is now empty"
else
    print_error "Failed to clear claims. $REMAINING_COUNT claims still remain"
    exit 1
fi

# Optional: Reset the sequence counter for the ID column
print_status "Resetting ID sequence counter..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "ALTER SEQUENCE claims_id_seq RESTART WITH 1;"

print_success "Database cleanup completed successfully!"
echo ""
echo "✅ Cleared $CLAIM_COUNT claims"
echo "✅ Reset ID sequence"
echo "✅ Database is ready for new claims"
echo ""
print_status "You can now start processing new claims with a clean database"