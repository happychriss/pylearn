import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import * as pty from "node-pty";
import { getUserUploadDir } from "./adventureStorage";

// __dirname works in both CJS (native) and ESM via tsx (shimmed).
// esbuild CJS output provides __dirname natively.

const IDLE_TIMEOUT_MS = 60_000;

/**
 * Adventure marker protocol spec:
 * Python code emits structured events to stdout using the prefix below followed by JSON.
 * Format: ADVENTURE_EVENT:{"type":"scene","name":"forest"}\n
 * The PTY output handler intercepts complete lines starting with this prefix,
 * strips them from the terminal stream (invisible to xterm), parses the JSON,
 * and forwards the event object via WebSocket as an "adventure-event" message.
 * Supported event types: scene, show, move, say, ask.
 * Any user output line beginning with this prefix is consumed as protocol.
 */
const ADVENTURE_MARKER = "ADVENTURE_EVENT:";

interface PtySession {
  process: pty.IPty;
  tmpFile: string;
  tmpDir: string;
  idleTimer: ReturnType<typeof setTimeout>;
  onOutput: (data: string) => void;
  onExit: (code: number) => void;
  onAdventureEvent?: (event: Record<string, unknown>) => void;
  lineBuffer: string;
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

function processOutput(session: PtySession, data: string): string {
  const combined = session.lineBuffer + data;
  session.lineBuffer = "";

  const nlIndex = combined.lastIndexOf("\n");
  let completePart: string;
  let remainder: string;

  if (nlIndex === -1) {
    if (combined.startsWith(ADVENTURE_MARKER.slice(0, combined.length)) && combined.length < ADVENTURE_MARKER.length) {
      session.lineBuffer = combined;
      return "";
    }
    if (combined.startsWith(ADVENTURE_MARKER)) {
      session.lineBuffer = combined;
      return "";
    }
    return combined;
  }

  completePart = combined.slice(0, nlIndex + 1);
  remainder = combined.slice(nlIndex + 1);

  if (remainder.length > 0) {
    if (remainder.startsWith(ADVENTURE_MARKER) ||
        (remainder.length < ADVENTURE_MARKER.length && ADVENTURE_MARKER.startsWith(remainder))) {
      session.lineBuffer = remainder;
    } else {
      completePart += remainder;
    }
  }

  const lines = completePart.split("\n");
  const output: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const clean = line.replace(/\r$/, "");
    if (clean.startsWith(ADVENTURE_MARKER)) {
      try {
        const jsonStr = clean.slice(ADVENTURE_MARKER.length);
        const event = JSON.parse(jsonStr);
        session.onAdventureEvent?.(event);
      } catch {
      }
    } else {
      output.push(line);
    }
  }

  return output.join("\n");
}

const ADVENTURE_PY_SOURCE = `import sys
import json

_MARKER = "ADVENTURE_EVENT:"

def _emit(event_type, **kwargs):
    payload = {"type": event_type, **kwargs}
    sys.stdout.write(_MARKER + json.dumps(payload) + "\\n")
    sys.stdout.flush()

def scene(name):
    _emit("scene", name=str(name))
    print("--- Scene:", str(name), "---")

def show(sprite, x=0, y=0):
    _emit("show", sprite=str(sprite), x=int(x), y=int(y))

def move(sprite, x=0, y=0):
    _emit("move", sprite=str(sprite), x=int(x), y=int(y))

def say(text):
    _emit("say", text=str(text))
    print(str(text))

def ask(prompt):
    _emit("ask", prompt=str(prompt))
    return input(prompt)
`;

function copyAdventureAssets(userId: string, tmpDir: string) {
  try {
    fs.writeFileSync(path.join(tmpDir, "adventure.py"), ADVENTURE_PY_SOURCE, "utf8");
  } catch {
  }

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
  onAdventureEvent?: (event: Record<string, unknown>) => void
) {
  clearSession(userId);

  const tmpDir = path.join(os.tmpdir(), `pylearn_${userId}_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  copyAdventureAssets(userId, tmpDir);

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
    onAdventureEvent,
    lineBuffer: "",
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
    if (session.lineBuffer) {
      const clean = session.lineBuffer.replace(/\r$/, "");
      if (clean.startsWith(ADVENTURE_MARKER)) {
        try {
          const jsonStr = clean.slice(ADVENTURE_MARKER.length);
          const event = JSON.parse(jsonStr);
          session.onAdventureEvent?.(event);
        } catch {
        }
      } else if (session.lineBuffer) {
        onOutput(session.lineBuffer);
      }
    }
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
