import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { startServer } from "../src/index";
import { loadConfig } from "../src/config";

let base = ""; let handle: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { handle = await startServer(loadConfig({ PORT: "0" })); base = `ws://127.0.0.1:${(handle.server.address() as { port: number }).port}`; });
afterAll(() => handle.close());

// The server sends "joined" right after the handshake, so messages are queued from
// the moment the socket is created; otherwise one can arrive before next() listens.
const queues = new WeakMap<WebSocket, { items: any[]; waiter?: (m: any) => void }>();
const track = (ws: WebSocket) => {
  const q: { items: any[]; waiter?: (m: any) => void } = { items: [] };
  queues.set(ws, q);
  ws.on("message", (d) => { const m = JSON.parse(d.toString()); if (q.waiter) { const w = q.waiter; q.waiter = undefined; w(m); } else q.items.push(m); });
  return ws;
};
const open = (code: string, role: string) => new Promise<WebSocket>((res) => { const ws = track(new WebSocket(`${base}/ws?code=${code}&role=${role}`)); ws.once("open", () => res(ws)); });
const next = (ws: WebSocket) => new Promise<any>((res) => { const q = queues.get(ws)!; if (q.items.length) res(q.items.shift()); else q.waiter = res; });
const closed = (ws: WebSocket) => new Promise<[number, string]>((res) => ws.once("close", (c, r) => res([c, r.toString()])));
const newCode = async () => (await (await fetch(base.replace("ws", "http") + "/api/sessions", { method: "POST" })).json()).code as string;

describe("signaling", () => {
  it("joins both roles, relays offer/answer/ice, reports peer-left", async () => {
    const code = await newCode();
    const agent = await open(code, "agent");
    const j1 = await next(agent); expect(j1).toMatchObject({ type: "joined", role: "agent", peerPresent: false }); expect(j1.iceServers[0].urls).toContain("stun:");
    const cust = await open(code, "customer");
    const [j2, pj] = await Promise.all([next(cust), next(agent)]);
    expect(j2).toMatchObject({ type: "joined", role: "customer", peerPresent: true }); expect(pj).toEqual({ type: "peer-joined" });
    expect(handle.store.get(code)?.state).toBe("live");
    cust.send(JSON.stringify({ type: "offer", sdp: "o" })); expect(await next(agent)).toEqual({ type: "offer", sdp: "o" });
    agent.send(JSON.stringify({ type: "answer", sdp: "a" })); expect(await next(cust)).toEqual({ type: "answer", sdp: "a" });
    agent.send(JSON.stringify({ type: "ice", candidate: { c: 1 } })); expect(await next(cust)).toEqual({ type: "ice", candidate: { c: 1 } });
    agent.send("not json"); expect(await next(agent)).toMatchObject({ type: "error" });
    cust.close(); expect(await next(agent)).toEqual({ type: "peer-left" });
    agent.close();
  });
  it("rejects unknown code and taken role, frees the slot after close", async () => {
    const bad = new WebSocket(`${base}/ws?code=ZZZZZZ&role=agent`); expect(await closed(bad)).toEqual([4404, "unknown session"]);
    const code = await newCode();
    const a1 = await open(code, "agent"); await next(a1);
    const a2 = new WebSocket(`${base}/ws?code=${code}&role=agent`); expect(await closed(a2)).toEqual([4409, "role taken"]);
    a1.close(); await closed(a1);
    const a3 = await open(code, "agent"); expect(await next(a3)).toMatchObject({ type: "joined", role: "agent" }); a3.close();
  });
  it("closes sockets when the session ends", async () => {
    const code = await newCode();
    const a = await open(code, "agent"); await next(a);
    await fetch(base.replace("ws", "http") + `/api/sessions/${code}/end`, { method: "POST" });
    expect(await closed(a)).toEqual([4000, "session ended"]);
  });
  it("survives an oversized frame: drops that socket and keeps serving the code", async () => {
    const code = await newCode();
    const a = await open(code, "agent"); await next(a);
    const gone = closed(a);
    a.send("x".repeat(70000));
    await gone;
    const a2 = await open(code, "agent"); expect(await next(a2)).toMatchObject({ type: "joined", role: "agent" }); a2.close();
  });
});

describe("signaling heartbeat", () => {
  let hb: Awaited<ReturnType<typeof startServer>>; let hbBase = "";
  beforeAll(async () => { hb = await startServer(loadConfig({ PORT: "0" }), { heartbeatMs: 50 }); hbBase = `ws://127.0.0.1:${(hb.server.address() as { port: number }).port}`; });
  afterAll(() => hb.close());
  const openHb = (code: string, role: string, opts: WebSocket.ClientOptions = {}) =>
    new Promise<WebSocket>((res) => { const ws = track(new WebSocket(`${hbBase}/ws?code=${code}&role=${role}`, opts)); ws.once("open", () => res(ws)); });

  it("terminates a socket that never answers pings and frees its slot", async () => {
    const code = (await (await fetch(hbBase.replace("ws", "http") + "/api/sessions", { method: "POST" })).json()).code as string;
    const healthy = await openHb(code, "customer"); await next(healthy);
    const dead = await openHb(code, "agent", { autoPong: false });
    expect(await next(dead)).toMatchObject({ type: "joined", role: "agent" });
    expect(await next(healthy)).toEqual({ type: "peer-joined" });
    const [codeClosed] = await closed(dead);
    expect(codeClosed).toBe(1006);
    expect(await next(healthy)).toEqual({ type: "peer-left" });
    const again = await openHb(code, "agent");
    expect(await next(again)).toMatchObject({ type: "joined", role: "agent", peerPresent: true });
    expect(healthy.readyState).toBe(WebSocket.OPEN);
    again.close(); healthy.close();
  });
});
