# Project Requirements

## Project Type

Follow `/workspace/skills/project-setup.md` for working conventions, folder structure, knowledge flow, and development workflow.

---

## What Is Being Built

**PyLearn** — a browser-based Python learning platform for 11–14-year-olds.

Students write Python in a browser IDE (Monaco editor), run it server-side via a PTY, and see rich output (terminal, charts, turtle graphics, adventure scenes) in real time. Teachers manage student accounts and monitor workspaces. An AI assistant supports students in three distinct roles: chat, suggestion, and agent (diff-based code proposals).

**Status:** Active — in classroom use with ~14 students.

**Source:** `/workspace/src/`

Architecture reference: `knowledge/architecture.md`
PyLearn library API: `knowledge/pylearn-library.md`

---

## Features

### Python IDE + Terminal
**Status:** Complete
**Source:** `src/artifacts/api-server/`, `src/artifacts/pylearn/`

Students write Python in a Monaco editor and run it in an integrated xterm.js terminal. Python executes server-side via node-pty with a 30-second CPU time limit. Rich output (charts, drawings, scenes) is sent via a null-byte-delimited display protocol from Python stdout through WebSocket to the browser output panel.

### pylearn Library
**Status:** Complete
**Source:** `src/artifacts/api-server/src/python-modules/pylearn.py`

Single-file Python module on PYTHONPATH. Provides: `show()`, `display()`, `display_image()`, `Figure` (chart builder), `Turtle`, `scene()`, `show_sprite()`, `hide_sprite()`, `move_sprite()`, `say()`, `ask()`, `show_text()`, `clear_text()`. No dependencies beyond stdlib — students plot with `Figure` (no numpy/matplotlib/plotly).

### Adventure / Visual Novel Mode
**Status:** Complete
**Source:** `src/artifacts/api-server/src/routes/adventure.ts`, `src/artifacts/pylearn/src/components/workspace/OutputPanel.tsx`

Students build interactive scenes with backgrounds, sprites, dialogue, and player input. Coordinates use a virtual 0–500 space scaled to the panel. Images uploaded by the teacher are stored on a Fly.io persistent volume.

### AI Assistant
**Status:** Complete
**Source:** `src/artifacts/api-server/src/routes/ai.ts`, `src/artifacts/pylearn/src/components/workspace/AiPanel.tsx`

Three modes configurable per classroom: Chat (explains concepts), Suggestion (hints only), Agent (proposes code changes as a diff — student must accept). Agent returns the full updated file in a `---SUGGESTION---` JSON block (`new_content`), shown to the student as a before/after diff; a legacy find/replace format is still parsed as a fallback.

### Teacher Dashboard
**Status:** Complete
**Source:** `src/artifacts/pylearn/src/pages/`

Account management (PIN-based student login), real-time workspace monitoring, AI settings, image uploads, library reference tab.

### Multilingual UI (i18n)
**Status:** Complete
**Source:** `src/artifacts/pylearn/src/lib/i18n.ts`

Browser language detection via `navigator.language`. Supports English (default/fallback) and German. A lightweight `useTranslation()` hook returns a `t(key, vars?)` function — no external library. All user-visible strings in the frontend UI are translated (Landing, AdminDashboard, StudentWorkspace, AdminWorkspaceView, AiPanel, AiChatPanel, Sidebar, NotFound).

### Auth
**Status:** Complete
**Source:** `src/artifacts/api-server/src/auth.ts`

Production: Google OAuth. Development: `LOCAL_AUTH=true` auto-creates a teacher session at `/api/login`.
