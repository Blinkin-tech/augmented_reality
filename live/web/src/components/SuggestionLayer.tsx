import type { AnalysisResult, Part } from "../api";

export function SuggestionLayer({ result, onSend }: { result: AnalysisResult; onSend(part: Part): void }) {
  const d = result.device;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {result.parts.map((p, i) => (
          <div key={i} style={{
            position: "absolute", border: "2px dashed #ffcc00", boxSizing: "border-box",
            left: `${p.box[0] * 100}%`, top: `${p.box[1] * 100}%`, width: `${p.box[2] * 100}%`, height: `${p.box[3] * 100}%`,
          }}>
            <span style={{ background: "#000a", color: "#ffcc00", fontSize: 12, padding: "0 4px" }}>{p.label}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "#000c", color: "#fff", padding: 8 }}>
        <strong>{d ? `${d.brand} ${d.model} (${Math.round(d.confidence * 100)}%)` : "Device not identified"}</strong>
        <div>{result.notes}</div>
        {result.parts.map((p, i) => (
          <div key={i} data-testid="suggestion-part" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ flex: 1 }}>{p.label}</span>
            <button onClick={() => onSend(p)}>Send</button>
          </div>
        ))}
      </div>
    </>
  );
}
