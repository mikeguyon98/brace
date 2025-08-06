#!/bin/bash

# Start the single-process billing simulator

set -e

echo "Starting Single-Process Billing Simulator..."
echo "============================================"

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    echo "Error: Please run this script from the project root directory"
    exit 1
fi

# Check if PostgreSQL is running (we still need it for data persistence)
echo "Checking PostgreSQL availability..."

# Try to connect to the databases
if ! pg_isready -h localhost -p 5434 -d clearinghouse -U postgres > /dev/null 2>&1; then
    echo "Warning: Clearinghouse database not available at localhost:5434"
    echo "You may need to start PostgreSQL or update the configuration"
fi

if ! pg_isready -h localhost -p 5433 -d billing -U postgres > /dev/null 2>&1; then
    echo "Warning: Billing database not available at localhost:5433"  
    echo "You may need to start PostgreSQL or update the configuration"
fi

echo ""
echo "Starting the single-process simulator..."
echo "This will run all services in a single Node.js process with in-memory queuing"
echo ""

cd src
pnpm install
pnpm run dev