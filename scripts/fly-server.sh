#!/usr/bin/env bash
# =============================================================
# PyLearn Fly.io Remote Server — start / stop / status / deploy / logs
# Usage:  ./scripts/fly-server.sh [start|stop|status|deploy|logs]
# =============================================================
set -euo pipefail

APP_NAME="pylearn"
DB_APP_NAME="pylearn-db"
DB_MACHINE_ID="286d552a530328"
export PATH="$HOME/.fly/bin:$PATH"

# --- load local secrets (gitignored) ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_LOCAL="$SCRIPT_DIR/../.env.local"
if [[ -f "$ENV_LOCAL" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_LOCAL"
  set +a
fi

# ---- helpers ----

_check_fly() {
  if ! command -v fly &>/dev/null; then
    echo "✗ fly CLI not found. Install: curl -L https://fly.io/install.sh | sh"
    return 1
  fi
  if ! fly auth whoami &>/dev/null; then
    echo "✗ Not logged in to Fly.io. Set FLY_API_TOKEN in .env.local or run: fly auth login"
    return 1
  fi
}

_fly_json() {
  # Cache machine list JSON for the duration of this call (avoid repeated API hits)
  if [[ -z "${_FLY_CACHE:-}" ]]; then
    _FLY_CACHE=$(fly machines list --app "$APP_NAME" --json 2>/dev/null || echo "[]")
  fi
  echo "$_FLY_CACHE"
}

_fly_field() {
  # Extract a top-level field from the first machine: _fly_field id | _fly_field state
  _fly_json | python3 -c "import sys,json; m=json.load(sys.stdin); print(m[0]['$1'] if m else '')" 2>/dev/null
}

_invalidate_cache() {
  _FLY_CACHE=""
}

_get_machine_id() {
  _fly_field id
}

_get_machine_state() {
  _fly_field state
}

_ensure_db_machine() {
  # Keep autostart+autostop enabled so DB wakes/sleeps automatically with the app
  fly machine update "$DB_MACHINE_ID" --app "$DB_APP_NAME" \
    --autostart=true --autostop=true --yes 2>&1 | grep -v "^Monitor" || true

  local db_state
  db_state=$(fly machines list --app "$DB_APP_NAME" --json 2>/dev/null \
    | python3 -c "import sys,json; m=json.load(sys.stdin); print(m[0]['state'] if m else 'unknown')" 2>/dev/null)
  if [[ "$db_state" == "started" ]]; then
    return 0
  fi
  echo "DB machine is $db_state — starting $DB_APP_NAME…"
  fly machine start "$DB_MACHINE_ID" --app "$DB_APP_NAME" 2>&1
  # wait up to 20s for postgres to accept connections
  for _ in {1..10}; do
    sleep 2
    local s
    s=$(fly machines list --app "$DB_APP_NAME" --json 2>/dev/null \
      | python3 -c "import sys,json; m=json.load(sys.stdin); print(m[0]['state'] if m else '')" 2>/dev/null)
    if [[ "$s" == "started" ]]; then
      echo "DB machine started."
      return 0
    fi
  done
  echo "⚠ DB machine did not reach started state — continuing anyway."
}

# ---- commands ----

do_status() {
  _check_fly || return 1
  local state
  state=$(_get_machine_state)
  local mid
  mid=$(_get_machine_id)

  if [[ -z "$mid" ]]; then
    echo "✗ No machines found for app $APP_NAME"
    return 1
  fi

  local db_state
  db_state=$(fly machines list --app "$DB_APP_NAME" --json 2>/dev/null \
    | python3 -c "import sys,json; m=json.load(sys.stdin); print(m[0]['state'] if m else 'unknown')" 2>/dev/null)

  case "$state" in
    started)
      echo "✓ App:      $APP_NAME  RUNNING   → https://$APP_NAME.fly.dev"
      ;;
    stopped)
      echo "✗ App:      $APP_NAME  STOPPED"
      ;;
    *)
      echo "? App:      $APP_NAME  $state"
      ;;
  esac
  case "$db_state" in
    started) echo "✓ Database: $DB_APP_NAME  RUNNING  (autostart+autostop)" ;;
    stopped) echo "✗ Database: $DB_APP_NAME  STOPPED  (autostart+autostop)" ;;
    *)       echo "? Database: $DB_APP_NAME  $db_state" ;;
  esac
}

