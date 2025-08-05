#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Billing Simulator: npm → pnpm Migration${NC}"
echo "============================================="

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}Installing pnpm globally...${NC}"
    npm install -g pnpm
fi

echo -e "${GREEN}✅ pnpm version: $(pnpm --version)${NC}"

# Backup existing files
echo -e "${YELLOW}📦 Creating backup of existing files...${NC}"
mkdir -p .migration-backup
cp package-lock.json .migration-backup/ 2>/dev/null || echo "No package-lock.json to backup"
cp -r node_modules .migration-backup/ 2>/dev/null || echo "No node_modules to backup"

# Clean existing npm artifacts
echo -e "${YELLOW}🧹 Cleaning npm artifacts...${NC}"
rm -rf node_modules package-lock.json
find . -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
find . -name "package-lock.json" -delete 2>/dev/null || true

# Create pnpm workspace configuration
echo -e "${YELLOW}⚙️  Creating pnpm-workspace.yaml...${NC}"
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'packages/*'
  - 'services/*'
EOF

# Create .npmrc for optimizations
echo -e "${YELLOW}⚙️  Creating optimized .npmrc...${NC}"
cat > .npmrc << 'EOF'
# Performance optimizations
prefer-frozen-lockfile=true
package-import-method=hardlink

# Monorepo settings
hoist=true
shamefully-hoist=false

# Security
audit-level=moderate

# Auto-install peer dependencies
auto-install-peers=true
EOF

# Update package.json scripts
echo -e "${YELLOW}📝 Updating package.json scripts for pnpm...${NC}"
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Update scripts to use pnpm filtering
pkg.scripts = {
  ...pkg.scripts,
  'build': 'pnpm run build:shared && pnpm run build:services',
  'build:shared': 'pnpm --filter @billing-simulator/shared build',
  'build:services': 'pnpm --filter \"@billing-simulator/*\" --filter \"!@billing-simulator/shared\" build',
  'dev:all': 'pnpm --filter \"@billing-simulator/*\" --parallel dev',
  'test:all': 'pnpm --filter \"@billing-simulator/*\" test',
  'clean': 'pnpm --filter \"@billing-simulator/*\" --parallel clean',
};

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ Updated package.json scripts');
"

# Install dependencies with pnpm
echo -e "${YELLOW}📦 Installing dependencies with pnpm...${NC}"
echo "This may take a moment on first run (building global store)..."

start_time=$(date +%s)
pnpm install
end_time=$(date +%s)
install_time=$((end_time - start_time))

echo -e "${GREEN}✅ Installation completed in ${install_time} seconds!${NC}"

# Update Dockerfiles to use pnpm
echo -e "${YELLOW}🐳 Updating Dockerfiles...${NC}"

# Function to update Dockerfile
update_dockerfile() {
    local dockerfile="$1"
    if [ -f "$dockerfile" ]; then
        echo "Updating $dockerfile..."
        
        # Backup original
        cp "$dockerfile" "$dockerfile.backup"
        
        # Update Dockerfile
        sed -i.tmp \
            -e 's/npm ci --only=production/pnpm install --frozen-lockfile --prod/g' \
            -e 's/npm ci/pnpm install --frozen-lockfile/g' \
            -e 's/npm install/pnpm install/g' \
            -e 's/npm run/pnpm run/g' \
            "$dockerfile"
        rm "$dockerfile.tmp"
    fi
}

# Update all Dockerfiles
find . -name "Dockerfile*" -exec bash -c 'update_dockerfile "$0"' {} \;

# Update docker-compose.yml if needed
if [ -f "docker-compose.yml" ]; then
    echo "Updating docker-compose.yml for pnpm..."
    cp docker-compose.yml docker-compose.yml.backup
    
    # Update any npm references in environment or commands
    sed -i.tmp 's/npm install/pnpm install/g' docker-compose.yml
    rm docker-compose.yml.tmp
fi

# Show disk space savings
echo -e "${BLUE}💾 Disk Space Analysis:${NC}"
if [ -d ".migration-backup/node_modules" ]; then
    old_size=$(du -sh .migration-backup/node_modules 2>/dev/null | cut -f1)
    echo "  npm node_modules: $old_size"
fi

if [ -d "node_modules" ]; then
    new_size=$(du -sh node_modules 2>/dev/null | cut -f1)
    echo "  pnpm node_modules: $new_size"
fi

pnpm_store_size=$(du -sh ~/.pnpm-store 2>/dev/null | cut -f1 || echo "Unknown")
echo "  pnpm global store: $pnpm_store_size"

# Test the migration
echo -e "${YELLOW}🧪 Testing the migration...${NC}"

# Build shared package
echo "Building shared package..."
if pnpm --filter @billing-simulator/shared build; then
    echo -e "${GREEN}✅ Shared package builds successfully${NC}"
else
    echo -e "${RED}❌ Shared package build failed${NC}"
    exit 1
fi

# Try building one service
echo "Testing service build..."
if pnpm --filter @billing-simulator/ingestion build; then
    echo -e "${GREEN}✅ Service builds successfully${NC}"
else
    echo -e "${RED}❌ Service build failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Migration to pnpm completed successfully!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Test your services: pnpm --filter <service-name> dev"
echo "2. Run all tests: pnpm test:all"
echo "3. Build everything: pnpm build"
echo "4. Start the simulator: ./scripts/start-simulator.sh"
echo ""
echo -e "${BLUE}Performance commands:${NC}"
echo "  pnpm --filter clearinghouse dev    # Run specific service"
echo "  pnpm --filter '@billing-simulator/*' --parallel test  # Parallel testing"
echo "  pnpm --filter '...@billing-simulator/shared' build   # Build dependents"
echo ""
echo -e "${YELLOW}💡 Tip: Check migrate-to-pnpm.md for more pnpm tips and tricks!${NC}"