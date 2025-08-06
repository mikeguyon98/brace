#!/bin/bash

# Emergency stop script for billing simulator services

echo "🛑 Stopping all Billing Simulator services..."

# Kill processes by port
echo "📍 Killing processes on ports 3000, 3001, 5173..."
lsof -ti:3000,3001,5173 2>/dev/null | xargs kill -9 2>/dev/null || true

# Kill by process name
echo "🔄 Killing Node.js processes..."
pkill -f "node.*dist/index.js" 2>/dev/null || true
pkill -f "vite.*dev" 2>/dev/null || true
pkill -f "billing-simulator" 2>/dev/null || true

# Kill any remaining Node processes that might be related
echo "🧹 Cleaning up any remaining processes..."
ps aux | grep -E "(billing|simulator)" | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null || true

echo "✅ All services stopped!"
echo ""
echo "🔍 Checking ports..."
if lsof -i:3000,3001,5173 2>/dev/null; then
    echo "⚠️  Some processes may still be running"
else
    echo "✅ All ports clear"
fi