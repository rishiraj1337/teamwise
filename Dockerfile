# Multi-stage Dockerfile for fin-ai Monorepo (UI, FastAPI Backend, Enterprise Node.js Backend)

# Stage 1: Build UI static assets
FROM node:20-bookworm-slim AS ui-builder
WORKDIR /app/ui
COPY ui/package*.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

# Stage 2: Final unified runtime
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    PORT=3000 \
    HOST=127.0.0.1

# Install system dependencies: Node.js 20, Nginx, Supervisor, curl, dumb-init, netcat
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    nginx \
    supervisor \
    dumb-init \
    netcat-openbsd \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Setup Python FastAPI Backend
COPY backend/requirements.txt /app/backend/
RUN pip install --no-cache-dir -r /app/backend/requirements.txt
COPY backend/ /app/backend/

# 2. Setup Enterprise Node.js Backend
COPY enterprise/package*.json /app/enterprise/
RUN cd /app/enterprise && npm ci --omit=dev
COPY enterprise/ /app/enterprise/
RUN mkdir -p /app/enterprise/logs \
    /app/enterprise/data/uploads/processed \
    /app/enterprise/data/uploads/failed \
    /app/enterprise/data/uploads/non-support \
    /app/data/incoming-emails

# 3. Setup UI Static Assets
COPY --from=ui-builder /app/ui/dist /var/www/html

# 4. Setup Nginx & Supervisor
COPY nginx.conf /etc/nginx/nginx.conf
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh \
    && mkdir -p /var/log/supervisor /run /var/log/nginx

EXPOSE 80 8000 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/app/entrypoint.sh"]
