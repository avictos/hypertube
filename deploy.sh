#!/usr/bin/env bash
# Brings the whole Hypertube stack up from zero: containers, both databases'
# schemas, and the three app services. Safe to re-run — every step is
# idempotent (skips what's already done).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

ROOT_DIR="$(pwd)"
NETWORK_NAME="hypertube-net"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$1" >&2; exit 1; }

# Reads a single KEY=value out of an .env file without sourcing the whole
# file — sourcing both services' .env files into one shell would clobber
# same-named vars (POSTGRES_USER, DATABASE_URL, ...) across services.
env_var() {
    local file="$1" key="$2"
    [ -f "$file" ] || die "Missing $file — copy it from your local setup before running this script."
    grep -E "^${key}=" "$file" | tail -n1 | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//'
}

wait_for_healthy() {
    local container="$1" timeout="${2:-90}" waited=0
    log "Waiting for $container to be healthy..."
    
    while true; do
        # Safely grab the health status. If inspect fails, or no healthcheck exists, 
        # it catches the error instead of killing the script via set -e.
        local status
        status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no_healthcheck_defined{{end}}' "$container" 2>/dev/null || echo "inspect_failed")
        
        if [ "$status" = "healthy" ]; then
            break
        fi

        # Print debug info every 10 seconds so you aren't left in the dark
        if [ $((waited % 10)) -eq 0 ] && [ "$waited" -ne 0 ]; then
            printf "  ⏳ [%ds] Current status of %s: %s\n" "$waited" "$container" "$status"
            
            # If the container actually crashed, dump logs immediately
            local run_state
            run_state=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")
            if [ "$run_state" = "exited" ] || [ "$run_state" = "restarting" ]; then
                printf "\n\033[1;33m⚠️  %s is %s! Last 15 lines of logs:\033[0m\n" "$container" "$run_state"
                docker logs "$container" --tail 15
            fi
        fi

        if [ "$waited" -ge "$timeout" ]; then
            printf "\n\033[1;31m========== TIMEOUT LOGS FOR %s ==========\033[0m\n" "$container" >&2
            docker logs "$container" --tail 50 >&2
            printf "\033[1;31m====================================================\033[0m\n" >&2
            die "Timed out waiting for $container to become healthy. Final status: $status"
        fi

        sleep 2
        waited=$((waited + 2))
    done
}

wait_for_exit_success() {
    local container="$1" timeout="${2:-60}" waited=0
    log "Waiting for $container to finish..."
    
    while true; do
        local state
        state=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")
        
        if [ "$state" = "exited" ]; then
            break
        fi

        if [ $((waited % 10)) -eq 0 ] && [ "$waited" -ne 0 ]; then
            printf "  ⏳ [%ds] %s is still running (state: %s)...\n" "$waited" "$container" "$state"
        fi

        if [ "$waited" -ge "$timeout" ]; then
            die "Timed out waiting for $container to finish."
        fi

        sleep 2
        waited=$((waited + 2))
    done

    local code
    code="$(docker inspect -f '{{.State.ExitCode}}' "$container" 2>/dev/null || echo "unknown")"
    if [ "$code" != "0" ]; then
        printf "\n\033[1;31m========== CRASH LOGS FOR %s ==========\033[0m\n" "$container" >&2
        docker logs "$container" --tail 50 >&2
        die "$container exited with failure code $code."
    fi
}

table_exists() {
    local container="$1" user="$2" db="$3" table="$4"
    docker exec "$container" psql -U "$user" -d "$db" -tAc \
        "SELECT to_regclass('public.${table}') IS NOT NULL" 2>/dev/null | tr -d '[:space:]'
}

wait_for_http() {
    local url="$1" timeout="${2:-60}" waited=0
    until curl -fsS -o /dev/null "$url" 2>/dev/null; do
        sleep 2
        waited=$((waited + 2))
        [ "$waited" -ge "$timeout" ] && die "Timed out waiting for $url to respond."
    done
}

docker network inspect "$NETWORK_NAME" >/dev/null 2>&1 \
    || { log "Creating shared network $NETWORK_NAME"; docker network create "$NETWORK_NAME" >/dev/null; }

# ─── Auth stack (own Postgres + Redis) ─────────────────────────────────────
log "Building and starting the auth service's database + cache"
(
    cd "$ROOT_DIR/services/auth"
    docker compose up -d --build auth-db auth-redis auth-adminer
)
wait_for_healthy auth-db

AUTH_DB_USER="$(env_var services/auth/.env POSTGRES_USER)"
AUTH_DB_NAME="$(env_var services/auth/.env POSTGRES_DB)"

log "Installing auth service dependencies (needed to run its migration)"
(cd "$ROOT_DIR/services/auth" && npm install --silent)

if [ "$(table_exists auth-db "$AUTH_DB_USER" "$AUTH_DB_NAME" users)" = "t" ]; then
    log "Auth schema already applied — skipping migration"
else
    log "Applying auth service schema"
    (cd "$ROOT_DIR/services/auth" && npm run migrate)
fi

log "Starting the auth service"
(cd "$ROOT_DIR/services/auth" && docker compose up -d --build auth)

# ─── Core stack (shared Postgres + MinIO) ──────────────────────────────────
log "Building and starting the database, object storage, and admin UIs"
docker compose up -d --build db adminer minio minio-setup
wait_for_healthy db
wait_for_exit_success minio-setup

DB_USER="$(env_var .env POSTGRES_USER)"
DB_NAME="$(env_var .env POSTGRES_DB)"

log "Installing hypertube dependencies (needed to run its migration)"
(cd "$ROOT_DIR/services/hypertube" && npm install --silent)

if [ "$(table_exists db "$DB_USER" "$DB_NAME" movies)" = "t" ]; then
    log "Hypertube schema already applied — skipping migration"
else
    log "Applying hypertube schema"
    (
        cd "$ROOT_DIR/services/hypertube"
        DATABASE_URL="postgresql://${DB_USER}:$(env_var "$ROOT_DIR/.env" POSTGRES_PASSWORD)@localhost:5432/${DB_NAME}" \
            npx drizzle-kit migrate
    )
fi

log "Starting the downloader and hypertube web app"
docker compose up -d --build downloader hypertube

# ─── Wait for everything to actually answer ────────────────────────────────
log "Waiting for services to come online"
wait_for_http "http://localhost:3333/api/v1/healthz" 60
wait_for_http "http://localhost:8000/torrents" 60
wait_for_http "http://localhost:3000/login" 90

cat <<'EOF'

✅ Hypertube is up.

  Website:        http://localhost:3000
  Auth service:    http://localhost:3333
  Downloader API:  http://localhost:8000
  MinIO console:   http://localhost:9001
  DB admin (app):  http://localhost:8080
  DB admin (auth): http://localhost:8081

EOF
