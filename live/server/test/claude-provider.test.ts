import { describe, it, expect } from "vitest";
import { ClaudeVisionProvider } from "../src/vision/claude";

const fake = (reply: object) => ({ beta: { messages: { create: async (req: any) => { (fake as any).last = req; return reply; } } } });
const good = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ device: { brand: "D-Link", model: "DSL-6850U", confidence: 0.8 }, parts: [{ label: "WAN port", kind: "port", box: [0.1, 0.2, 0.05, 0.05], confidence: 0.7 }], notes: "ok" }) }] };

describe("ClaudeVisionProvider", () => {
  it("sends the image and returns the parsed result", async () => {
    const p = new ClaudeVisionProvider(fake(good) as any);
    const r = await p.analyze(Buffer.from("abc"), "image/jpeg");
    expect(r.provider).toBe("claude"); expect(r.device?.model).toBe("DSL-6850U"); expect(r.parts[0].kind).toBe("port");
    const req = (fake as any).last;
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: Buffer.from("abc").toString("base64") } });
  });
  it("throws on refusal and on bad output", async () => {
    await expect(new ClaudeVisionProvider(fake({ stop_reason: "refusal", content: [] }) as any).analyze(Buffer.alloc(1), "image/jpeg")).rejects.toThrow("analysis refused");
    await expect(new ClaudeVisionProvider(fake({ stop_reason: "end_turn", content: [{ type: "text", text: "{}" }] }) as any).analyze(Buffer.alloc(1), "image/jpeg")).rejects.toThrow("invalid analysis output");
  });
  it("hides SDK error detail", async () => {
    const boom = { beta: { messages: { create: async () => { throw new Error("secret key sk-123"); } } } };
    await expect(new ClaudeVisionProvider(boom as any).analyze(Buffer.alloc(1), "image/jpeg")).rejects.toThrow(/^vision provider error$/);
  });
});
