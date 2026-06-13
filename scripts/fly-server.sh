#!/usr/bin/env bash
# =============================================================
# PyLearn Fly.io Remote Server — start / stop / status / deploy / logs
# Usage:  ./scripts/fly-server.sh [start|stop|status|deploy|logs]
#
# Designed to be reliable & idempotent:
#   - tolerates transient Fly machine states (created/starting/stopping/replacing)
#   - never lets a recoverable hiccup abort a deploy (no spurious `set -e` exits)
#   - profound pre/post-deploy checks (secrets, machine count, health)
# =============================================================
set -euo pipefail

APP_NAME="pylearn"
DB_APP_NAME="pylearn-db"
DB_MACHINE_ID="286d552a530328"
HEALTH_PATH="/api/health"
export PATH="$HOME/.fly/bin:$PATH"

# States a machine can be passing *through*; we must wait these out before
# issuing start/stop, otherwise Fly returns failed_precondition.
TRANSIENT_STATES="created starting stopping replacing"

# --- load local secrets (gitignored) ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_LOCAL="$SCRIPT_DIR/../.env.local"
if [[ -f "$ENV_LOCAL" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_LOCAL"
  set +a
fi

# ───────────────────────── helpers ─────────────────────────

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

# _machine_state <app> [machine_id]
# State of the given machine (by id), or of the first machine if id omitted.
# Always prints something ('unknown' on any error) and returns 0 so callers
# under `set -e` are never aborted by a transient API blip.
_machine_state() {
  local app="$1" mid="${2:-}"
  fly machines list --app "$app" --json 2>/dev/null | python3 -c "
import sys, json
try:
    m = json.load(sys.stdin)
except Exception:
    print('unknown'); sys.exit(0)
mid = '$mid'
if mid:
    m = [x for x in m if x.get('id') == mid] or m
print(m[0]['state'] if m else 'unknown')
" 2>/dev/null || echo "unknown"
}

# _machine_count <app>  → number of machines (0 on error)
_machine_count() {
  fly machines list --app "$1" --json 2>/dev/null \
    | python3 -c "import sys,json
try: print(len(json.load(sys.stdin)))
except Exception: print(0)" 2>/dev/null || echo 0
}

# _is_transient <state>
_is_transient() {
  case " $TRANSIENT_STATES " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

# _wait_settle <app> <machine_id> <timeout_s>
# Wait until the machine leaves any transient state. Returns 0 once settled,
# 1 on timeout. Never aborts the caller.
_wait_settle() {
  local app="$1" mid="$2" timeout="$3" waited=0 s
  while (( waited < timeout )); do
    s=$(_machine_state "$app" "$mid")
    _is_transient "$s" || return 0
    sleep 2; waited=$(( waited + 2 ))
  done
  return 1
}

# _wait_for_state <app> <machine_id> <target> <timeout_s>
_wait_for_state() {
  local app="$1" mid="$2" target="$3" timeout="$4" waited=0 s
  while (( waited < timeout )); do
    s=$(_machine_state "$app" "$mid")
    [[ "$s" == "$target" ]] && return 0
    sleep 2; waited=$(( waited + 2 ))
  done
  return 1
}

# _health_check [timeout_s]  → poll the public health endpoint for HTTP 200
_health_check() {
  local url="https://$APP_NAME.fly.dev$HEALTH_PATH" timeout="${1:-45}" waited=0 code
  echo -n "  health: $url "
  while (( waited < timeout )); do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo 000)
    if [[ "$code" == "200" ]]; then echo "→ 200 ✓"; return 0; fi
    echo -n "."; sleep 3; waited=$(( waited + 3 ))
  done
  echo "→ last:$code ✗"
  return 1
}

# Ensure the Postgres machine is awake and autostart/autostop is set.
# Fully tolerant: every fly call is non-fatal, transient states are waited
# out, and start is retried. Always returns 0 — autostart wakes the DB on the
# app's first connection even if we couldn't start it here.
_ensure_db_machine() {
  local state attempt
  state=$(_machine_state "$DB_APP_NAME" "$DB_MACHINE_ID")

  # Wait out any in-progress transition before touching the machine.
  if _is_transient "$state"; then
    echo "  DB machine is '$state' — waiting for it to settle…"
    _wait_settle "$DB_APP_NAME" "$DB_MACHINE_ID" 60 || true
  fi

  # Re-assert autostart/autostop (idempotent). This can briefly push the
  # machine into a transient state, so settle again afterwards.
  fly machine update "$DB_MACHINE_ID" --app "$DB_APP_NAME" \
    --autostart=true --autostop=true --yes >/dev/null 2>&1 || true
  _wait_settle "$DB_APP_NAME" "$DB_MACHINE_ID" 60 || true

  state=$(_machine_state "$DB_APP_NAME" "$DB_MACHINE_ID")
  if [[ "$state" == "started" ]]; then
    echo "  ✓ DB machine running."
    return 0
  fi

  echo "  DB machine is '$state' — starting $DB_APP_NAME…"
  for attempt in 1 2 3; do
    fly machine start "$DB_MACHINE_ID" --app "$DB_APP_NAME" >/dev/null 2>&1 || true
    if _wait_for_state "$DB_APP_NAME" "$DB_MACHINE_ID" started 30; then
      echo "  ✓ DB machine started."
      return 0
    fi
    echo "  start attempt $attempt didn't settle; retrying…"
    _wait_settle "$DB_APP_NAME" "$DB_MACHINE_ID" 30 || true
  done

  echo "  ⚠ DB machine did not reach 'started' (autostart will wake it on first connection)."
  return 0
}

# ───────────────────────── commands ────────────────────────

do_status() {
  _check_fly || return 1
  local state db_state count
  state=$(_machine_state "$APP_NAME")
  db_state=$(_machine_state "$DB_APP_NAME" "$DB_MACHINE_ID")
  count=$(_machine_count "$APP_NAME")

  case "$state" in
    started) echo "✓ App:      $APP_NAME  RUNNING   → https://$APP_NAME.fly.dev" ;;
    stopped) echo "✗ App:      $APP_NAME  STOPPED" ;;
    unknown) echo "✗ App:      $APP_NAME  no machines found" ;;
    *)       echo "? App:      $APP_NAME  $state" ;;
  esac
  case "$db_state" in
    started) echo "✓ Database: $DB_APP_NAME  RUNNING  (autostart+autostop)" ;;
    stopped) echo "✗ Database: $DB_APP_NAME  STOPPED  (autostart+autostop)" ;;
    *)       echo "? Database: $DB_APP_NAME  $db_state" ;;
  esac
  [[ "$count" -gt 1 ]] && echo "⚠ $count app machines present — expected 1 (see duplicate-machine runbook)."
  return 0
}

