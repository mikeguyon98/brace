#!/bin/bash

echo "🚀 Starting Billing Simulator Web Interface..."

# Start API server in background
echo "📡 Starting API server on port 3001..."
cd api && pnpm run dev &
API_PID=$!

# Wait a moment for API to start
sleep 3

# Start frontend in background (from root directory)
echo "🌐 Starting frontend on port 3000..."
cd frontend && pnpm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Both servers are starting..."
echo "📊 API: http://localhost:3001"
echo "🌐 Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for user to stop
wait 