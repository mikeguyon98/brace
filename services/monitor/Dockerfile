FROM node:20-alpine

# Install docker-compose and wget for triggering ingestion and health checks
RUN apk add --no-cache docker-compose wget

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.json ./

# Copy shared package
COPY packages/shared ./packages/shared

# Copy monitor service
COPY services/monitor ./services/monitor

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Build shared package and service
RUN pnpm run build:shared
RUN cd services/monitor && pnpm run build

WORKDIR /app/services/monitor

EXPOSE 3001

CMD ["node", "dist/index.js"]