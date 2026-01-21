# Multi-stage build for MCP Mobile Test AI
FROM node:18-alpine AS base

# Install dependencies for native modules
RUN apk add --no-cache libc6-compat openssl

# Set working directory
WORKDIR /app

# Copy package files
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 mcpuser

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# Create logs directory
RUN mkdir -p logs && chown -R mcpuser:nodejs logs

# Set permissions
RUN chown -R mcpuser:nodejs /app

USER mcpuser

EXPOSE 3000

CMD ["node", "dist/server/bin.js"]
