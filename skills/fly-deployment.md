---
name: fly-deployment
description: Everything needed to deploy, manage, and debug PyLearn on Fly.io — CLI setup, token, DB schema push, app/DB machine management, and login fix history.
---

# Fly.io Deployment — PyLearn

## CLI Setup (inside container)

fly CLI is installed at `~/.fly/bin/flyctl`.

**PATH** is permanently added in `~/.zshrc`:
```
export PATH="$HOME/.fly/bin:$PATH"
```

**Token** lives in `/workspace/src/.env.local` (gitignored):
```
FLY_API_TOKEN="FlyV1 ..."
```

`~/.zshrc` also sources `.env.local` on every shell start:
```bash
[[ -f /workspace/src/.env.local ]] && set -a && source /workspace/src/.env.local && set +a
```

So after any new shell, `fly auth whoami` should work with no manual steps.

**If the token has expired:** get a new one from fly.io/user/personal_access_tokens, update `FLY_API_TOKEN=` in `.env.local`. The value must be quoted because it contains a space: `FLY_API_TOKEN="FlyV1 ..."`.

---

## App Layout

| Resource | Fly app name | Machine ID |
|---|---|---|
| Web app | `pylearn` | `784929db334498` (recreated 2026-06-07; changes only if the app machine is destroyed) |
| Postgres | `pylearn-db` | `286d552a530328` |

- App URL: https://pylearn.fly.dev
- App machine: `shared-cpu-2x` / 1GB, process group `app`, mounts volume `pylearn_data` → `/data` (adventure image uploads — currently ~8 files / 5.3M)
- DB (`pylearn-db`) is a separate Fly app configured with **autostart=true / autostop=true** — it wakes automatically when the app connects and sleeps when idle. `fly-server.sh deploy`/`start` also call `_ensure_db_machine` which re-asserts those flags and starts it if stopped. No manual DB start is normally needed.

---

## Scripts

`fly-server.sh` (at `src/scripts/fly-server.sh`) handles the app machine **and** wakes the DB:

```bash
./scripts/fly-server.sh deploy   # pre-checks → build + deploy → post-checks
./scripts/fly-server.sh start    # start app + DB machine + enable autostart
./scripts/fly-server.sh stop     # stop app + DB machine + disable app autostart
./scripts/fly-server.sh status   # app + DB state + duplicate-machine warning
./scripts/fly-server.sh logs     # stream live logs
```

The script sources `.env.local` automatically, so `FLY_API_TOKEN` is picked up.

