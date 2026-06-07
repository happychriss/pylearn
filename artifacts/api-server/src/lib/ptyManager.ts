import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import * as pty from "node-pty";
import { getUserUploadDir } from "./adventureStorage";
import { safeScriptFilename } from "./safety";
import { parseDisplayChunk, type DisplayMessage } from "./display-protocol";

// Re-exported so existing importers (websocket.ts) keep working unchanged.
export type { DisplayMessage } from "./display-protocol";

// __dirname works in both CJS (native) and ESM via tsx (shimmed).
// esbuild CJS output provides __dirname natively.

const IDLE_TIMEOUT_MS = 60_000;
// Hard CPU-time limit (seconds) enforced via bash ulimit — kills tight infinite loops
const CPU_LIMIT_SECS = 30;
// Absolute wall-clock cap, independent of output. ulimit -t only counts CPU time,
// so a low-CPU loop that keeps printing (e.g. sleep+print) would never trip it and
// the idle timer keeps resetting on each line. This is the hard ceiling.
const MAX_WALL_MS = 5 * 60_000;
// Cap total forwarded output per run so a `while True: print(...)` can't flood the
// student's (and monitoring teacher's) browser/socket.
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
// Safety ceiling on concurrent interpreters on the single shared machine. A normal
// class is ~15; this only stops a runaway/abusive client from exhausting memory.
const MAX_CONCURRENT_SESSIONS = 30;

// Display-protocol parsing lives in ./display-protocol (pure + unit-tested).

interface PtySession {
  process: pty.IPty;
  tmpFile: string;
  tmpDir: string;
  idleTimer: ReturnType<typeof setTimeout>;
  hardTimer: ReturnType<typeof setTimeout>;
  onOutput: (data: string) => void;
  onExit: (code: number) => void;
  onDisplayEvent?: (event: DisplayMessage) => void;
  displayBuffer: string;
  bytesSent: number;
  // Set when the run was explicitly stopped (user "Stop" or output/limit kill) so
  // the async process onExit doesn't emit a second, duplicate pty-exit.
  stopped: boolean;
}

const sessions = new Map<string, PtySession>();

function clearSession(userId: string) {
  const session = sessions.get(userId);
  if (!session) return;

  clearTimeout(session.idleTimer);
  clearTimeout(session.hardTimer);
  try {
    session.process.kill();
  } catch (err) {
    console.error(`[ptyManager] Failed to kill process for user ${userId}:`, err);
  }
  try {
    fs.rmSync(session.tmpDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`[ptyManager] Failed to clean up tmp dir for user ${userId}:`, err);
  }
  sessions.delete(userId);
}

function resetIdleTimer(userId: string) {
  const session = sessions.get(userId);
  if (!session) return;
  clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => clearSession(userId), IDLE_TIMEOUT_MS);
}


/**
 * Run one PTY chunk through the display-protocol parser, updating the session's
 * carry-over buffer and dispatching any complete display events. Returns the
 * terminal text with markers stripped.
 */
function processOutput(session: PtySession, data: string): string {
  const { output, buffer, events } = parseDisplayChunk(session.displayBuffer, data);
  session.displayBuffer = buffer;
  for (const ev of events) session.onDisplayEvent?.(ev);
  return output;
}

function copyUserUploads(userId: string, tmpDir: string) {
  try {
    const uploadDir = getUserUploadDir(userId);
    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      for (const file of files) {
        const src = path.join(uploadDir, file);
        const dest = path.join(tmpDir, file);
        fs.copyFileSync(src, dest);
      }
    }
  } catch (err) {
    console.error("[ptyManager] Failed to copy user uploads:", err);
  }
}

