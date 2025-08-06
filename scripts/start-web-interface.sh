#!/bin/bash

# Billing Simulator Web Interface Startup Script

set -e

echo "🏥 Starting Billing Simulator Web Interface..."
echo "=============================================="

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install pnpm first:"
    echo "   npm install -g pnpm"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "pnpm-workspace.yaml" ]; then
    echo "❌ Please run this script from the billing simulator root directory"
    exit 1
fi

echo "📦 Installing dependencies..."
pnpm install

echo "🔨 Building packages..."
pnpm run build

echo "🚀 Starting web interface..."
echo ""
echo "The web interface will be available at:"
echo "   Frontend: http://localhost:3000"
echo "   API:      http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Start both API and frontend concurrently
pnpm run start:web 