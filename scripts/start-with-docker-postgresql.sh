#!/bin/bash

# Complete Docker + PostgreSQL + Web App Startup Script
# For brand new users: handles Docker containers, pnpm builds, and starts both API and frontend

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

print_header "🏥 BILLING SIMULATOR WITH DOCKER + POSTGRESQL"
print_header "=============================================="
echo ""

# Check if required tools are installed
print_status "Checking required tools..."

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    print_error "pnpm is not installed. Please install pnpm first:"
    echo "   npm install -g pnpm"
    exit 1
fi

if ! command -v psql &> /dev/null; then
    print_error "PostgreSQL client (psql) is not installed. Please install PostgreSQL client tools."
    exit 1
fi

print_success "All required tools are installed"

# Start Docker containers
print_status "Starting PostgreSQL containers with Docker Compose..."
docker-compose up -d

# Wait for containers to be healthy
print_status "Waiting for PostgreSQL containers to be ready..."
for i in {1..30}; do
    if docker-compose ps postgres-billing | grep -q "healthy"; then
        print_success "PostgreSQL billing container is healthy"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "PostgreSQL containers failed to start within 30 seconds"
        print_status "Container status:"
        docker-compose ps
        exit 1
    fi
    sleep 1
done

# Database connection parameters for Docker containers
DB_HOST="localhost"
DB_PORT="5433"  # postgres-billing container port
DB_USER="postgres"
DB_PASSWORD="postgres"
DB_NAME="billing_simulator"

# Set PGPASSWORD environment variable to avoid password prompts
export PGPASSWORD="$DB_PASSWORD"

# Test database connection
print_status "Testing database connection..."
if ! pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER >/dev/null 2>&1; then
    print_error "Cannot connect to PostgreSQL container"
    print_status "Container logs:"
    docker-compose logs postgres-billing
    exit 1
fi

print_success "Connected to PostgreSQL container"

# Set up database schema
print_status "Setting up database schema..."

# Create database if it doesn't exist
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
    print_success "Database '$DB_NAME' created"
else
    print_warning "Database '$DB_NAME' already exists"
fi

# Run the schema file
if [ -f "database/schema.sql" ]; then
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f database/schema.sql
    print_success "Database schema created successfully"
else
    print_error "Schema file 'database/schema.sql' not found"
    exit 1
fi

# Install dependencies with pnpm
print_status "Installing dependencies with pnpm..."
pnpm install

# Build the project
print_status "Building the project with pnpm..."
pnpm run build
if [ $? -ne 0 ]; then
    print_error "Build failed"
    exit 1
fi

print_success "Build completed successfully"

# Clean up any existing processes
print_status "Cleaning up any existing processes..."
kill_port 3001  # API port
kill_port 3000  # Frontend dev port (configured in vite.config.ts)
kill_port 4173  # Frontend preview port

# Start the API server in background
print_status "Starting API server on port 3001..."
cd api
pnpm start &
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
pnpm run dev &
FRONTEND_PID=$!
cd ..

# Wait for frontend to start
print_status "Waiting for frontend server to start..."
for i in {1..30}; do
    if check_port 3000; then
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
echo "🌐 Frontend:  http://localhost:3000"
echo "🔌 API:       http://localhost:3001"
echo "🐘 Database:  postgresql://localhost:5433/billing_simulator"
echo ""
print_header "🧪 TEST THE SYSTEM"
print_header "=================="
echo ""
echo "1. Open http://localhost:3000 in your browser"
echo "2. Go to Configuration → Start the simulator"
echo "3. Go to Processing → Upload test-claims-batch1.jsonl from data/ folder"
echo "4. Watch real-time processing data from PostgreSQL"
echo "5. Upload another file when the first completes!"
echo ""
print_header "🛑 TO STOP THE SERVICES"
print_header "======================"
echo ""
echo "Press Ctrl+C to stop all services gracefully"
echo "To stop Docker containers: docker-compose down"
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
    lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
    
    print_status "Stopping Docker containers..."
    docker-compose down
    
    print_success "All services stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM EXIT

# Keep the script running and monitor processes
print_status "Services are running. Press Ctrl+C to stop all services"
echo ""

# Monitor processes
while true; do
    if ! kill -0 $API_PID 2>/dev/null || ! kill -0 $FRONTEND_PID 2>/dev/null; then
        print_error "One of the services stopped unexpectedly"
        cleanup
    fi
    sleep 5
done