**`deploy` is hardened (no manual babysitting needed):**
- **Tolerates transient Fly states.** Every `fly machine` call is non-fatal (`|| true`) and the script *waits out* transient states (`created`/`starting`/`stopping`/`replacing`) before issuing start/stop, then retries start up to 3×. This fixes the old failure where re-asserting `--autostart/--autostop` nudged the DB into `created`, the immediate `fly machine start` hit `failed_precondition`, and `set -e` aborted the whole deploy.
- **Pre-deploy checks** (abort before building if any fail): `LOCAL_AUTH` is *not* a Fly secret; exactly **1** app machine (`>1` ⇒ stop, it's a split-brain — see duplicate-machine runbook below; `0` ⇒ allowed first deploy); DB awake (`_ensure_db_machine`).
- **Post-deploy checks**: still exactly 1 app machine (catches the duplicate-machine gotcha automatically), autostart re-enabled, and the public `/api/health` endpoint polled until it returns **200** (non-zero exit if it never does).
- `_ensure_db_machine` always returns success even if it can't start the DB — autostart wakes it on the app's first connection.

So `deploy` no longer needs the DB started by hand first; it handles the DB itself.

---

## DB Machine — Start / Stop

Always start the DB machine **before** starting or deploying the app:

```bash
fly machine start 286d552a530328 --app pylearn-db
fly machine list --app pylearn-db   # verify state = started
```

If the DB machine was stopped and the app is already running, restart the app machine after starting the DB:
```bash
fly machine restart 784929db334498 --app pylearn
```

---

## DB Schema Push (Production)

Run this whenever `lib/db/src/schema/` has changed since the last deploy.

```bash
# 1. Ensure DB machine is running (see above)

# 2. Start proxy
fly proxy 15432:5432 --app pylearn-db &
sleep 4

# 3. Get SU password from the DB machine
SU_PASS=$(fly ssh console --app pylearn-db -C 'env' 2>/dev/null \
  | grep '^SU_PASSWORD=' | cut -d= -f2 | tr -d '\r\n')

# 4. Push schema
DATABASE_URL="postgresql://flypgadmin:${SU_PASS}@localhost:15432/pylearn?sslmode=disable" \
  pnpm --filter @workspace/db run push

# 5. Kill proxy when done
kill $(ss -tlnp | grep 15432 | grep -o 'pid=[0-9]*' | cut -d= -f2) 2>/dev/null || true
```

**Gotcha:** `echo $SU_PASSWORD` via ssh returns the wrong value. Use `env | grep SU_PASSWORD` instead.

**Gotcha:** Port 15432 may be held by a stale proxy. Use `ss -tlnp | grep 15432` to find the PID and kill it.

---

## Gotcha: `fly deploy` creating a DUPLICATE machine + empty volume

**Symptom:** `fly deploy` prints `Your app doesn't have any Fly Launch machines … No machines in group app, launching a new machine` and `Creating a 1 GB volume named 'pylearn_data'`. You end up with **two** app machines — the old one (with the real `pylearn_data` data) untouched on the old image, plus a new one on a fresh **empty** volume. Traffic split-brains between them.

**Cause:** the existing app machine was created outside the managed `fly deploy`/`fly launch` flow, so flyctl doesn't recognise it as a "Fly Launch machine" and won't update it in place. It also can't reuse the data volume because that volume is still **attached** to the unmanaged machine. Tagging the machine with `--metadata fly_process_group=app` is **not** enough — flyctl still creates a new machine.

**Fix (preserves data, no migration):**
1. Destroy the accidental new machine **and** its empty volume.
2. Destroy the unmanaged old machine **but keep its data volume** (`fly machine destroy <id> --force` does *not* delete the volume) → the data volume becomes **unattached**.
3. `fly deploy` again. With zero machines and one unattached `pylearn_data` volume present, flyctl creates a properly-managed app machine and **attaches the existing data volume** (no new volume line in the output). Data is preserved and future deploys now update this machine in place.

```bash
# verify before/after
fly machines list -a pylearn
fly volumes list  -a pylearn          # ATTACHED VM blank = unattached
fly ssh console -a pylearn --machine <id> -C "sh -c 'ls -1 /data/uploads | wc -l'"
```

**Never** destroy a volume whose `ATTACHED VM`/age indicates it holds real data — only ever destroy the freshly-created empty one. Double-check volume IDs (`vol_…`) every time.

---

## Pre-Deploy Checklist

`./scripts/fly-server.sh deploy` now **automates** the DB-awake, no-`LOCAL_AUTH`-secret, and single-machine checks (it aborts before building if any fail). The one thing it can **not** know about is schema drift:

1. **Schema in sync** — if any file under `lib/db/src/schema/` changed since the last deploy, push schema first (see "DB Schema Push"). The script does not do this for you.
2. **Deploy** — `./scripts/fly-server.sh deploy`. It will: verify no `LOCAL_AUTH` secret, verify exactly 1 app machine, wake the DB (tolerating transient states), build + deploy, then verify no duplicate machine and that `/api/health` returns 200.

---

## Diagnosing Login Failures

If Google OAuth login fails after deploy, check logs first:
```bash
./scripts/fly-server.sh logs
```

**Symptom:** `Error: Failed query: insert into "users" ...`
**Cause:** Production DB schema is out of sync — a column referenced in the query doesn't exist in the DB.
**Fix:** Push schema (see above), then restart the app machine.

**Symptom:** `no active leader found` from `fly pg connect`
**Cause:** DB machine is stopped.
**Fix:** Start DB machine, wait ~10s, retry.

**Symptom:** Login loop / redirect back to login page
**Cause:** `LOCAL_AUTH=true` set as a Fly secret, or missing `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
**Fix:** Check `fly secrets list --app pylearn`.

---

## Auth Modes

- **Production (Fly):** Google OAuth. `LOCAL_AUTH` must NOT be set as a secret.
- **Local dev:** `LOCAL_AUTH=true` in `.env.local` — auto-creates teacher session at `/api/login`.
- First Google user to log in is auto-promoted to admin (only if no admin exists yet in the DB).

---

## Useful One-Liners

```bash
# Stream logs
./scripts/fly-server.sh logs

# Check secrets (names only — no values)
fly secrets list --app pylearn

# Tail DB logs
fly logs --app pylearn-db --no-tail

# Interactive psql (when proxy is running)
DATABASE_URL="postgresql://flypgadmin:${SU_PASS}@localhost:15432/pylearn?sslmode=disable" psql

# Check app status
./scripts/fly-server.sh status
```
