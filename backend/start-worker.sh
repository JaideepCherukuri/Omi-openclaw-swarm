#!/bin/bash
# RQ Worker startup script with unique worker name
# Prevents "worker named 'default' already" errors

# Use Railway deployment ID if available, otherwise generate random ID
WORKER_NAME="${RQ_WORKER_NAME:-worker-${RAILWAY_DEPLOYMENT_ID:-$(head -c 8 /dev/urandom | xxd -p)}}"

REDIS_URL="${RQ_REDIS_URL:-redis://localhost:6379/0}"

echo "Starting RQ worker: $WORKER_NAME"
echo "Queue: ${RQ_QUEUE_NAME:-default}"
echo "Redis: $REDIS_URL"

# Clear any existing worker registrations from Redis
# This prevents "worker named 'X' already" errors after container restart
echo "Clearing old worker registrations..."
python3 -c "
import redis
import sys

try:
    r = redis.Redis.from_url('$REDIS_URL')
    worker_keys = r.keys('rq:worker:*')
    if worker_keys:
        r.delete(*worker_keys)
        print(f'Cleared {len(worker_keys)} old worker registrations')
    else:
        print('No old worker registrations found')
except Exception as e:
    print(f'Warning: Could not clear old workers: {e}')
    sys.exit(0)
"

# Start RQ worker with unique name
exec rq worker "$WORKER_NAME" \
    --url "$REDIS_URL" \
    --name "$WORKER_NAME" \
    --burst "${RQ_BURST_MODE:-false}"
