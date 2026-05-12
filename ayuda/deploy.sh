#!/usr/bin/env bash
set -euo pipefail

log(){ echo "[INFO] $*"; }
err(){ echo "[ERROR] $*" >&2; }

require_file() { [[ -f "$1" ]] || { err "Falta $1"; exit 1; }; }

usage() {
  cat <<'EOF'
Uso:
  ./deploy.sh deploy [--with-sync] [-- args...]
  ./deploy.sh sync [args...]
EOF
}

require_prereqs() {
  require_file ".env"
  require_file "docker-compose.yaml"
  docker compose version >/dev/null 2>&1 || { err "docker compose v2 no disponible"; exit 1; }
}

run_sync() {
  local bootstrap_redis="${1:-true}"
  shift || true

  if [[ "$bootstrap_redis" == "true" ]]; then
    log "Levantando dependencias mínimas (db/redis)..."
    docker compose up -d db redis
  fi

  log "Sync no interactivo..."

  docker compose --profile manual run --rm sync
}

cmd="${1:-}"; shift || true
require_prereqs

case "$cmd" in
  deploy)
    with_sync=false
    sync_args=()

    while (($#)); do
      case "$1" in
        --with-sync) with_sync=true; shift ;;
        --) shift; sync_args=("$@"); break ;;
        *) err "Opción inválida: $1"; usage; exit 1 ;;
      esac
    done

    log "Levantando dependencias (db/redis/frontend)..."
    if ! docker compose up -d --wait db redis frontend; then
      err "Las dependencias base no están sanas. Abortando."
      exit 1
    fi

    log "Ejecutando migraciones..."

    log "Ejecutando migraciones..."
    if ! docker compose run --rm migrate; then
      err "Falló migrate. Backend NO se arranca."
      exit 1
    fi

    log "Arrancando backend..."
    docker compose up -d backend

    if [[ "$with_sync" == "true" ]]; then
      run_sync false "${sync_args[@]}"
    fi

    log "Deploy completado."
    docker compose ps
    ;;
  sync)
    run_sync true "$@"
    ;;
  *)
    usage
    exit 1
    ;;
esac