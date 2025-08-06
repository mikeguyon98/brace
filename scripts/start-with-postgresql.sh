#!/bin/bash

# Complete PostgreSQL + Web App Startup Script
# Sets up database, builds project, and starts both API and frontend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
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

print_header() {
    echo -e "${PURPLE}$1${NC}"
}

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to kill processes on a port
kill_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$pids" ]; then
        print_warning "Killing existing processes on port $port"
        echo $pids | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
}

print_header "🏥 BILLING SIMULATOR WITH POSTGRESQL"
print_header "===================================="
echo ""

# Database connection parameters (can be overridden by environment variables)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"  # Changed to match your postgres-billing container
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"  # Default password from docker-compose.yml

# Set PGPASSWORD environment variable to avoid password prompts
export PGPASSWORD="$DB_PASSWORD"

# Check if PostgreSQL is running
print_status "Checking PostgreSQL status on ${DB_HOST}:${DB_PORT}..."
if ! pg_isready -h $DB_HOST -p $DB_PORT >/dev/null 2>&1; then
    print_error "PostgreSQL is not running or not accessible"
    print_status "Starting PostgreSQL..."
    
    # Try to start PostgreSQL (different methods for different systems)
    if command -v brew >/dev/null 2>&1; then
        brew services start postgresql || true
    elif command -v systemctl >/dev/null 2>&1; then
        sudo systemctl start postgresql || true
    elif command -v service >/dev/null 2>&1; then
        sudo service postgresql start || true
    fi
    
    # Wait a bit for PostgreSQL to start
    sleep 3
    
    if ! pg_isready -h $DB_HOST -p $DB_PORT >/dev/null 2>&1; then
        print_error "Failed to start PostgreSQL. Please start it manually and run this script again."
        exit 1
    fi
fi

print_success "PostgreSQL is running"

# Set up database if needed
print_status "Setting up database..."
if [ -f "scripts/setup-postgresql.sh" ]; then
    ./scripts/setup-postgresql.sh
else
    print_error "Database setup script not found"
    exit 1
fi

# Test database connection
print_status "Testing database integration..."
if [ -f "test-postgresql-integration.js" ]; then
    node test-postgresql-integration.js
    if [ $? -ne 0 ]; then
        print_error "Database integration test failed"
        exit 1
    fi
else
    print_warning "Database test script not found, skipping test"
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_status "Installing root dependencies..."
    npm install
fi

if [ ! -d "src/node_modules" ]; then
    print_status "Installing src dependencies..."
    cd src && npm install && cd ..
fi

if [ ! -d "api/node_modules" ]; then
    print_status "Installing API dependencies..."
    cd api && npm install && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    print_status "Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Build the project
print_status "Building the project..."
npm run build
if [ $? -ne 0 ]; then
    print_error "Build failed"
    exit 1
fi

print_success "Build completed successfully"

# Clean up any existing processes
print_status "Cleaning up any existing processes..."
kill_port 3001  # API port
kill_port 5173  # Frontend dev port
kill_port 4173  # Frontend preview port

# Start the API server in background
print_status "Starting API server on port 3001..."
cd api
npm start &
API_PID=$!
cd ..

# Wait for API to start
print_status "Waiting for API server to start..."
for i in {1..30}; do
    if check_port 3001; then
        print_success "API server started successfully"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "API server failed to start within 30 seconds"
        kill $API_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# Start the frontend in background
print_status "Starting frontend development server..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# Wait for frontend to start
print_status "Waiting for frontend server to start..."
for i in {1..30}; do
    if check_port 5173; then
        print_success "Frontend server started successfully"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "Frontend server failed to start within 30 seconds"
        kill $API_PID 2>/dev/null || true
        kill $FRONTEND_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

print_success "🎉 All services started successfully!"
echo ""
print_header "📱 ACCESS YOUR APPLICATION"
print_header "=========================="
echo ""
echo "🌐 Frontend:  http://localhost:5173"
echo "🔌 API:       http://localhost:3001"
echo "🐘 Database:  postgresql://localhost:5432/billing_simulator"
echo ""
print_header "🧪 TEST THE SYSTEM"
print_header "=================="
echo ""
echo "1. Open http://localhost:5173 in your browser"
echo "2. Upload a claims file (try: scripts/generate-claims.js > test-claims.jsonl)"
echo "3. Watch real-time processing data from PostgreSQL"
echo "4. Check database directly: psql -d billing_simulator"
echo ""
print_header "🛑 TO STOP THE SERVICES"
print_header "======================"
echo ""
echo "Press Ctrl+C to stop all services gracefully"
echo ""

# Function to cleanup on exit
cleanup() {
    print_status "Shutting down services..."
    
    # Kill API and frontend processes
    if [ ! -z "$API_PID" ]; then
        kill $API_PID 2>/dev/null || true
        print_status "Stopped API server"
    fi
    
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
        print_status "Stopped frontend server"
    fi
    
    # Kill any remaining processes on the ports
    pkill -f "node.*dist/index.js" 2>/dev/null || true
    pkill -f "vite.*dev" 2>/dev/null || true
    
    # Force kill if needed
    lsof -ti:3001 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti:3000,5173 2>/dev/null | xargs kill -9 2>/dev/null || true
    
    print_success "All services stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM EXIT

# Keep the script running and show logs
print_status "Services are running. Showing combined logs..."
print_status "Press Ctrl+C to stop all services"
echo ""

# Instead of waiting indefinitely, check if processes are still running
while true; do
    if ! kill -0 $API_PID 2>/dev/null || ! kill -0 $FRONTEND_PID 2>/dev/null; then
        print_error "One of the services stopped unexpectedly"
        cleanup
    fi
    sleep 5
done