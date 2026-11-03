export type Tool = "pointer" | "arrow" | "pen" | "rect" | "text";
const TOOLS: Tool[] = ["pointer", "arrow", "pen", "rect", "text"];
const NEEDS_FREEZE: Tool[] = ["pen", "rect", "text"];

export interface ToolbarProps {
  tool: Tool; onTool(t: Tool): void;
  color: string; onColor(c: string): void;
  frozen: boolean; onFreeze(): void; onResume(): void;
  onClear(): void; onSnapshot(): void; onAnalyze(): void;
  muted: boolean; onMute(): void; onEnd(): void;
}

export function Toolbar(p: ToolbarProps) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: 8 }}>
      {TOOLS.map((t) => (
        <button key={t} data-testid={`tool-${t}`} aria-pressed={p.tool === t} disabled={!p.frozen && NEEDS_FREEZE.includes(t)}
          style={p.tool === t ? { outline: "2px solid #fff" } : undefined} onClick={() => p.onTool(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
      ))}
      <input type="color" aria-label="Color" value={p.color} onChange={(e) => p.onColor(e.target.value)} />
      <button data-testid="freeze" onClick={p.frozen ? p.onResume : p.onFreeze}>{p.frozen ? "Resume" : "Freeze"}</button>
      <button onClick={p.onClear}>Clear</button>
      <button data-testid="snapshot" onClick={p.onSnapshot}>Snapshot</button>
      <button onClick={p.onAnalyze}>Analyze</button>
      <button onClick={p.onMute}>{p.muted ? "Unmute" : "Mute"}</button>
      <button onClick={p.onEnd}>End</button>
    </div>
  );
}
