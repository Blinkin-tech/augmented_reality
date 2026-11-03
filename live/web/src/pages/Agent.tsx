import { useState } from "react";
import { VideoOverlay } from "../components/VideoOverlay";
import { SessionPanel } from "../components/SessionPanel";
import { Toolbar, type Tool } from "../components/Toolbar";
import { useAgentSession } from "../agent/useAgentSession";

const noop = () => {};

export function Agent() {
  const a = useAgentSession();
  const [tool, setTool] = useState<Tool>("pointer");
  const [color, setColor] = useState("#ffcc00");
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const overlayTool = tool === "pen" ? "draw" : tool;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <SessionPanel session={a.session} onNew={a.newSession} />
      <div role="status" data-testid="status" style={{ padding: "0 12px" }}>{a.status}</div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div data-testid="video-overlay" style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <VideoOverlay stream={a.stream} shapes={a.view.shapes} transients={a.view.transients} tool={overlayTool}
              frameSize={frame} onFrameSize={setFrame} muted={false}
              onPointer={(x, y) => a.sender?.pointer(x, y)}
              onDrag={(f, t) => a.sender?.arrow(f[0], f[1], t[0], t[1], color)} />
          </div>
          <Toolbar tool={tool} onTool={setTool} color={color} onColor={setColor} frozen={false}
            onFreeze={noop} onResume={noop} onClear={noop} onSnapshot={noop} onAnalyze={noop}
            muted={a.muted} onMute={a.toggleMute} onEnd={a.end} />
        </main>
        <aside style={{ width: 240 }} aria-label="Gallery" />
      </div>
    </div>
  );
}
