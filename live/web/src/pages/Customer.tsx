import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { VideoOverlay } from "../components/VideoOverlay";
import { installDebugHook } from "../debugHook";
import { useCustomerSession } from "../customer/useCustomerSession";

const CAMERA_TEXT = "Camera access was refused. Open this link over HTTPS, allow the camera in the browser settings, and try Chrome or Safari.";
const CONSENT_TEXT = "The support agent will see your camera and hear your microphone. Nothing is recorded unless the agent takes a snapshot.";

export function Customer() {
  const { code = "" } = useParams();
  const s = useCustomerSession(code);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const { state } = s;
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => { installDebugHook({ state }); });
  // The agent's voice. The Start camera tap is the user gesture that lets it autoplay.
  useEffect(() => { if (audio.current) audio.current.srcObject = s.remote ?? null; }, [s.remote, s.phase]);

  if (s.phase === "loading") return <div className="center">Loading</div>;
  if (s.phase === "notfound") return <div className="center">Session not found</div>;
  if (s.phase === "ended") return <div className="center">Session ended</div>;
  if (s.phase === "denied") return <div className="center"><p>{CAMERA_TEXT}</p></div>;
  if (s.phase === "consent") {
    return (
      <div className="center">
        <p>{CONSENT_TEXT}</p>
        <button data-testid="start-camera" onClick={s.start}>Start camera</button>
      </div>
    );
  }
  return (
    <div className="fullscreen">
      <audio ref={audio} autoPlay playsInline />
      <VideoOverlay stream={s.stream} frozen={s.view.frozen} shapes={s.view.shapes} transients={s.view.transients} frameSize={frame} onFrameSize={setFrame} muted />
      <div className="bar">
        <span role="status">{s.status}</span>
        {s.lost && <button onClick={() => location.reload()}>Reload</button>}
        <button onClick={s.toggleMute}>{s.muted ? "Unmute" : "Mute"}</button>
        <button onClick={s.end}>End</button>
      </div>
    </div>
  );
}
