import type { AnalysisResult, VisionProvider } from "./provider";

const DELAY_MS = 300;

export class MockVisionProvider implements VisionProvider {
  name = "mock";

  async analyze(_image: Buffer, _mime: "image/jpeg"): Promise<AnalysisResult> {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    return {
      provider: this.name,
      device: { brand: "Demo", model: "Router X1", confidence: 0.9 },
      parts: [
        { label: "WAN port", kind: "port", box: [0.62, 0.55, 0.06, 0.08], confidence: 0.85 },
        { label: "Power LED", kind: "led", box: [0.2, 0.3, 0.03, 0.03], confidence: 0.85 },
        { label: "Reset button", kind: "button", box: [0.8, 0.56, 0.03, 0.04], confidence: 0.85 },
      ],
      notes: "Mock result. Set ANTHROPIC_API_KEY for real analysis.",
    };
  }
}
