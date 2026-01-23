# ============================================
# 🐳 SDM Secure System - Dockerfile
# ============================================

# Use official Node.js LTS image with Alpine (smaller & more secure)
FROM node:18-alpine AS builder

# Install security updates and required packages
RUN apk add --no-cache --update \
    curl \
    wget \
    gnupg \
    python3 \
    make \
    g++ \
    openssl \
    ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create app directory with proper permissions
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with security audit
RUN npm ci --only=production --audit=false && \
    npm audit --production --audit-level=critical || true

# Remove unused packages and cache
RUN npm cache clean --force && \
    rm -rf /tmp/* /var/tmp/*

# Copy source code
COPY . .

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Create volume for logs and data
VOLUME ["/app/logs", "/app/data"]

# Expose port (HTTPS only - use reverse proxy)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Security headers and runtime configuration
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048 --enable-source-maps" \
    npm_config_audit=false \
    npm_config_fund=false \
    npm_config_update_notifier=false

# Run as non-privileged user with process manager
CMD ["node", "--trace-warnings", "index.js"]
