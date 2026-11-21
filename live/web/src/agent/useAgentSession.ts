import { useCallback, useEffect, useRef, useState } from "react";
import { SignalClient } from "../rtc/signalClient";
import { Peer } from "../rtc/peer";
import { ControlSender, POINTER_MS, ARROW_MS } from "./controlSender";
import { useFreezeTools } from "./useFreezeTools";
import { useGallery } from "./useGallery";
import { createSession, endSession } from "../api";

export type AgentSession = { code: string; customerUrl: string };
export type AgentEvent = "peer-joined" | "peer-left" | "offer" | "joined";

/**
 * Decides what to do with the Peer for a signaling event. The customer builds a new
 * RTCPeerConnection before every offer, so every offer gets a fresh Peer here too.
 */
export function nextAction(event: AgentEvent, _state: { hasPeer: boolean }): "connect" | "disconnect" | "none" {
  if (event === "peer-joined" || event === "offer") return "connect";
  if (event === "peer-left") return "disconnect";
  return "none";
}

/**
 * "live" needs a connected peer, an open guidance channel and a video frame to aim at
 * (clicks before the first frame have no picture to map to); until then it reads "connecting".
 */
export function shownStatus(status: string, ready: boolean, closeReason = ""): string {
  const s = status === "live" && !ready ? "connecting" : status;
  return closeReason ? `${s} (${closeReason})` : s;
}

export function useAgentSession() {
  const [session, setSession] = useState<AgentSession>();
  const [status, setStatus] = useState("no session");
  const [stream, setStream] = useState<MediaStream>();
  const [muted, setMuted] = useState(false);
  const [note, setNote] = useState("");
  const [channelOpen, setChannelOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [videoReady, setVideoReady] = useState(false);
  const [, bump] = useState(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const sig = useRef<SignalClient>();
  const peer = useRef<Peer>();
  const sender = useRef<ControlSender>();
  const local = useRef<MediaStream>();
  const stop = useRef<() => void>(() => {});
  const ackRef = useRef<(a: { frameId: string; ok: boolean }) => void>(() => {});
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const tools = useFreezeTools(sender, {
    bump: () => bump((n) => n + 1), setStatus, setNote,
  }, videoEl);
  const gallery = useGallery(session?.code, videoEl, tools, setNote);
  ackRef.current = tools.onAck;

  useEffect(() => () => {
    stop.current();
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);

  const dropSender = () => { sender.current = undefined; tools.reset(); setChannelOpen(false); bump((n) => n + 1); };

  const expireAt = (ms: number) => {
    const t = setTimeout(() => { timers.current.delete(t); bump((n) => n + 1); }, ms + 20);
    timers.current.add(t);
  };

  const pointer = useCallback((fx: number, fy: number) => {
    sender.current?.pointer(fx, fy); bump((n) => n + 1); expireAt(POINTER_MS);
  }, []);

  const arrow = useCallback((from: [number, number], to: [number, number], color: string) => {
    sender.current?.arrow(from[0], from[1], to[0], to[1], color); bump((n) => n + 1); expireAt(ARROW_MS);
  }, []);

  const newSession = useCallback(async () => {
    stop.current();
    setStream(undefined);
    setMuted(false);
    dropSender();
    setNote("");
    setCloseReason("");
    setStatus("no session");
    let micNote = "";
    let audio: MediaStream | undefined;
    try { audio = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { micNote = "microphone unavailable"; }
    local.current = audio;
    const s: AgentSession | undefined = await createSession().catch(() => undefined);
    if (!s) { audio?.getTracks().forEach((t) => t.stop()); return setStatus("connection lost"); }
    gallery.reset();
    setSession(s);
    setNote(micNote);
    setStatus("waiting for customer");

    let ice: RTCIceServer[] = [];
    const connect = () => {
      peer.current?.close();
      dropSender();
      const p = new Peer({
        role: "agent", iceServers: ice, signal: sig.current!,
        onTrack: setStream,
        onControl: (ch) => {
          const cs = new ControlSender(ch, { onAck: (a) => ackRef.current(a) });
          sender.current = cs;
          const sync = () => { if (sender.current === cs) setChannelOpen(ch.readyState === "open"); };
          ch.addEventListener("open", sync);
          ch.addEventListener("close", sync);
          sync();
          ch.onmessage = (ev) => { if (typeof ev.data === "string") { cs.onMessage(ev.data); bump((n) => n + 1); } };
        },
        onState: (st) => {
          if (st === "connected") setStatus("live");
          else if (st === "connecting") setStatus("connecting");
          else if (st === "disconnected" || st === "failed") setStatus("customer reconnecting");
        },
      });
      peer.current = p;
      p.start(audio).catch(() => setStatus("connection lost"));
    };
    sig.current = new SignalClient(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?role=agent&code=${s.code}`, {
      onJoined: (m) => { ice = m.iceServers ?? []; },
      onPeerJoined: () => {
        if (nextAction("peer-joined", { hasPeer: !!peer.current }) === "connect") { setStatus("connecting"); connect(); }
      },
      onPeerLeft: () => {
        if (nextAction("peer-left", { hasPeer: !!peer.current }) === "disconnect") { peer.current?.close(); peer.current = undefined; dropSender(); }
        setStatus("customer reconnecting");
      },
      onSignal: (m) => {
        if (m.type === "offer" && nextAction("offer", { hasPeer: !!peer.current }) === "connect") connect();
        peer.current?.handleSignal(m).catch(() => {});
      },
      onEnded: () => { stop.current(); setStream(undefined); dropSender(); setStatus("ended"); },
      onClosed: (_code, reason) => setCloseReason(reason),
      onStatus: (st) => {
        if (st === "open") setCloseReason("");
        else if (st === "reconnecting") setStatus("reconnecting");
        else if (st === "lost") setStatus("connection lost");
      },
      onError: (msg) => setNote(msg),
    });
    stop.current = () => {
      sig.current?.close(); peer.current?.close();
      sig.current = undefined; peer.current = undefined;
      audio?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleMute = () => {
    const next = !muted;
    local.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  const end = async () => {
    if (session) await endSession(session.code).catch(() => {});
    stop.current();
    setStream(undefined);
    setStatus("ended");
  };

  return {
    session, status: shownStatus(status, channelOpen && videoReady, closeReason), lost: status === "connection lost", stream, muted, newSession, toggleMute, end,
    note, channelOpen, setVideoReady, pointer, arrow, tools, gallery,
    view: sender.current?.local() ?? { shapes: [], transients: [] },
  };
}