do_start() {
  _check_fly || return 1
  _ensure_db_machine

  local state
  state=$(_machine_state "$APP_NAME")
  local mid
  mid=$(fly machines list --app "$APP_NAME" --json 2>/dev/null \
    | python3 -c "import sys,json; m=json.load(sys.stdin); print(m[0]['id'] if m else '')" 2>/dev/null)

  if [[ -z "$mid" ]]; then
    echo "✗ No machines found for app $APP_NAME"
    return 1
  fi
  if _is_transient "$state"; then
    echo "App machine is '$state' — waiting to settle…"
    _wait_settle "$APP_NAME" "$mid" 60 || true
    state=$(_machine_state "$APP_NAME" "$mid")
  fi
  if [[ "$state" == "started" ]]; then
    echo "Already running (machine $mid)."
    return 0
  fi

  echo "Enabling autostart + starting machine $mid…"
  fly machine update "$mid" --app "$APP_NAME" --autostart=true --yes >/dev/null 2>&1 || true
  fly machine start "$mid" --app "$APP_NAME" >/dev/null 2>&1 || true

  if _wait_for_state "$APP_NAME" "$mid" started 60; then
    echo "✓ Fly app $APP_NAME is RUNNING"
    echo "  url: https://$APP_NAME.fly.dev"
    return 0
  fi
  echo "⚠ Machine did not reach 'started'. Check: ./scripts/fly-server.sh status"
  return 1
}