do_start() {
  _check_fly || return 1
  _ensure_db_machine
  local mid
  mid=$(_get_machine_id)
  local state
  state=$(_get_machine_state)

  if [[ -z "$mid" ]]; then
    echo "✗ No machines found for app $APP_NAME"
    return 1
  fi

  if [[ "$state" == "started" ]]; then
    echo "Already running (machine $mid)."
    return 0
  fi

  echo "Enabling autostart…"
  fly machine update "$mid" --app "$APP_NAME" --autostart=true --yes 2>&1 | tail -2

  echo "Starting machine $mid…"
  fly machine start "$mid" --app "$APP_NAME" 2>&1

  # wait for it to become reachable
  echo -n "Waiting for health"
  for _ in {1..30}; do
    _invalidate_cache
    local s
    s=$(_get_machine_state)
    if [[ "$s" == "started" ]]; then
      echo ""
      echo "✓ Fly app $APP_NAME is RUNNING"
      echo "  url: https://$APP_NAME.fly.dev"
      return 0
    fi
    echo -n "."
    sleep 2
  done
  echo ""
  echo "⚠ Machine started but health check timed out. Check: fly status --app $APP_NAME"
}

do_stop() {
  _check_fly || return 1
  local mid
  mid=$(_get_machine_id)
  local state
  state=$(_get_machine_state)

  if [[ -z "$mid" ]]; then
    echo "✗ No machines found for app $APP_NAME"
    return 1
  fi

  # Stop app
  if [[ "$state" == "stopped" ]]; then
    echo "App already stopped."
  else
    echo "Disabling autostart + stopping app…"
    fly machine update "$mid" --app "$APP_NAME" --autostart=false --yes 2>&1 | grep -v "^Monitor" || true
    fly machine stop "$mid" --app "$APP_NAME" 2>&1
  fi

  # Stop DB
  local db_state
  db_state=$(fly machines list --app "$DB_APP_NAME" --json 2>/dev/null \
    | python3 -c "import sys,json; m=json.load(sys.stdin); print(m[0]['state'] if m else 'unknown')" 2>/dev/null)
  if [[ "$db_state" == "stopped" ]]; then
    echo "Database already stopped."
  else
    echo "Stopping database…"
    fly machine stop "$DB_MACHINE_ID" --app "$DB_APP_NAME" 2>&1
  fi

  sleep 2
  echo "✓ App + Database stopped."
}

do_deploy() {
  _check_fly || return 1
  _ensure_db_machine
  echo "Deploying to Fly.io…"
  local script_dir
  script_dir="$(cd "$(dirname "$0")" && pwd)"
  local root_dir
  root_dir="$(cd "$script_dir/.." && pwd)"
  (cd "$root_dir" && fly deploy --app "$APP_NAME")
  echo ""
  echo "✓ Deployed. Enabling autostart…"
  _invalidate_cache
  local mid
  mid=$(_get_machine_id)
  if [[ -n "$mid" ]]; then
    fly machine update "$mid" --app "$APP_NAME" --autostart=true --yes 2>&1 | tail -2
  fi
  echo "  url: https://$APP_NAME.fly.dev"
}

do_logs() {
  _check_fly || return 1
  fly logs --app "$APP_NAME"
}

# ---- main ----
case "${1:-status}" in
  start)   do_start  ;;
  stop)    do_stop   ;;
  status)  do_status ;;
  deploy)  do_deploy ;;
  logs)    do_logs   ;;
  *)
    echo "PyLearn Fly.io Remote Server"
    echo ""
    echo "Usage: $0 {start|stop|status|deploy|logs}"
    echo ""
    echo "  start    Start machine + enable autostart"
    echo "  stop     Stop machine + disable autostart (fully offline)"
    echo "  status   Show machine state, URL, autostart setting"
    echo "  deploy   Build & deploy to Fly.io, enable autostart"
    echo "  logs     Stream live logs from Fly"
    exit 1
    ;;
esac
