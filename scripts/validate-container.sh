#!/bin/sh
set -eu

image="ostend-container-validation"
container="ostend-container-validation-$$"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker build --tag "$image" .
docker run --detach \
  --name "$container" \
  --publish 127.0.0.1::8080 \
  --env UPSTREAM_ORIGIN=https://example.com \
  --env PORT=8080 \
  --env LOG_LEVEL=info \
  --env PROFILE_MODE=observe \
  --env REQUEST_TIMEOUT_MS=30000 \
  --env ACKNOWLEDGEMENT_ENABLED=false \
  --env MAX_HEADER_BYTES=16384 \
  --env DEPLOYMENT_MODE=hosted \
  --env SHUTDOWN_GRACE_MS=10000 \
  "$image" >/dev/null

published="$(docker port "$container" 8080/tcp)"
port="${published##*:}"
base_url="http://127.0.0.1:$port"

attempt=0
until health="$(curl --fail --silent --show-error "$base_url/healthz")"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    docker logs "$container"
    exit 1
  fi
  sleep 1
done

ready="$(curl --fail --silent --show-error "$base_url/readyz")"
runtime_uid="$(docker exec "$container" id -u)"

[ "$health" = '{"status":"healthy"}' ]
[ "$ready" = '{"status":"ready"}' ]
[ "$runtime_uid" -ne 0 ]

printf 'container validation passed (runtime uid=%s, health=%s, readiness=%s)\n' \
  "$runtime_uid" "$health" "$ready"
