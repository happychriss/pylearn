#!/usr/bin/env bash
# =============================================================
# PyLearn Local Dev Server — start / stop / restart / status / build / logs
# Usage:  ./scripts/local-server.sh [start|stop|restart|status|build|logs]
# =============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="/tmp/pylearn-local.pid"
LOG_FILE="/tmp/pylearn-local.log"
PORT="${PYLEARN_PORT:-8080}"

# --- required env (defaults for local dev) ---
export LOCAL_AUTH="${LOCAL_AUTH:-true}"
export SESSION_SECRET="${SESSION_SECRET:-local-dev-secret}"
export DATABASE_URL="${DATABASE_URL:-postgresql://ubuntu:pylearn@localhost/pylearn}"
export PORT="$PORT"
export NODE_ENV="${NODE_ENV:-development}"

SERVER_BIN="$ROOT_DIR/artifacts/api-server/dist/index.cjs"

# ---- helpers ----

_is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(<"$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    rm -f "$PID_FILE"
  fi
  return 1
}

_kill_port() {
  # Kill anything on our port (orphaned processes, stale servers)
  fuser -k "$PORT/tcp" 2>/dev/null || true
}

_ensure_postgres() {
  if ! pg_isready -q 2>/dev/null; then
    echo "⚠ PostgreSQL does not appear to be running."
    echo "  Start it with: sudo pg_ctlcluster 17 main start"
    return 1
  fi
}

# ---- commands ----

do_status() {
  if _is_running; then
    local pid=$(<"$PID_FILE")
    echo "✓ PyLearn running  pid=$pid  port=$PORT"
    echo "  log: $LOG_FILE"
    # quick health check
    if curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; then
      echo "  health: OK (responding on http://localhost:$PORT)"
    else
      echo "  health: WARN (process alive but not responding)"
    fi
  else
    echo "✗ PyLearn not running"
  fi
}

do_stop() {
  if _is_running; then
    local pid=$(<"$PID_FILE")
    echo "Stopping PyLearn (pid $pid)…"
    kill "$pid" 2>/dev/null || true
    # wait up to 5s for graceful shutdown
    for _ in {1..10}; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    # force-kill if still alive
    if kill -0 "$pid" 2>/dev/null; then
      echo "  graceful shutdown timed out, force killing…"
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    echo "Stopped."
  else
    echo "Not running (no PID file)."
  fi
  # Belt-and-suspenders: free the port from any orphan
  _kill_port
}

do_build() {
  echo "Building frontend…"
  (cd "$ROOT_DIR" && pnpm --filter pylearn build 2>&1 | tail -3)
  echo "Building api-server…"
  (cd "$ROOT_DIR" && pnpm --filter api-server build 2>&1 | tail -3)
  echo "Build done."
}

do_start() {
  if _is_running; then
    local pid=$(<"$PID_FILE")
    echo "Already running (pid $pid). Use 'restart' to cycle."
    return 0
  fi

  _ensure_postgres || return 1

  # auto-build if binary missing
  if [[ ! -f "$SERVER_BIN" ]]; then
    echo "Server binary not found, building first…"
    do_build
  fi

  # free port from any orphan
  _kill_port
  sleep 1

  echo "Starting PyLearn on port $PORT…"
  nohup node "$SERVER_BIN" >> "$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_FILE"
  disown "$pid" 2>/dev/null || true

  # wait for server to become healthy
  for i in {1..15}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "✗ Process exited immediately. Last log lines:"
      tail -5 "$LOG_FILE" 2>/dev/null | grep -v '^/workspace' || true
      rm -f "$PID_FILE"
      return 1
    fi
    if curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; then
      echo "✓ PyLearn running  pid=$pid  port=$PORT"
      echo "  log: $LOG_FILE"
      return 0
    fi
    sleep 1
  done

  echo "✗ Server started but not responding after 15s. Check log:"
  echo "  tail -30 $LOG_FILE"
  return 1
}

do_restart() {
  do_stop
  sleep 1
  do_start
}

do_logs() {
  if [[ -f "$LOG_FILE" ]]; then
    tail -${2:-50} "$LOG_FILE"
  else
    echo "No log file found at $LOG_FILE"
  fi
}

# ---- main ----
case "${1:-status}" in
  start)   do_start   ;;
  stop)    do_stop    ;;
  restart) do_restart ;;
  status)  do_status  ;;
  build)   do_build   ;;
  logs)    do_logs "$@" ;;
  *)
    echo "PyLearn Local Dev Server"
    echo ""
    echo "Usage: $0 {start|stop|restart|status|build|logs}"
    echo ""
    echo "  start    Start the server (auto-builds if needed)"
    echo "  stop     Stop the server and free port $PORT"
    echo "  restart  Stop + start"
    echo "  status   Show running state and health"
    echo "  build    Rebuild frontend + api-server"
    echo "  logs     Show last 50 log lines (or: logs N)"
    exit 1
    ;;
esac
