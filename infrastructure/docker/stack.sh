#!/usr/bin/env bash
# The hosted stack without a compose tool: the same containers, networks and limits as compose.yml, started with plain `podman` or `docker`.
#   ENGINE=podman ./stack.sh up | down | status       (set the variables from .env.example in the environment first)
set -euo pipefail
E=${ENGINE:-podman}; P=${STACK:-ove}; : "${POSTGRES_PASSWORD:?}" "${REDIS_PASSWORD:?}" "${PUBLIC_ORIGIN:?}"
PORT=${STUDIO_PORT:-3100}; HARD="--cap-drop=ALL --security-opt no-new-privileges"; DB_CAPS="--cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE --cap-add=FOWNER"
REDIS_URL="redis://:${REDIS_PASSWORD}@${P}-redis:6379"
case "${1:-up}" in
down) for c in api worker-render worker-ai redis postgres; do $E rm -f "$P-$c" >/dev/null 2>&1 || true; done; $E network rm "$P-internal" "$P-edge" >/dev/null 2>&1 || true;;
status) $E ps --filter "name=$P-" --format '{{.Names}}  {{.Status}}';;
up)
  $E network create --internal "$P-internal" >/dev/null 2>&1 || true; $E network create "$P-edge" >/dev/null 2>&1 || true
  for v in data pgdata redisdata; do $E volume create "$P-$v" >/dev/null 2>&1 || true; done
  $E run -d --name "$P-postgres" --network "$P-internal" $HARD $DB_CAPS -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" -e POSTGRES_DB=ove -v "$P-pgdata:/var/lib/postgresql/data" docker.io/library/postgres:16-alpine
  $E run -d --name "$P-redis" --network "$P-internal" $HARD $DB_CAPS -v "$P-redisdata:/data" docker.io/library/redis:7-alpine redis-server --requirepass "$REDIS_PASSWORD" --appendonly yes
  sleep 8
  COMMON="-e DATA_DIR=/data -v $P-data:/data --read-only --tmpfs /tmp --tmpfs /home/node:mode=1777 --init $HARD --pids-limit 512"
  $E run -d --name "$P-api" --network "$P-internal" -p "127.0.0.1:$PORT:3100" $COMMON --memory 1g \
    -e DATABASE_URL="postgres://postgres:${POSTGRES_PASSWORD}@${P}-postgres:5432/ove" -e REDIS_URL="$REDIS_URL" -e PUBLIC_ORIGIN="$PUBLIC_ORIGIN" -e TRUST_PROXY="${TRUST_PROXY:-1}" -e SIGNUPS="${SIGNUPS:-1}" -e REQUIRE_VERIFIED="${REQUIRE_VERIFIED:-0}" "${API_IMAGE:-ove-api:local}"
  $E network connect "$P-edge" "$P-api"
  $E run -d --name "$P-worker-render" --network "$P-internal" $COMMON --shm-size=1g --memory 3g --cpus 2 -e JOB_LANE=render -e REDIS_URL="$REDIS_URL" "${WORKER_IMAGE:-ove-worker:local}"
  $E run -d --name "$P-worker-ai" --network "$P-internal" $COMMON --shm-size=1g --memory 2g --cpus 1 -e JOB_LANE=ai -e REDIS_URL="$REDIS_URL" -e GROQ_API_KEY="${GROQ_API_KEY:-}" "${WORKER_IMAGE:-ove-worker:local}"
  $E network connect "$P-edge" "$P-worker-ai"
  echo "up: http://127.0.0.1:$PORT/ (public address $PUBLIC_ORIGIN)";;
esac
