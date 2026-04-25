#!/usr/bin/env sh
set -eu

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-self-hosted-devops}"
API_URL="${API_URL:-http://api.localhost/ready}"

docker compose -p "$COMPOSE_PROJECT_NAME" build api
docker compose -p "$COMPOSE_PROJECT_NAME" up -d

printf "Waiting for API readiness at %s\n" "$API_URL"

attempt=1
while [ "$attempt" -le 30 ]; do
  if curl -fsS "$API_URL" >/dev/null; then
    printf "Deployment completed\n"
    exit 0
  fi

  attempt=$((attempt + 1))
  sleep 2
done

printf "Deployment failed readiness check\n" >&2
docker compose -p "$COMPOSE_PROJECT_NAME" ps
exit 1
