import { useState, useEffect, useCallback } from 'react';

type Handler = (data: Record<string, unknown>) => void;
type ConnectCallback = () => void;
export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected';

interface Connection {
  ws: WebSocket | null;
  status: WebSocketStatus;
  handlers: Map<string, Set<Handler>>;
  connectCallbacks: Set<ConnectCallback>;
  statusListeners: Set<(s: WebSocketStatus) => void>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectDelay: number;
  messageQueue: string[];
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  lastPong: number;
}

const MIN_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

const connections = new Map<string, Connection>();

function getConn(path: string): Connection {
  if (!connections.has(path)) {
    connections.set(path, {
      ws: null,
      status: 'disconnected',
      handlers: new Map(),
      connectCallbacks: new Set(),
      statusListeners: new Set(),
      reconnectTimer: null,
      reconnectDelay: MIN_RECONNECT_MS,
      messageQueue: [],
      heartbeatTimer: null,
      lastPong: Date.now(),
    });
  }
  return connections.get(path)!;
}

function setConnStatus(conn: Connection, status: WebSocketStatus) {
  conn.status = status;
  conn.statusListeners.forEach((l) => l(status));
}

function stopHeartbeat(conn: Connection) {
  if (conn.heartbeatTimer) {
    clearInterval(conn.heartbeatTimer);
    conn.heartbeatTimer = null;
  }
}

function startHeartbeat(conn: Connection, path: string) {
  stopHeartbeat(conn);
  conn.lastPong = Date.now();
  conn.heartbeatTimer = setInterval(() => {
    if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - conn.lastPong > HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS) {
      conn.ws.close();
      return;
    }
    try {
      conn.ws.send(JSON.stringify({ type: 'ping' }));
    } catch {
      openConnection(path);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function flushQueue(conn: Connection) {
  while (conn.messageQueue.length > 0 && conn.ws?.readyState === WebSocket.OPEN) {
    const msg = conn.messageQueue.shift()!;
    conn.ws.send(msg);
  }
}

function openConnection(path: string) {
  const conn = getConn(path);

  if (conn.ws && (conn.ws.readyState === WebSocket.CONNECTING || conn.ws.readyState === WebSocket.OPEN)) {
    return;
  }

  if (conn.reconnectTimer) {
    clearTimeout(conn.reconnectTimer);
    conn.reconnectTimer = null;
  }

  setConnStatus(conn, 'connecting');

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}${path}`;

  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    scheduleReconnect(conn, path);
    return;
  }
  conn.ws = ws;

  ws.onopen = () => {
    conn.reconnectDelay = MIN_RECONNECT_MS;
    setConnStatus(conn, 'connected');
    startHeartbeat(conn, path);
    flushQueue(conn);
    conn.connectCallbacks.forEach((cb) => cb());
  };

  ws.onclose = () => {
    stopHeartbeat(conn);
    setConnStatus(conn, 'disconnected');
    scheduleReconnect(conn, path);
  };

  ws.onerror = () => {
    ws.close();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as Record<string, unknown>;
      if (msg.type === 'pong') {
        conn.lastPong = Date.now();
        return;
      }
      const handlers = conn.handlers.get(msg.type as string);
      if (handlers) {
        handlers.forEach((h) => h(msg));
      }
    } catch {
    }
  };
}

function scheduleReconnect(conn: Connection, path: string) {
  if (conn.reconnectTimer) return;
  conn.reconnectTimer = setTimeout(() => {
    conn.reconnectTimer = null;
    conn.reconnectDelay = Math.min(conn.reconnectDelay * 2, MAX_RECONNECT_MS);
    openConnection(path);
  }, conn.reconnectDelay);
}

export function useWebSocket(path: string = '/api/ws') {
  const conn = getConn(path);
  const [status, setLocalStatus] = useState<WebSocketStatus>(conn.status);

  useEffect(() => {
    conn.statusListeners.add(setLocalStatus);
    openConnection(path);
    return () => {
      conn.statusListeners.delete(setLocalStatus);
    };
  }, [path, conn]);

  const emit = useCallback(
    (type: string, data?: Record<string, unknown>) => {
      const c = getConn(path);
      const payload = JSON.stringify({ type, ...data });
      if (c.ws?.readyState === WebSocket.OPEN) {
        c.ws.send(payload);
      } else {
        c.messageQueue.push(payload);
      }
    },
    [path],
  );

  const on = useCallback(
    (type: string, handler: Handler): (() => void) => {
      const c = getConn(path);
      if (!c.handlers.has(type)) {
        c.handlers.set(type, new Set());
      }
      c.handlers.get(type)!.add(handler);
      return () => {
        c.handlers.get(type)?.delete(handler);
      };
    },
    [path],
  );

  const off = useCallback(
    (type: string) => {
      getConn(path).handlers.delete(type);
    },
    [path],
  );

  const onConnect = useCallback(
    (cb: ConnectCallback) => {
      getConn(path).connectCallbacks.add(cb);
      return () => getConn(path).connectCallbacks.delete(cb);
    },
    [path],
  );

  return { emit, on, off, onConnect, status };
}
