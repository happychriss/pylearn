#!/usr/bin/env bash
# =============================================================
# PyLearn Fly.io Remote Server — start / stop / status / deploy / logs
# Usage:  ./scripts/fly-server.sh [start|stop|status|deploy|logs]
# =============================================================
set -euo pipefail

APP_NAME="pylearn"
export PATH="$HOME/.fly/bin:$PATH"

# ---- helpers ----

_check_fly() {
  if ! command -v fly &>/dev/null; then
    echo "✗ fly CLI not found. Install: curl -L https://fly.io/install.sh | sh"
    return 1
  fi
  if ! fly auth whoami &>/dev/null; then
    echo "✗ Not logged in to Fly.io. Run: fly auth login"
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

  case "$state" in
    started)
      echo "✓ Fly app $APP_NAME is RUNNING"
      echo "  machine: $mid  state: $state"
      echo "  url: https://$APP_NAME.fly.dev"
      # check autostart
      local autostart
      autostart=$(_fly_json \
        | python3 -c "import sys,json; m=json.load(sys.stdin)[0]; c=m.get('config',{}).get('services',[{}])[0]; print(c.get('autostart', 'unknown'))" 2>/dev/null || echo "unknown")
      echo "  autostart: $autostart"
      ;;
    stopped)
      echo "✗ Fly app $APP_NAME is STOPPED"
      echo "  machine: $mid  state: $state"
      ;;
    *)
      echo "? Fly app $APP_NAME state: $state"
      echo "  machine: $mid"
      ;;
  esac
}

do_start() {
  _check_fly || return 1
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

  if [[ "$state" == "stopped" ]]; then
    echo "Already stopped (machine $mid)."
    # still disable autostart to be safe
    fly machine update "$mid" --app "$APP_NAME" --autostart=false --yes 2>&1 | tail -2
    echo "Autostart disabled."
    return 0
  fi

  echo "Disabling autostart (prevents wake-on-request)…"
  fly machine update "$mid" --app "$APP_NAME" --autostart=false --yes 2>&1 | tail -2

  echo "Stopping machine $mid…"
  fly machine stop "$mid" --app "$APP_NAME" 2>&1

  # verify
  sleep 3
  _invalidate_cache
  local new_state
  new_state=$(_get_machine_state)
  if [[ "$new_state" == "stopped" ]]; then
    echo "✓ Fly app $APP_NAME is STOPPED (autostart disabled)"
  else
    echo "⚠ Machine state is '$new_state' — may need a moment. Re-stopping…"
    fly machine stop "$mid" --app "$APP_NAME" 2>&1 || true
  fi
}

do_deploy() {
  _check_fly || return 1
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
