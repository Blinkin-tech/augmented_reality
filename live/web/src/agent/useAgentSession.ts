import { useCallback, useEffect, useRef, useState } from "react";
import { SignalClient } from "../rtc/signalClient";
import { Peer } from "../rtc/peer";
import { ControlSender } from "./controlSender";

export type AgentSession = { code: string; customerUrl: string };
export type AgentEvent = "peer-joined" | "peer-left" | "offer" | "joined";

/** Decides what to do with the Peer for a signaling event. */
export function nextAction(event: AgentEvent, state: { hasPeer: boolean }): "connect" | "disconnect" | "none" {
  if (event === "peer-joined") return "connect";
  if (event === "peer-left") return "disconnect";
  if (event === "offer" && !state.hasPeer) return "connect";
  return "none";
}

export function useAgentSession() {
  const [session, setSession] = useState<AgentSession>();
  const [status, setStatus] = useState("no session");
  const [stream, setStream] = useState<MediaStream>();
  const [muted, setMuted] = useState(false);
  const [, bump] = useState(0);
  const sig = useRef<SignalClient>();
  const peer = useRef<Peer>();
  const sender = useRef<ControlSender>();
  const local = useRef<MediaStream>();
  const stop = useRef<() => void>(() => {});

  useEffect(() => () => stop.current(), []);

  const newSession = useCallback(async () => {
    stop.current();
    setStream(undefined);
    setMuted(false);
    sender.current = undefined;
    setStatus("no session");
    let micNote = "";
    let audio: MediaStream | undefined;
    try { audio = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { micNote = "microphone unavailable"; }
    local.current = audio;
    const r = await fetch("/api/sessions", { method: "POST" }).catch(() => undefined);
    if (!r || !r.ok) { audio?.getTracks().forEach((t) => t.stop()); return setStatus("connection lost"); }
    const s: AgentSession = await r.json();
    setSession(s);
    setStatus(micNote ? `waiting for customer (${micNote})` : "waiting for customer");

    let ice: RTCIceServer[] = [];
    const connect = () => {
      peer.current?.close();
      const p = new Peer({
        role: "agent", iceServers: ice, signal: sig.current!,
        onTrack: setStream,
        onControl: (ch) => {
          const cs = new ControlSender(ch);
          sender.current = cs;
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
        if (nextAction("peer-left", { hasPeer: !!peer.current }) === "disconnect") { peer.current?.close(); peer.current = undefined; }
        setStatus("customer reconnecting");
      },
      onSignal: (m) => {
        if (m.type === "offer" && nextAction("offer", { hasPeer: !!peer.current }) === "connect") connect();
        peer.current?.handleSignal(m).catch(() => {});
      },
      onEnded: () => setStatus("ended"),
      onStatus: (st) => {
        if (st === "reconnecting") setStatus("reconnecting");
        else if (st === "lost") setStatus("connection lost");
      },
      onError: (msg) => setStatus(`connection lost: ${msg}`),
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
    if (session) await fetch(`/api/sessions/${session.code}/end`, { method: "POST" }).catch(() => {});
    stop.current();
    setStream(undefined);
    setStatus("ended");
  };

  return {
    session, status, stream, muted, newSession, toggleMute, end,
    sender: sender.current,
    view: sender.current?.local() ?? { shapes: [], transients: [] },
  };
}
