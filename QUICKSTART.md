# 🚀 Quick Start Guide

> **For brand new users** - Complete setup from clone to running system

## Prerequisites

Make sure you have these installed:
- **Docker** and **Docker Compose**
- **Node.js** (v18 or higher)
- **pnpm** (install with: `npm install -g pnpm`)
- **PostgreSQL client tools** (for `psql` command)

## Quick Setup (3 commands)

```bash
# 1. Clone and enter the repository
git clone <your-repo-url> brace
cd brace

# 2. Start everything with one command
./scripts/start-with-docker-postgresql.sh

# 3. Open your browser to http://localhost:3000
```

That's it! 🎉

## What This Does

The startup script will:
1. ✅ Start PostgreSQL containers with Docker
2. ✅ Install all dependencies with pnpm
3. ✅ Build the entire project
4. ✅ Set up the database schema
5. ✅ Start the API server (port 3001)
6. ✅ Start the frontend (port 3000)

## Test the System

1. **Open** http://localhost:3000 in your browser
2. **Go to Configuration** → Start the simulator
3. **Go to Processing** → Upload a test file:
   - Use `data/test-claims-batch1.jsonl` (3 claims)
   - Or `data/test-claims-batch2.jsonl` (2 claims)
4. **Watch** real-time processing!
5. **Upload another file** when the first completes - **this now works!** 🎯

## Multiple File Uploads

The system now supports uploading multiple files in sequence:
- Upload a file → Wait for completion → Upload another file
- No need to restart anything between files
- Each file is processed independently
- View cumulative results in the Results page

## Stop the System

Press **Ctrl+C** in the terminal to stop all services.

This will stop:
- Frontend server
- API server  
- Docker containers

## Troubleshooting

### Port Already in Use
```bash
# Kill processes on ports
lsof -ti:3001,3000 | xargs kill -9
```

### Database Issues
```bash
# Restart containers
docker-compose down
docker-compose up -d
```

### Build Issues
```bash
# Clean install
rm -rf node_modules
pnpm install
pnpm run build
```

## Architecture

- **Frontend**: React + Vite (port 3000)
- **API**: Express + TypeScript (port 3001)  
- **Database**: PostgreSQL in Docker (port 5433)
- **Package Manager**: pnpm with workspaces

## File Structure

```
brace/
├── frontend/          # React frontend
├── api/              # Express API server
├── database/         # PostgreSQL schema
├── data/            # Test claim files
├── scripts/         # Startup scripts
└── docker-compose.yml
```