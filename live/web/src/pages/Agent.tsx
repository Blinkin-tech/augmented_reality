import { useEffect, useState } from "react";
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
  const t = a.tools;
  const overlayTool = tool === "pen" ? "draw" : tool === "text" ? "pointer" : tool;
  const resume = t.resume;
  useEffect(() => { if (!t.frozen) setTool((x) => (x === "pen" || x === "rect" || x === "text" ? "pointer" : x)); }, [t.frozen]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <SessionPanel session={a.session} onNew={a.newSession} />
      <div role="status" data-testid="status" style={{ padding: "0 12px" }}>{a.status}{a.note && <span> ({a.note})</span>}</div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div data-testid="video-overlay" style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <VideoOverlay stream={a.stream} shapes={a.view.shapes} transients={a.view.transients} tool={overlayTool}
              frameSize={frame} onFrameSize={setFrame} muted={false}
              frozen={t.frozen} onVideoEl={t.setVideoEl}
              onPointer={tool === "text" ? t.openText : a.pointer}
              onDrag={(f, to) => a.arrow(f, to, color)}
              onDraw={(pts) => (tool === "rect" ? t.rect(pts, color) : t.pen(pts, color))} />
            {t.textPrompt && (
              <input autoFocus aria-label="Text" data-testid="text-input"
                style={{ position: "absolute", left: `${t.textPrompt.x * 100}%`, top: `${t.textPrompt.y * 100}%`, zIndex: 2 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") t.submitText(e.currentTarget.value, color);
                  else if (e.key === "Escape") t.cancelText();
                }} />
            )}
          </div>
          <Toolbar tool={tool} onTool={setTool} color={color} onColor={setColor} frozen={!!t.frozen}
            onFreeze={t.freeze} onResume={resume} onClear={t.clear} onSnapshot={noop} onAnalyze={noop}
            muted={a.muted} onMute={a.toggleMute} onEnd={a.end} />
        </main>
        <aside style={{ width: 240 }} aria-label="Gallery" />
      </div>
    </div>
  );
}
