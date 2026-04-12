import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import { onlineUsers } from "./wsState";
import { getSessionId, getSession } from "./auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import cookie from "cookie";
import { startPtySession, sendPtyInput, stopPtySession, type DisplayMessage } from "./ptyManager";

interface WsClient {
  ws: WebSocket;
  userId: string;
  role: string;
  room?: string;
}

const clients = new Map<WebSocket, WsClient>();

export function closeUserConnections(userId: string) {
  clients.forEach((client, ws) => {
    if (client.userId === userId) {
      ws.close();
    }
  });
}

async function authenticateWs(req: IncomingMessage): Promise<{ userId: string; role: string } | null> {
  try {
    const cookies = cookie.parse(req.headers.cookie || "");
    // Check query param for session type (student vs admin)
    const url = new URL(req.url || "", "http://localhost");
    const sessionType = url.searchParams.get("sessionType");
    const sid = sessionType === "student"
      ? (cookies["sid_student"] || cookies["sid"])
      : (cookies["sid"] || cookies["sid_student"]);
    if (!sid) return null;

    const session = await getSession(sid);
    if (!session?.user?.id) return null;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.user.id));
    if (!user) return null;

    return { userId: user.id, role: user.role };
  } catch {
    return null;
  }
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", async (ws, req) => {
    const auth = await authenticateWs(req);

    let client: WsClient = {
      ws,
      userId: auth?.userId || "",
      role: auth?.role || "",
    };
    clients.set(ws, client);

    if (auth) {
      onlineUsers.add(auth.userId);
      broadcastToAdmins({
        type: "user-online",
        userId: auth.userId,
      });
    }

    ws.on("message", (raw) => {
      if (!client.userId) return;
      try {
        const msg = JSON.parse(raw.toString());
        handleMessage(client, msg, ws);
      } catch (err) {
        console.error("[websocket] Malformed message from user", client.userId, err);
      }
    });

    ws.on("close", () => {
      if (client.userId) {
        onlineUsers.delete(client.userId);
        broadcastToAdmins({
          type: "user-offline",
          userId: client.userId,
        });
      }
      clients.delete(ws);
    });
  });

  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, 30000);
}

function broadcastToUser(userId: string, data: Record<string, unknown>) {
  const payload = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  });
}

interface WsMessage {
  type: string;
  room?: string;
  message?: string;
  helpId?: number;
  studentId?: string;
  content?: string;
  filename?: string;
  fileId?: number;
  data?: string;
  code?: string;
}

function handleMessage(client: WsClient, msg: WsMessage, ws: WebSocket) {
  switch (msg.type) {
    case "ping": {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "pong" }));
      }
      break;
    }

    case "join-room": {
      client.room = msg.room;
      break;
    }

    case "leave-room": {
      client.room = undefined;
      break;
    }

    case "help-requested": {
      broadcastToAdmins({
        type: "help-requested",
        userId: client.userId,
        message: msg.message || "I need help",
      });
      break;
    }

    case "help-dismissed": {
      broadcastToAdmins({
        type: "help-dismissed",
        helpId: msg.helpId,
      });
      break;
    }

    case "admin-join-workspace": {
      if (client.role !== "admin" || !msg.studentId) return;
      client.room = msg.studentId;
      broadcastToRoom(msg.studentId, {
        type: "admin-joined",
      }, ws);
      break;
    }

    case "admin-leave-workspace": {
      if (client.role !== "admin") return;
      broadcastToRoom(client.room || "", {
        type: "admin-left",
      }, ws);
      client.room = undefined;
      break;
    }

    case "co-edit-delta": {
      if (client.role !== "admin") return;
      broadcastToRoom(msg.room || client.room || "", {
        type: "co-edit-delta",
        content: msg.content,
        filename: msg.filename,
        fileId: msg.fileId,
        userId: client.userId,
      }, ws);
      break;
    }

    case "file-changed": {
      broadcastToRoom(msg.room || client.room || "", {
        type: "file-changed",
        content: msg.content,
        filename: msg.filename,
        fileId: msg.fileId,
        userId: client.userId,
      }, ws);
      break;
    }

    case "run-code": {
      if (!msg.code) return;
      const userId = client.userId;

      startPtySession(
        userId,
        msg.code,
        (data) => {
          broadcastToUser(userId, { type: "pty-output", data });
          broadcastToAdmins({ type: "pty-output", userId, data }, userId);
        },
        (exitCode) => {
          broadcastToUser(userId, { type: "pty-exit", exitCode });
          broadcastToAdmins({ type: "pty-exit", userId, exitCode }, userId);
        },
        (displayMsg: DisplayMessage) => {
          const payload = { type: "display-event", userId, event: displayMsg };
          broadcastToUser(userId, payload);
          broadcastToAdmins(payload, userId);
        }
      );
      break;
    }

    case "pty-input": {
      if (msg.data) sendPtyInput(client.userId, msg.data);
      break;
    }

    case "stop-code": {
      stopPtySession(client.userId);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "pty-exit", exitCode: -1 }));
      }
      break;
    }
  }
}

function broadcastToAdmins(msg: Record<string, unknown>, excludeUserId?: string) {
  clients.forEach((client) => {
    if (client.role === "admin" && client.ws.readyState === WebSocket.OPEN
        && client.userId !== excludeUserId) {
      client.ws.send(JSON.stringify(msg));
    }
  });
}

export function broadcastToStudents(msg: Record<string, unknown>) {
  const payload = JSON.stringify(msg);
  clients.forEach((client) => {
    if (client.role !== "admin" && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  });
}

function broadcastToRoom(room: string, msg: Record<string, unknown>, exclude?: WebSocket) {
  if (!room) return;
  clients.forEach((client) => {
    if (
      client.ws !== exclude &&
      client.ws.readyState === WebSocket.OPEN &&
      (client.room === room || client.userId === room)
    ) {
      client.ws.send(JSON.stringify(msg));
    }
  });
}
