import type { SignalClient } from "./signalClient";

export interface PeerOptions {
  role: "agent" | "customer";
  iceServers: RTCIceServer[];
  signal: SignalClient;
  onTrack(stream: MediaStream): void;
  onControl(channel: RTCDataChannel): void;
  onState(s: RTCPeerConnectionState): void;
}

export class Peer {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private pending: RTCIceCandidateInit[] = [];
  private closed = false;

  constructor(private o: PeerOptions) {
    const pc = (this.pc = new RTCPeerConnection({ iceServers: o.iceServers }));
    pc.onicecandidate = (ev) => {
      if (ev.candidate) o.signal.send({ type: "ice", candidate: ev.candidate.toJSON() });
    };
    pc.ontrack = (ev) => { if (ev.streams[0]) o.onTrack(ev.streams[0]); };
    pc.onconnectionstatechange = () => o.onState(pc.connectionState);
    pc.ondatachannel = (ev) => {
      ev.channel.binaryType = "arraybuffer";
      this.channel = ev.channel;
      o.onControl(ev.channel);
    };
  }

  async start(local?: MediaStream): Promise<void> {
    const { pc, o } = this;
    if (o.role === "agent") {
      local?.getAudioTracks().forEach((t) => pc.addTrack(t, local));
      pc.addTransceiver("video", { direction: "recvonly" });
      return;
    }
    local?.getTracks().forEach((t) => pc.addTrack(t, local));
    const ch = pc.createDataChannel("control", { ordered: true });
    ch.binaryType = "arraybuffer";
    this.channel = ch;
    o.onControl(ch);
    await pc.setLocalDescription(await pc.createOffer());
    o.signal.send({ type: "offer", sdp: pc.localDescription!.sdp });
  }

  async handleSignal(m: { type: string; [k: string]: unknown }): Promise<void> {
    const { pc, o } = this;
    if (m.type === "offer" && o.role === "agent") {
      await pc.setRemoteDescription({ type: "offer", sdp: m.sdp as string });
      await this.flush();
      await pc.setLocalDescription(await pc.createAnswer());
      o.signal.send({ type: "answer", sdp: pc.localDescription!.sdp });
    } else if (m.type === "answer" && o.role === "customer") {
      await pc.setRemoteDescription({ type: "answer", sdp: m.sdp as string });
      await this.flush();
    } else if (m.type === "ice") {
      const c = m.candidate as RTCIceCandidateInit;
      if (!pc.remoteDescription) this.pending.push(c);
      else await this.add(c);
    }
  }

  private async add(c: RTCIceCandidateInit): Promise<void> {
    try { await this.pc.addIceCandidate(c); } catch { /* stale or invalid candidate */ }
  }

  private async flush(): Promise<void> {
    const q = this.pending;
    this.pending = [];
    for (const c of q) await this.add(c);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.channel?.close();
    this.pc.close();
  }
}
