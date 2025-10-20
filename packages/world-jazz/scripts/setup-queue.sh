#!/bin/sh
set -e

JAZZ_RUN="pnpm exec jazz-run"

if [ -z "$JAZZ_API_KEY" ]; then
  echo "JAZZ_API_KEY is not set"
  exit 1
fi

# Create a worker account
account=$($JAZZ_RUN account create --name "Queue Pusher")

# Create a webhook registry
registry=$($JAZZ_RUN webhook create-registry)

# Make the necessary env vars available for the next command
eval "$account"
eval "$registry"
export \
  JAZZ_WORKER_ACCOUNT \
  JAZZ_WEBHOOK_ACCOUNT \
  JAZZ_WEBHOOK_ACCOUNT_SECRET \
  JAZZ_WEBHOOK_REGISTRY_ID

# Grant the worker account access to the webhook registry
$JAZZ_RUN webhook grant --accountID $JAZZ_WORKER_ACCOUNT >&2

echo "JAZZ_API_KEY=$JAZZ_API_KEY"
echo "$account"
echo ""
echo "$registry"
