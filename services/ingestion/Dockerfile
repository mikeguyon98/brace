FROM node:20-alpine

# Install dependencies needed for building native modules
RUN apk add --no-cache python3 make g++

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY services/ingestion/package.json services/ingestion/
COPY tsconfig.json ./

# Copy pnpm lockfile and workspace config BEFORE installing
COPY pnpm-lock.yaml pnpm-workspace.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Copy and build shared package
COPY packages/ packages/
RUN pnpm run build:shared

# Copy and build ingestion service
COPY services/ingestion/ services/ingestion/
RUN pnpm run build:ingestion

# Clean up dev dependencies to reduce image size
RUN pnpm prune --prod

# Create directory for claims files
RUN mkdir -p /data && chown nodejs:nodejs /data

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (if needed for health checks)
EXPOSE 3000

# Set entrypoint
ENTRYPOINT ["node", "services/ingestion/dist/index.js"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)"