do_stop() {
  _check_fly || return 1
  local mid
  mid=$(fly machines list --app "$APP_NAME" --json 2>/dev/null \
    | python3 -c "import sys,json; m=json.load(sys.stdin); print(m[0]['id'] if m else '')" 2>/dev/null)
  local state
  state=$(_machine_state "$APP_NAME")

  if [[ -z "$mid" ]]; then
    echo "✗ No machines found for app $APP_NAME"
    return 1
  fi

  if [[ "$state" == "stopped" ]]; then
    echo "App already stopped."
  else
    echo "Disabling autostart + stopping app…"
    fly machine update "$mid" --app "$APP_NAME" --autostart=false --yes >/dev/null 2>&1 || true
    fly machine stop "$mid" --app "$APP_NAME" >/dev/null 2>&1 || true
  fi

  local db_state
  db_state=$(_machine_state "$DB_APP_NAME" "$DB_MACHINE_ID")
  if [[ "$db_state" == "stopped" ]]; then
    echo "Database already stopped."
  else
    echo "Stopping database…"
    fly machine stop "$DB_MACHINE_ID" --app "$DB_APP_NAME" >/dev/null 2>&1 || true
  fi

  echo "✓ App + Database stop requested."
  return 0
}

do_deploy() {
  _check_fly || return 1

  echo "── Pre-deploy checks ───────────────────────────"

  # 1. LOCAL_AUTH must NOT be a prod secret (it would bypass/break Google OAuth).
  if fly secrets list --app "$APP_NAME" 2>/dev/null | grep -qw "LOCAL_AUTH"; then
    echo "✗ LOCAL_AUTH is set as a Fly secret — this breaks production OAuth."
    echo "  Fix: fly secrets unset LOCAL_AUTH --app $APP_NAME"
    return 1
  fi
  echo "  ✓ LOCAL_AUTH not set as a secret"

  # 2. Exactly one app machine. >1 means a prior split-brain (duplicate machine
  #    + possibly empty volume) — deploying would make it worse. 0 = first ever
  #    deploy (allowed). See skills/fly-deployment.md duplicate-machine runbook.
  local pre_count
  pre_count=$(_machine_count "$APP_NAME")
  if [[ "$pre_count" -gt 1 ]]; then
    echo "✗ Found $pre_count app machines — expected 1 (possible duplicate/split-brain)."
    echo "  Resolve via the duplicate-machine runbook in skills/fly-deployment.md before deploying."
    return 1
  elif [[ "$pre_count" -eq 0 ]]; then
    echo "  ⚠ No app machine yet — fly will create one (first deploy)."
  else
    echo "  ✓ 1 app machine present (in-place rolling update)"
  fi

  # 3. Database awake & flagged.
  _ensure_db_machine

  echo "── Deploying ───────────────────────────────────"
  local root_dir
  root_dir="$(cd "$SCRIPT_DIR/.." && pwd)"
  if ! (cd "$root_dir" && fly deploy --app "$APP_NAME"); then
    echo "✗ fly deploy failed — see output above. Existing machine left on its previous release."
    return 1
  fi

  echo "── Post-deploy checks ──────────────────────────"
  local post_count
  post_count=$(_machine_count "$APP_NAME")
  if [[ "$post_count" -ne 1 ]]; then
    echo "  ⚠ Now $post_count app machines — possible DUPLICATE machine (split-brain / empty volume)."
    echo "    Follow the duplicate-machine fix in skills/fly-deployment.md immediately."
  else
    echo "  ✓ Still exactly 1 app machine (no duplicate)"
  fi

  # Re-assert autostart on the (possibly new) machine.
  local mid
  mid=$(fly machines list --app "$APP_NAME" --json 2>/dev/null \
    | python3 -c "import sys,json; m=json.load(sys.stdin); print(m[0]['id'] if m else '')" 2>/dev/null)
  if [[ -n "$mid" ]]; then
    fly machine update "$mid" --app "$APP_NAME" --autostart=true --yes >/dev/null 2>&1 || true
    echo "  ✓ autostart enabled"
  fi

  if _health_check 60; then
    echo "✓ Deployed & healthy → https://$APP_NAME.fly.dev"
    return 0
  fi
  echo "⚠ Deployed, but $HEALTH_PATH never returned 200 — investigate: ./scripts/fly-server.sh logs"
  return 1
}

do_logs() {
  _check_fly || return 1
  fly logs --app "$APP_NAME"
}

# ───────────────────────── main ────────────────────────────
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
    echo "  start    Start app + DB machine, enable autostart"
    echo "  stop     Stop app + DB machine, disable app autostart"
    echo "  status   Show app + DB machine state and URL"
    echo "  deploy   Pre-checks → build & deploy → post-checks (machine count + health)"
    echo "  logs     Stream live logs from Fly"
    exit 1
    ;;
esac
