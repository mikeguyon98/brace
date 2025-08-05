#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Billing Simulator Startup Script${NC}"
echo "=================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: docker-compose is not installed.${NC}"
    exit 1
fi

# Function to wait for service to be healthy
wait_for_service() {
    local service=$1
    local max_attempts=30
    local attempt=1
    
    echo -e "${YELLOW}Waiting for $service to be healthy...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose ps $service | grep -q "healthy"; then
            echo -e "${GREEN}$service is healthy!${NC}"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}$service failed to become healthy after $max_attempts attempts${NC}"
    return 1
}

# Build and start infrastructure services
echo -e "${YELLOW}Building Docker images...${NC}"
docker-compose build

echo -e "${YELLOW}Starting infrastructure services...${NC}"
docker-compose up -d redis postgres-clearinghouse postgres-billing

# Wait for infrastructure to be ready
wait_for_service redis
wait_for_service postgres-clearinghouse
wait_for_service postgres-billing

echo -e "${YELLOW}Starting application services...${NC}"
docker-compose up -d clearinghouse billing payer-aetna payer-bcbs payer-cigna payer-humana payer-medicare

# Wait for application services
sleep 10

echo -e "${GREEN}All services are starting up!${NC}"
echo ""
echo "Service Status:"
docker-compose ps

echo ""
echo -e "${BLUE}To monitor logs:${NC}"
echo "  docker-compose logs -f [service-name]"
echo ""
echo -e "${BLUE}To run ingestion with sample data:${NC}"
echo "  # Generate sample claims:"
echo "  node scripts/generate-claims.js 1000 claims.jsonl"
echo ""
echo "  # Run ingestion:"
echo "  docker-compose run --rm -v \$(pwd):/data ingestion /data/claims.jsonl --rate=2.0"
echo ""
echo -e "${BLUE}To stop all services:${NC}"
echo "  docker-compose down"
echo ""
echo -e "${GREEN}Billing simulator is ready!${NC}"