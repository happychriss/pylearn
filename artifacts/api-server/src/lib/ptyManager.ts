import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import * as pty from "node-pty";
import { getUserUploadDir } from "./adventureStorage";

// __dirname works in both CJS (native) and ESM via tsx (shimmed).
// esbuild CJS output provides __dirname natively.

const IDLE_TIMEOUT_MS = 60_000;

/**
 * Universal display protocol:
 * Python code emits rich output via null-byte delimited markers in stdout.
 * Format: \x00PYLEARN_DISPLAY\x00{"mime":"...","data":...}\x00
 * The PTY output handler intercepts these markers, strips them from the
 * terminal stream, parses the JSON, and forwards the display message via
 * WebSocket as a "display-event" message.
 */
const DISPLAY_START = "\x00PYLEARN_DISPLAY\x00";
const DISPLAY_END = "\x00";

export interface DisplayMessage {
  mime: string;
  data: unknown;
  id?: string;
  append?: boolean;
}

interface PtySession {
  process: pty.IPty;
  tmpFile: string;
  tmpDir: string;
  idleTimer: ReturnType<typeof setTimeout>;
  onOutput: (data: string) => void;
  onExit: (code: number) => void;
  onDisplayEvent?: (event: DisplayMessage) => void;
  displayBuffer: string;
}

const sessions = new Map<string, PtySession>();

function clearSession(userId: string) {
  const session = sessions.get(userId);
  if (!session) return;

  clearTimeout(session.idleTimer);
  try {
    session.process.kill();
  } catch {
  }
  try {
    fs.rmSync(session.tmpDir, { recursive: true, force: true });
  } catch {
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
 * Extract and emit any \x00PYLEARN_DISPLAY\x00{json}\x00 markers from raw data.
 * Returns the data with markers stripped out.
 */
function extractDisplayMarkers(session: PtySession, data: string): string {
  // Prepend any partial display buffer from previous chunk
  let input = session.displayBuffer + data;
  session.displayBuffer = "";
  let output = "";

  while (true) {
    const startIdx = input.indexOf(DISPLAY_START);
    if (startIdx === -1) {
      // No more markers — check if data ends with a partial DISPLAY_START
      // e.g. input ends with "\x00PYL" which could be the start of a marker
      for (let i = Math.max(0, input.length - DISPLAY_START.length); i < input.length; i++) {
        const tail = input.slice(i);
        if (DISPLAY_START.startsWith(tail) && tail.length < DISPLAY_START.length) {
          session.displayBuffer = tail;
          output += input.slice(0, i);
          return output;
        }
      }
      output += input;
      return output;
    }

    // Add everything before the marker to output
    output += input.slice(0, startIdx);

    // Find the closing null byte after the start marker
    const jsonStart = startIdx + DISPLAY_START.length;
    const endIdx = input.indexOf(DISPLAY_END, jsonStart);

    if (endIdx === -1) {
      // Incomplete marker — buffer it for next chunk
      session.displayBuffer = input.slice(startIdx);
      return output;
    }

    // Extract and parse the JSON
    const jsonStr = input.slice(jsonStart, endIdx);
    try {
      const msg = JSON.parse(jsonStr) as DisplayMessage;
      if (msg.mime && msg.data !== undefined) {
        session.onDisplayEvent?.(msg);
      }
    } catch {
      // Bad JSON — silently discard
    }

    // Continue processing after the closing null byte
    input = input.slice(endIdx + 1);
  }
}

function processOutput(session: PtySession, data: string): string {
  return extractDisplayMarkers(session, data);
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
  } catch {
  }
}

export function startPtySession(
  userId: string,
  code: string,
  onOutput: (data: string) => void,
  onExit: (code: number) => void,
  onDisplayEvent?: (event: DisplayMessage) => void
) {
  clearSession(userId);

  const tmpDir = path.join(os.tmpdir(), `pylearn_${userId}_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  copyUserUploads(userId, tmpDir);

  const tmpFile = path.join(tmpDir, "script.py");
  fs.writeFileSync(tmpFile, code, "utf8");

  const modulesDir = path.join(__dirname, "..", "python-modules");
  const existingPythonPath = process.env.PYTHONPATH || "";
  const pythonPath = existingPythonPath
    ? `${modulesDir}:${existingPythonPath}`
    : modulesDir;

  const shell = pty.spawn("python3", ["-u", tmpFile], {
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

  const session: PtySession = {
    process: shell,
    tmpFile,
    tmpDir,
    idleTimer,
    onOutput,
    onExit,
    onDisplayEvent,
    displayBuffer: "",
  };
  sessions.set(userId, session);

  shell.onData((data) => {
    resetIdleTimer(userId);
    const filtered = processOutput(session, data);
    if (filtered) {
      onOutput(filtered);
    }
  });

  shell.onExit(({ exitCode }) => {
    // Discard any incomplete display buffer at exit
    session.displayBuffer = "";
    clearTimeout(session.idleTimer);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
    }
    sessions.delete(userId);
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
  clearSession(userId);
}

export function hasPtySession(userId: string): boolean {
  return sessions.has(userId);
}
