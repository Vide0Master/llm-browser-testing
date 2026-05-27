# ==========================================
# Stage 1: Build
# ==========================================
FROM node:22-alpine AS builder

# Build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy root and workspace package configurations
COPY package*.json ./
COPY tsconfig.base.json ./
COPY eslint.config.js ./

# Copy workspace package definitions
COPY packages/backend/package*.json ./packages/backend/
COPY packages/frontend/package*.json ./packages/frontend/

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy all source code
COPY . .

# Generate Prisma Client for schema introspection
RUN npx prisma generate --schema=./packages/backend/prisma/schema.prisma

# Build backend: TypeScript → packages/backend/dist/backend/
RUN npm run build -w @llm-test/backend

# Build frontend: Vite bundle → build/public/
RUN npm run build -w @llm-test/frontend


# ==========================================
# Stage 2: Runtime
# ==========================================
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Runtime dependencies for SQLite
RUN apk add --no-cache python3 make g++

# Copy root package configuration for dependency management
COPY package*.json ./

# Copy backend and frontend package definitions
COPY packages/backend/package*.json ./packages/backend/
COPY packages/frontend/package*.json ./packages/frontend/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy Prisma schema and generate client for runtime
COPY packages/backend/prisma ./packages/backend/prisma
RUN npx prisma generate --schema=./packages/backend/prisma/schema.prisma

# Copy compiled backend artifacts from builder
# Source: packages/backend/dist/backend/ (output from TypeScript build)
# Destination: Keep same structure for path resolution
COPY --from=builder /app/packages/backend/dist/backend ./packages/backend/dist/backend

# Copy compiled frontend artifacts from builder
# Source: build/public/ (output from Vite build)
# Destination: Root-level for backend static serving
COPY --from=builder /app/build/public ./build/public

# Create data directory for SQLite database persistence
RUN mkdir -p /app/data

EXPOSE 3000

# Start backend Node.js application
# Entry point: packages/backend/dist/backend/index.js (compiled from TypeScript)
CMD ["node", "packages/backend/dist/backend/index.js"]