export function startPtySession(
  userId: string,
  files: { filename: string; content: string }[],
  activeFilename: string,
  onOutput: (data: string) => void,
  onExit: (code: number) => void,
  onDisplayEvent?: (event: DisplayMessage) => void
) {
  clearSession(userId);

  // Capacity guard: a normal class is well under this. Prevents a single runaway
  // or abusive client from spawning unbounded interpreters on the shared machine.
  if (sessions.size >= MAX_CONCURRENT_SESSIONS) {
    onOutput("\r\n[Server busy — too many programs running. Please try again in a moment.]\r\n");
    onExit(1);
    return;
  }

  const tmpDir = path.join(os.tmpdir(), `pylearn_${userId}_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  copyUserUploads(userId, tmpDir);

  // Filenames come straight off the WebSocket message — sanitize so a crafted
  // "../../x" can't write outside the per-run temp dir or be executed.
  for (const f of files) {
    const safeName = safeScriptFilename(f.filename);
    fs.writeFileSync(path.join(tmpDir, safeName), f.content, "utf8");
  }
  const tmpFile = path.join(tmpDir, safeScriptFilename(activeFilename));

  const modulesDir = path.join(__dirname, "..", "python-modules");
  const existingPythonPath = process.env.PYTHONPATH || "";
  const pythonPath = existingPythonPath
    ? `${modulesDir}:${existingPythonPath}`
    : modulesDir;

  // Wrap in bash so we can enforce a CPU-time hard limit (kills infinite loops).
  // `exec` replaces the shell process so limits are inherited by python3 directly.
  const shell = pty.spawn("bash", ["-c", `ulimit -t ${CPU_LIMIT_SECS}; exec python3 -u "${tmpFile}"`], {
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    cwd: tmpDir,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      PYTHONUNBUFFERED: "1",
      PYTHONPATH: pythonPath,
    },
  });

  const idleTimer = setTimeout(() => {
    onOutput("\r\n[Session timed out after 60 seconds of inactivity]\r\n");
    clearSession(userId);
  }, IDLE_TIMEOUT_MS);

  // Absolute ceiling: kills the run after MAX_WALL_MS regardless of activity.
  const hardTimer = setTimeout(() => {
    onOutput("\r\n[Program stopped — it ran longer than the time limit.]\r\n");
    clearSession(userId);
  }, MAX_WALL_MS);

  const session: PtySession = {
    process: shell,
    tmpFile,
    tmpDir,
    idleTimer,
    hardTimer,
    onOutput,
    onExit,
    onDisplayEvent,
    displayBuffer: "",
    bytesSent: 0,
    stopped: false,
  };
  sessions.set(userId, session);

  shell.onData((data) => {
    // Once stopped (or output-capped) ignore any buffered tail.
    if (session.stopped) return;
    resetIdleTimer(userId);
    const filtered = processOutput(session, data);
    if (!filtered) return;

    session.bytesSent += filtered.length;
    if (session.bytesSent > MAX_OUTPUT_BYTES) {
      onOutput("\r\n[Output limit reached — program stopped. Try printing less.]\r\n");
      session.stopped = true;          // suppress the duplicate exit from onExit below
      clearSession(userId);
      onExit(-1);
      return;
    }
    onOutput(filtered);
  });

  shell.onExit(({ exitCode }) => {
    // Discard any incomplete display buffer at exit
    session.displayBuffer = "";
    clearTimeout(session.idleTimer);
    clearTimeout(session.hardTimer);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`[ptyManager] Failed to clean up tmp dir on exit for user ${userId}:`, err);
    }
    sessions.delete(userId);
    // If the run was explicitly stopped/capped, the exit event was already sent.
    if (session.stopped) return;
    onExit(exitCode ?? 0);
  });
}

export function sendPtyInput(userId: string, data: string): boolean {
  const session = sessions.get(userId);
  if (!session) return false;
  resetIdleTimer(userId);
  session.process.write(data);
  return true;
}

export function stopPtySession(userId: string) {
  // Mark stopped first so the process's async onExit doesn't emit a second
  // pty-exit after the caller sends its own "[Stopped]" (-1) event.
  const session = sessions.get(userId);
  if (session) session.stopped = true;
  clearSession(userId);
}

export function hasPtySession(userId: string): boolean {
  return sessions.has(userId);
}
