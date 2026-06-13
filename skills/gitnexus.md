---
name: gitnexus
description: GitNexus code intelligence — installation, MCP activation, known fixes, and usage patterns
---

# GitNexus

GitNexus builds a code graph (symbols, relationships, execution flows) from the source tree and exposes it via MCP tools and CLI commands.

---

## Installation

```bash
# 1. Index the source tree (run from the project root — /workspace/src)
cd /workspace/src
npx gitnexus@latest analyze

# 2. Register MCP server + hooks in ~/.claude/settings.json
npx gitnexus@latest setup
```

`analyze` creates `.gitnexus/` in the working directory (gitignore it).
`setup` adds PreToolUse/PostToolUse hooks to `~/.claude/settings.json`.

---

## Required Patches (apply after any npx cache clear)

Both files below open the LadybugDB database with `readOnly=true` but lazily attempt to create FTS indexes (a write operation). Patch both to `readOnly=false`.

### File 1: bridge-db.js

```
/home/ubuntu/.npm/_npx/e46929201c1128dd/node_modules/gitnexus/dist/core/group/bridge-db.js
```

Find line ~427:
```js
new lbug.Database(dbPath, 0, false, true)   // 4th arg = readOnly
```
Change last `true` → `false`.

### File 2: pool-adapter.js

```
/home/ubuntu/.npm/_npx/e46929201c1128dd/node_modules/gitnexus/dist/core/lbug/pool-adapter.js
```

Find line ~249 (same pattern):
```js
new lbug.Database(dbPath, 0, false, true)
```
Change last `true` → `false`.

Patch with Python (avoids multiline sed issues):

```bash
python3 - <<'EOF'
import re, pathlib
for p in [
    "/home/ubuntu/.npm/_npx/e46929201c1128dd/node_modules/gitnexus/dist/core/group/bridge-db.js",
    "/home/ubuntu/.npm/_npx/e46929201c1128dd/node_modules/gitnexus/dist/core/lbug/pool-adapter.js",
]:
    f = pathlib.Path(p)
    f.write_text(f.read_text().replace(
        "new lbug.Database(dbPath, 0, false, true)",
        "new lbug.Database(dbPath, 0, false, false)"
    ))
    print(f"Patched {p}")
EOF
```

---

## MCP Activation

### 1. `~/.mcp.json`

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "node",
      "args": ["/home/ubuntu/.npm/_npx/e46929201c1128dd/node_modules/gitnexus/dist/cli/index.js", "mcp"]
    }
  }
}
```

### 2. `~/.claude/settings.json` — required key

```json
{
  "enableAllProjectMcpServers": true
}
```

**Restart the Claude Code session** after adding these — the MCP server is only loaded at session start.

### 3. Verify MCP is active (after restart)

Run these two checks:

```
mcp__gitnexus__list_repos   — should return the pylearn repo with stats
mcp__gitnexus__tool_map     — lists registered tools (may return empty array; that's OK)
```

If `list_repos` returns the repo, the MCP server is live and ready to use.

---

## Auto-Reindex Hook

Keeps the index fresh after every Write/Edit. Add to `~/.claude/settings.json` under `hooks.PostToolUse`:

```json
{
  "matcher": "Write|Edit",
  "hooks": [{
    "type": "command",
    "command": "[ -d /workspace/src/.gitnexus ] && cd /workspace/src && node /home/ubuntu/.npm/_npx/e46929201c1128dd/node_modules/gitnexus/dist/cli/index.js analyze > /tmp/gitnexus-reindex.log 2>&1 || true",
    "timeout": 30,
    "async": true,
    "statusMessage": "Updating GitNexus index..."
  }]
}
```

---

## CLI Commands

```bash
# All commands run from /workspace/src (where .gitnexus/ lives)
cd /workspace/src

# Re-index
npx gitnexus@latest analyze

# Context for a symbol — callers, callees, execution flows
npx gitnexus@latest context <symbolName>

# Impact / blast radius — who calls this upstream
npx gitnexus@latest impact <symbolName>

# Detect what changed since last commit
npx gitnexus@latest detect-changes
```

**Known issue:** `npx gitnexus@latest query` segfaults on this Linux environment (native LadybugDB binary crash). Use `context` and `impact` instead.

**Lock file issue (`lbug` FTS lock error):** If a background `gitnexus analyze` is run (e.g. via `run_in_background`) and the session ends before it finishes, it leaves a stale lock file at `/workspace/src/.gitnexus/lbug`. Subsequent MCP calls will fail with `Could not set lock on file`. Fix:
```bash
rm -f /workspace/src/.gitnexus/lbug
npx gitnexus analyze   # re-run if needed
```
Never run `gitnexus analyze` in the background — always wait for it to finish.

---

## MCP Tools (once session restarts with MCP active)

```
gitnexus_impact({ target: "symbolName", direction: "upstream" })
gitnexus_context({ name: "symbolName" })
gitnexus_detect_changes()
```

Also available as MCP resources:

```
gitnexus://repo/pylearn/context      — codebase overview + freshness
gitnexus://repo/pylearn/clusters     — functional areas
gitnexus://repo/pylearn/processes    — execution flows
gitnexus://repo/pylearn/process/{n}  — step-by-step trace
```

---

## Full Setup Checklist (fresh container)

1. `cd /workspace/src && npx gitnexus@latest analyze` — build index
2. `npx gitnexus@latest setup` — write hooks to `~/.claude/settings.json`
3. Apply FTS patch (Python one-liner above) to `bridge-db.js` and `pool-adapter.js`
4. Create `~/.mcp.json` with gitnexus server config (see above)
5. Add `"enableAllProjectMcpServers": true` to `~/.claude/settings.json`
6. Add auto-reindex PostToolUse hook to `~/.claude/settings.json` (see above)
7. **Restart Claude Code session**
8. Verify: call `mcp__gitnexus__list_repos` — expect pylearn repo with stats

---

## Current Index (pylearn)

- 1830 symbols, 2963 relationships, 88 execution flows
- Indexed from `/workspace/src`
- Index stored in `/workspace/src/.gitnexus/` (gitignored)
