# PyLearn — Architecture Reference

## What It Is
Classroom Python learning platform for ~14-year-olds. Students write Python in a browser IDE, run it, and see output (terminal, charts, drawings, adventure scenes) in real time. Teachers manage accounts and monitor progress. Deployed on Fly.io (single machine, auto-stop when idle).

---

## Monorepo Layout (`/workspace/src/`)

```
artifacts/
  api-server/     Express 5 + WebSocket + node-pty backend; builds to dist/index.cjs
  pylearn/        React 19 + Vite frontend; served as static files by api-server
lib/
  api-spec/       openapi.yaml — source of truth for the API contract
  api-zod/        Zod schemas generated from api-spec (used by server)
  api-client-react/ TanStack Query hooks generated from api-spec (used by frontend)
  auth-web/       Auth utilities shared between server and frontend
  db/             Drizzle ORM schema + client (PostgreSQL)
  integrations/
    integrations-openai-ai-server/  AI provider abstraction (Anthropic + Google GenAI)
scripts/          fly-server.sh, local-server.sh, post-merge.sh
```

Build: `pnpm -r run build` — compiles all libs then artifacts. `api-server` bundles pylearn's Vite output into its dist and serves it.

---

## Backend (`artifacts/api-server/src/`)

**Entry:** `index.ts` → `app.ts` (Express app + route mounting)

**Routes:** `health`, `auth`, `users`, `files`, `ai`, `help`, `admin`, `adventure`, `programs`, `prompts`, `cheatsheets`

> The standalone `POST /api/execute` route (synchronous `python3 -c`, no resource limits) was **removed** — it was unused by the UI and a weaker parallel sandbox. All code execution goes through the WebSocket PTY path.

**Key lib files:**

| File | Role |
|------|------|
| `ptyManager.ts` | Spawns Python via node-pty (wrapped in `bash -c "ulimit -t 30; exec python3 ..."`); strips `\x00PYLEARN_DISPLAY\x00` markers, emits `display-event`. Enforces per-run guards: 30s CPU (`ulimit -t`), 60s idle, **5 min wall-clock hard cap**, **2 MB output cap**, and a **30 concurrent-session** ceiling |
| `display-protocol.ts` | Pure parser for the `\x00PYLEARN_DISPLAY\x00{json}\x00` marker stream (handles markers split across PTY chunks). Extracted from ptyManager so it is unit-tested |
| `websocket.ts` | WebSocket server; relays terminal I/O and display events browser ↔ PTY. Per-student output/display/exit events go **only to admins viewing that student's room** (`broadcastToAdminsViewing`), not to every admin socket |
| `wsState.ts` | In-memory map of active WebSocket connections per user |
| `auth.ts` | Session auth (DB-backed in `sessionsTable`) + Google OAuth (openid-client) + `LOCAL_AUTH` mode; `cleanupExpiredSessions()` runs hourly |
| `safety.ts` | Pure input-sanitization helpers (`safeScriptFilename`, `isUnsafePathSegment`, `getSafeReturnTo`); unit-tested |
| `suggestion-apply.ts` | Pure AI-suggestion apply logic (`findMatch`, `applyChanges`); extracted from `routes/ai.ts` for testing |
| `adventureStorage.ts` | Adventure image assets stored on a Fly.io persistent volume at `/data/uploads` |
| `middlewares/requireAdmin.ts` | Shared guard function used by all admin-only routes; returns 401/403 and false if not admin |

