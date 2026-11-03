import { useCallback, useEffect, useRef, useState } from "react";
import { SignalClient } from "../rtc/signalClient";
import { Peer } from "../rtc/peer";
import { getSession, endSession } from "../api";
import { ControlReceiver } from "./controlReceiver";

export type Phase = "loading" | "notfound" | "ended" | "consent" | "denied" | "active";
const TURN_HINT_MS = 20000;

export type SessionEvent = "joined-peer" | "joined-alone" | "peer-joined" | "peer-left" | "ws-open";

/** Decides what to do with the Peer for a signaling event. A connected flag never blocks a rebuild. */
export function nextAction(event: SessionEvent, _state: { connected: boolean }): "connect" | "disconnect" | "none" {
  if (event === "joined-peer" || event === "peer-joined") return "connect";
  if (event === "peer-left") return "disconnect";
  return "none";
}

export function useCustomerSession(code: string) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState("waiting for agent");
  const [stream, setStream] = useState<MediaStream>();
  const [remote, setRemote] = useState<MediaStream>();
  const [muted, setMuted] = useState(false);
  const [, bump] = useState(0);
  const [slow, setSlow] = useState(false);
  const rx = useRef<ControlReceiver>();
  const sig = useRef<SignalClient>();
  const peer = useRef<Peer>();
  const conn = useRef<RTCPeerConnectionState>("new");
  const stop = useRef<() => void>(() => {});

  useEffect(() => {
    let live = true;
    getSession(code).then((r) => {
      if (!live) return;
      if (!r) return setPhase("notfound");
      setPhase(r.state === "ended" ? "ended" : "consent");
    }).catch(() => live && setPhase("notfound"));
    return () => { live = false; stop.current(); };
  }, [code]);

  useEffect(() => {
    if (phase !== "active" || status.startsWith("live") || status === "ended") { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), TURN_HINT_MS);
    return () => clearTimeout(t);
  }, [phase, status]);

  const start = useCallback(async () => {
    let media: MediaStream;
    try {
      const wanted = { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true };
      media = await navigator.mediaDevices.getUserMedia(wanted).catch((e) => {
        if (e?.name === "OverconstrainedError") return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        throw e;
      });
    } catch { return setPhase("denied"); }
    setStream(media);
    setPhase("active");
    try { await navigator.wakeLock?.request("screen"); } catch { /* optional */ }

    let ice: RTCIceServer[] = [];
    const connect = () => {
      peer.current?.close();
      conn.current = "new";
      const p = new Peer({
        role: "customer", iceServers: ice, signal: sig.current!,
        onTrack: setRemote,
        onControl: (ch) => {
          rx.current = new ControlReceiver({ send: (m) => ch.readyState === "open" && ch.send(JSON.stringify(m)), onChange: () => bump((n) => n + 1) });
          ch.onmessage = (ev) => { void rx.current?.onMessage(ev.data); };
        },
        onState: (s) => {
          conn.current = s;
          if (s === "connected") setStatus("live");
          else if (s === "connecting") setStatus("connecting");
          else if (s === "disconnected" || s === "failed") setStatus("agent reconnecting");
        },
      });
      peer.current = p;
      p.start(media).catch(() => setStatus("connection lost"));
    };
    sig.current = new SignalClient(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?role=customer&code=${code}`, {
      onJoined: (m) => {
        ice = m.iceServers ?? [];
        if (nextAction(m.peerPresent ? "joined-peer" : "joined-alone", { connected: conn.current === "connected" }) === "connect") { setStatus("connecting"); connect(); }
      },
      onPeerJoined: () => {
        if (nextAction("peer-joined", { connected: conn.current === "connected" }) === "connect") { setStatus("connecting"); connect(); }
      },
      onPeerLeft: () => {
        if (nextAction("peer-left", { connected: conn.current === "connected" }) === "disconnect") { peer.current?.close(); peer.current = undefined; conn.current = "new"; }
        setStatus("agent reconnecting");
      },
      onSignal: (m) => { peer.current?.handleSignal(m).catch(() => {}); },
      onEnded: () => { stop.current(); setRemote(undefined); setStatus("ended"); setPhase("ended"); },
      onStatus: (s) => {
        if (s === "reconnecting") setStatus("reconnecting");
        else if (s === "lost") setStatus("connection lost");
      },
    });
    stop.current = () => { sig.current?.close(); peer.current?.close(); media.getTracks().forEach((t) => t.stop()); };
  }, [code]);

  const toggleMute = () => {
    const next = !muted;
    stream?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  const end = async () => {
    await endSession(code).catch(() => {});
    stop.current();
    setPhase("ended");
  };

  const shown = slow ? `${status} (relay may be needed)` : status;
  return { phase, status: shown, stream, remote, muted, start, toggleMute, end, view: rx.current?.state() ?? { frozen: null, shapes: [], transients: [] }, state: () => rx.current?.state() ?? { frozen: null, shapes: [], transients: [] } };
}
