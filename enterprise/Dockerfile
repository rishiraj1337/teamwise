FROM node:20-bookworm-slim AS base

WORKDIR /app

# Install security updates and dumb-init for proper signal handling
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package descriptors
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source and assets
COPY sql/ ./sql/
COPY src/ ./src/

# Create runtime directories with non-root permissions
RUN mkdir -p /app/logs /app/data/uploads/processed /app/data/uploads/failed \
    && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/index.js"]
