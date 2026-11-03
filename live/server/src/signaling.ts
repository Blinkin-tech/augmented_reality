import type http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { parseClientSignal } from "./protocol/signal";
import type { RTCIceServerLike } from "./routes/ice";
import type { SessionStore } from "./sessions";

const MAX_PAYLOAD_BYTES = 64 * 1024;
export const HEARTBEAT_MS = 10_000;

type Role = "agent" | "customer";

const isRole = (value: string | null): value is Role => value === "agent" || value === "customer";
const inUse = (ws: WebSocket | undefined): boolean =>
  ws !== undefined && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING);

function send(ws: WebSocket | undefined, message: unknown): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

export function attachSignaling(
  server: http.Server,
  deps: { store: SessionStore; iceServers: RTCIceServerLike[]; heartbeatMs?: number },
): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: MAX_PAYLOAD_BYTES });
  const alive = new WeakMap<WebSocket, boolean>();

  // A phone that switches networks can leave its old socket open for minutes. Without a
  // heartbeat that dead socket keeps the role slot and the reconnect gets 4409.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) { ws.terminate(); continue; }
      alive.set(ws, false);
      ws.ping();
    }
  }, deps.heartbeatMs ?? HEARTBEAT_MS);
  heartbeat.unref();
  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws, req) => {
    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));
    ws.on("error", () => ws.terminate());
    const url = new URL(req.url ?? "", "http://x");
    const role = url.searchParams.get("role");
    const session = deps.store.get(url.searchParams.get("code") ?? "");
    if (!session || session.state === "ended" || !isRole(role)) {
      ws.close(4404, "unknown session");
      return;
    }
    const slot = role === "agent" ? "agentSocket" : "customerSocket";
    const peerSlot = role === "agent" ? "customerSocket" : "agentSocket";
    if (inUse(session[slot])) {
      ws.close(4409, "role taken");
      return;
    }
    session[slot] = ws;
    const peer = session[peerSlot];
    const peerPresent = inUse(peer);
    if (peerPresent) session.state = "live";
    send(ws, { type: "joined", role, peerPresent, iceServers: deps.iceServers });
    if (peerPresent) send(peer, { type: "peer-joined" });

    ws.on("message", (data) => {
      const signal = parseClientSignal(data.toString());
      if (!signal) {
        send(ws, { type: "error", message: "invalid message" });
        return;
      }
      send(session[peerSlot], signal);
    });

    ws.on("close", () => {
      if (session[slot] !== ws) return;
      session[slot] = undefined;
      send(session[peerSlot], { type: "peer-left" });
      if (session.state !== "ended") session.state = "waiting";
    });
  });

  return wss;
}
