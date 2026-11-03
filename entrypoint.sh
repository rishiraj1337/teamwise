#!/bin/sh
set -e

echo "=== Initializing fin-ai Unified Monorepo ==="

# Wait for MySQL if DB_HOST or MYSQL_HOST is specified and reachable
WAIT_HOST="${MYSQL_HOST:-${DB_HOST:-}}"
WAIT_PORT="${MYSQL_PORT:-${DB_PORT:-3306}}"

if [ -n "$WAIT_HOST" ] && [ "$WAIT_HOST" != "127.0.0.1" ] && [ "$WAIT_HOST" != "localhost" ]; then
  echo "Checking database connectivity to $WAIT_HOST:$WAIT_PORT..."
  MAX_RETRIES=30
  RETRY_COUNT=0
  until nc -z -w 2 "$WAIT_HOST" "$WAIT_PORT" 2>/dev/null || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for database at $WAIT_HOST:$WAIT_PORT ($RETRY_COUNT/$MAX_RETRIES)..."
    sleep 2
  done
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "Warning: Database not reachable after $MAX_RETRIES attempts, continuing anyway..."
  else
    echo "Database is ready!"
  fi
fi

# Run backend Alembic database migrations
echo "Executing FastAPI Backend database migrations (Alembic)..."
(cd /app/backend && alembic upgrade head || echo "Note: Alembic migrations skipped or handled externally.")

echo "Starting unified services via Supervisor (FastAPI, Enterprise Node.js, Nginx)..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