**Auth modes:**
- Production: Google OAuth (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` required), first user auto-promoted to admin/teacher
- Dev: `LOCAL_AUTH=true` — auto-creates a local teacher account; visiting `/api/login` sets a session cookie. No credentials needed.

---

## Frontend (`artifacts/pylearn/src/`)

**Stack:** React 19, Vite, Monaco Editor, xterm.js, Tailwind CSS v4, Radix UI, TanStack Query, Zustand, Wouter

**Key areas:**
- `pages/StudentWorkspace.tsx` — main student view (editor + terminal + output panel); accepts optional `isTeacherDemo` prop which shows a "← Dashboard" back button
- `pages/AdminWorkspaceView.tsx` — teacher view of a student's workspace (read-only / co-edit). Layout mirrors `StudentWorkspace` (Files | Code | Output with collapsible console) so the teacher's "joint workspace" looks identical to what the student sees
- `pages/TeacherDemoWorkspace.tsx` — teacher's own coding workspace (see below)
- `components/workspace/OutputPanel.tsx` — universal output panel (see below)
- `hooks/use-display-events.ts` — subscribes to `display-event` WebSocket messages

---

## Teacher Demo Workspace

The admin panel has a **"My Workspace"** tab (7th tab) that gives the teacher a full student coding experience for demos.

**Flow:**
1. Teacher clicks "Open Demo Workspace" in the My Workspace tab
2. Browser calls `POST /api/admin/demo-workspace/setup` (admin session) — idempotent: creates the `teacher-demo` student account once, then issues a fresh `sid_student` session cookie on every call
3. Frontend navigates to `/admin/demo-workspace` → `TeacherDemoWorkspace` page
4. After setup completes, renders `StudentWorkspace` with `isTeacherDemo=true` — full student UI, identical to what kids see
5. "← Dashboard" button in the header navigates back to `/admin`

**The `teacher-demo` account:**
- Fixed id: `teacher-demo`, display name: `Teacher`, role: `student`
- 999 AI credits (effectively unlimited for demos)
- Appears in the Students tab and program-assign dropdowns — teacher can assign demo programs to themselves
- Starter file: `demo.py`

**Session type switching:** `TeacherDemoWorkspace` calls `setSessionType('admin')` for the setup fetch, then `StudentWorkspace` calls `setSessionType('student')` — all subsequent API calls use the `sid_student` cookie and operate as the `teacher-demo` user. `setSessionType` now also notifies the WebSocket layer (`onSessionTypeChange`), which drops and reopens the socket so it **re-authenticates as the new identity** (the socket previously stayed authenticated as the original `admin` connection). The drop is deferred to a macrotask so it never runs during React render.

**Source:** `pages/TeacherDemoWorkspace.tsx`, `routes/admin.ts` (`POST /admin/demo-workspace/setup`)

---

## Display Protocol (stdout → browser)

Python code emits rich output by printing a null-byte-delimited marker:

```
\x00PYLEARN_DISPLAY\x00{"mime":"...","data":...}\x00
```

**Flow:**
1. Python writes marker to stdout
2. `ptyManager.ts` runs the chunk through `display-protocol.ts` (`parseDisplayChunk`), which strips the marker from terminal output and parses the JSON
3. Server emits `{ type: 'display-event', userId, event: DisplayMessage }` over WebSocket
4. `use-display-events` hook receives it
5. `OutputPanel` dispatches to the correct renderer by MIME type

**Latency budget per display event:**
Local: ~20 ms overhead (PTY + WebSocket + React + rAF). Cloud (Fly.io): +50–150 ms network.
This is fine for discrete story-beat transitions. It makes rapid animation loops (`move_sprite` in a tight loop) visually jumpy, especially on cloud. The planned `animation` MIME type will solve this by running the animation entirely client-side from a single event.

**MIME types → renderers (all in `OutputPanel.tsx`):**

| MIME | Renderer | Notes |
|------|----------|-------|
| `application/vnd.plotly+json` | `PlotlyRenderer` | Uses `plotly.js-basic-dist-min` |
| `application/vnd.pylearn.canvas+json` | `CanvasRenderer` | Turtle drawing via command list |
| `application/vnd.pylearn.scene+json` | `SceneRenderer` | Adventure visual-novel scenes; virtual 500×500 coordinate space scaled to panel |
| `application/vnd.pylearn.animation+json` | *(planned)* | Client-side animation loop — send full path once, animate locally without per-frame WebSocket round-trips |
| `image/png` / `image/jpeg` / etc. | inline `<img>` | base64-encoded |
| `text/html` | `<iframe srcDoc sandbox="">` | Opaque origin, scripts disabled — student-emitted HTML is untrusted (also renders in the teacher's monitor view) |
| `text/plain` | `<pre>` | fallback |

---

## Python Library (`artifacts/api-server/src/python-modules/pylearn.py`)

Single file on PYTHONPATH. No dependencies beyond stdlib. `show()` renders any object with a `to_plotly_json()` method (duck-typing) — the built-in `pylearn.Figure` chart builder implements this, so charts need no third-party package. (Real Plotly/Pandas objects would also work via the same hook, but those packages are **not** installed.)

Full API reference: **`knowledge/pylearn-library.md`**.

`api-server/src/lib/pylearn-ref.ts` is the machine-readable version — auto-injected into agent/suggestion AI prompts and shown in the admin Library tab. Keep it in sync with `pylearn.py` whenever functions are added or changed.

---

## AI Assistant (`routes/ai.ts`)

Three modes, configured by teacher in Admin → AI Settings:

| Mode | Prompt used | Code changes | Credits |
|------|-------------|-------------|---------|
| `chat` | `chatSystemPrompt` | None | Yes (students) |
| `suggestion` | `suggestionSystemPrompt` + PyLearn lib ref | None (hints only) | No |
| `agent` | `agentSystemPrompt` + PyLearn lib ref + `SUGGESTION_INSTRUCTION` | Yes — diff UI | No |

**Agent diff pipeline:**
1. AI returns `---SUGGESTION---` JSON block with a `changes` array of `{old_text, new_text}` pairs
2. Server runs `applyChanges()`: each `old_text` must match **exactly once** in the current file — missing or ambiguous = error shown in chat, no apply button
3. Resulting full `newContent` sent to client as a `suggestion` SSE event
4. `DiffView` computes LCS diff (old file vs new file), collapses unchanged runs to `··· N lines ···`
5. Student accepts → `newContent` written to DB

**Fallback chain** (in order of safety):
1. `---SUGGESTION---` with `changes` array → validated (preferred)
2. `---SUGGESTION---` with `newContent` (full file) → no validation, accepted as-is
3. Single ` ```suggestion ``` ` fence → same parsing as above
4. Single ` ```python ``` ` block → full-file replacement, no validation (last resort)

**History sanitization:** `---SUGGESTION---` markers are stripped from conversation history server-side before each AI call to prevent format confusion across turns.

Key files: `routes/ai.ts`, `components/workspace/AiPanel.tsx`, `hooks/use-chat-stream.ts`, `components/ui/diff-view.tsx`.

---

## Internationalisation (i18n)

**Source:** `artifacts/pylearn/src/lib/i18n.ts`

A zero-dependency, lightweight i18n layer — no external library.

**Language detection:** runs once at module load (not in a hook/effect) using `navigator.language`. Detects German (`startsWith('de')`), falls back to English for all other locales.

```ts
const lang: Lang =
  typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de')
    ? 'de' : 'en';
```

**API:** `useTranslation()` returns `{ t, lang }`.
- `t(key, vars?)` — resolves dot-notation keys (e.g. `'landing.badge'`, `'common.cancel'`), interpolates `{{var}}` placeholders, falls back to English if a German key is missing.
- `lang` — `'en'` | `'de'`, useful for conditional rendering.

**Translation key sections:** `common`, `landing`, `admin`, `workspace`, `admin_workspace`, `ai_panel`, `ai_chat`, `sidebar`, `not_found`.

**Covered pages/components:** Landing, AdminDashboard, StudentWorkspace, AdminWorkspaceView, AiPanel, AiChatPanel, Sidebar, NotFound.

**Not translated (intentional):** cheat-sheet content, prompt templates, student program content — these are teacher-authored materials, not UI strings.

---

## Program Templates & Assignment

Teachers manage reusable starter programs in the admin **Programs** menu. These are rows in `programTemplatesTable` (`lib/db/src/schema/programs.ts`), CRUD'd via `routes/programs.ts` (`GET/POST/PUT/DELETE /api/admin/programs`).

**Assignment is a snapshot copy, not a live link.** When a program is given to a student, its `content` is copied **by value** into a new `filesTable` row for that student. There is **no foreign key** from the student's file back to the template — once copied, the two are fully independent:

- Editing a template later in the Programs library does **not** change any already-assigned student file.
- A student editing their copy does **not** affect the template or any other student's copy.
- Re-assigning the same template inserts **another** file row (it does not update an existing one — a student can end up with a duplicate-named file).

This is intentional/confirmed behaviour (verified 2026-06-13), not an oversight. A "live template" model (resolve content by template id at read-time, copy-on-write on edit) would be a larger change — not currently implemented.

**Two ways content reaches a student:**

1. **Explicit assign** — `POST /api/admin/programs/:id/assign` (teacher clicks "Assign" in `AdminDashboard.tsx` → `handleAssignProgram`). Inserts a `filesTable` row with the template's `filename` + `content`.
2. **Default program on first login** — handled in `routes/auth.ts`:
   - On **teacher/admin login** (`upsertUser`, the shared chokepoint for local + Google OAuth + mobile auth), `ensureDefaultProgram()` makes sure a template named **`hello_world.py`** exists in the Programs menu; if missing it creates one with content `print("Welcome")`. Idempotent — never duplicates.
   - On a **student's first login** (`/auth/student-login`, when the student has zero files), their first file is seeded as `hello_world.py` copied from that template (falling back to inline `print("Welcome")` if the template somehow isn't there yet).
   - Constants `DEFAULT_PROGRAM_FILENAME` / `DEFAULT_PROGRAM_CONTENT` in `auth.ts` define the default. (This replaced an older hardcoded `my_adventure.py` adventure-script starter.)

There is also a separate teacher-authored `demo_adventure.py` template that ships as sample content — unrelated to the default-program logic above.

---

## Database

Drizzle ORM + PostgreSQL. Schema in `lib/db/src/`. Push schema: `pnpm --filter @workspace/db run push`.

---

## Testing

Unit tests use Node's built-in test runner via the existing `tsx` dep — **no vitest/jest**.

```bash
pnpm --filter @workspace/api-server test   # node --import tsx --test src/lib/*.test.ts
```

Pure logic is deliberately factored into dependency-free modules so tests need no DB/SDK/native deps:
- `lib/safety.ts` → `safety.test.ts` (filename / path-segment / redirect sanitization)
- `lib/display-protocol.ts` → `display-protocol.test.ts` (marker parsing, incl. split-across-chunks + malformed JSON)
- `lib/suggestion-apply.ts` → `suggestion-apply.test.ts` (AI suggestion match/apply)

> The repo-wide `tsc` typecheck currently has **pre-existing** errors unrelated to these (missing `cheatSheetsTable` export, the `integrations-openai` lib, Express handler `any`s). The real compile gates are the esbuild (api-server) and Vite (pylearn) builds run by `scripts/local-server.sh`.

---

## Security Notes

- **CORS:** locked to `APP_URL` env var (`http://localhost:8080` fallback in dev). Set `APP_URL=https://your-app.fly.dev` in Fly secrets.
- **Python sandbox:** each execution runs under `bash ulimit -t 30` (30s CPU). Layered limits in `ptyManager.ts`: 60s idle timeout (`IDLE_TIMEOUT_MS`), a 5-minute absolute wall-clock cap (`MAX_WALL_MS` — catches low-CPU loops that keep printing, which `ulimit -t` and the idle timer miss), a 2 MB per-run output cap (`MAX_OUTPUT_BYTES`), and a 30 concurrent-session ceiling (`MAX_CONCURRENT_SESSIONS`). Run-code filenames are sanitized (`safeScriptFilename`) so they can't escape the temp dir.
- **File uploads:** multer enforces an 8 MB per-file limit on adventure image uploads; `userId` path segments are validated (`isUnsafePathSegment`) on image fetch routes.
- **Untrusted student output:** students can emit display events by printing the marker; the `text/html` renderer uses `srcDoc` + empty `sandbox` (no scripts, opaque origin).
- **AI credits:** decremented atomically (`ai_credits - 1` guarded by `> 0`), not charged when the provider key is missing, refunded on failure, and streaming stops if the student disconnects.
- **Startup validation:** server exits immediately if `DATABASE_URL`, `GOOGLE_CLIENT_ID`, or `GOOGLE_CLIENT_SECRET` are missing (Google vars skipped when `LOCAL_AUTH=true`).
- **Admin guard:** all admin routes go through `requireAdmin()` in `middlewares/requireAdmin.ts`.
- **Student PINs:** stored in **two** columns — `studentAccountsTable.pinHash` (bcrypt, used by `student-login` for verification) and `studentAccountsTable.pinPlain` (plaintext, intentional — so the teacher can hand out / recover PINs). The plaintext PIN is returned in the student list and creation responses but **not** in update/patch responses. (Login verifies against `pinHash`, not `pinPlain`.)

---

## Deployment (Fly.io)

- App: `fly deploy` from `src/` (uses `src/Dockerfile` + `src/fly.toml`)
- DB: Fly Postgres (`pylearn-db`, machine `286d552a530328`) attached via `DATABASE_URL`; configured with **autostart=true / autostop=true** — wakes automatically when the app receives traffic, sleeps when idle. No manual DB start needed before deploys.
- Volume: `pylearn_data` mounted at `/data` for adventure image uploads
- Secrets: `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`
- Local dev: `LOCAL_AUTH=true DATABASE_URL=postgresql://ubuntu:dev@localhost/pylearn PORT=8080 SESSION_SECRET=local-dev-secret node artifacts/api-server/dist/index.cjs`
