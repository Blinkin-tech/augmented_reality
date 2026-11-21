import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AnalysisOutputSchema, type AnalysisResult, type VisionProvider } from "./provider";

const SYSTEM_PROMPT =
  "You identify consumer network and home devices in support photos. Name the brand and model if visible. List ports, buttons, LEDs, and displays with tight bounding boxes as fractions of image width and height. Use null for device when unsure. Keep notes under 200 characters.";

const INSTRUCTION = "Identify the device and its parts in this photo.";

type MessagesClient = { beta: { messages: Pick<Anthropic["beta"]["messages"], "create"> } };

export class ClaudeVisionProvider implements VisionProvider {
  name = "claude";

  constructor(
    private client: MessagesClient,
    private model = "claude-opus-5-5",
  ) {}

  async analyze(image: Buffer, mime: "image/jpeg"): Promise<AnalysisResult> {
    let response;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 4096,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        output_config: { format: zodOutputFormat(AnalysisOutputSchema) },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mime, data: image.toString("base64") } },
              { type: "text", text: INSTRUCTION },
            ],
          },
        ],
      });
    } catch {
      throw new Error("vision provider error");
    }

    if (response.stop_reason === "refusal") throw new Error("analysis refused");
    const block = response.content.find((b) => b.type === "text");
    try {
      if (!block || block.type !== "text") throw new Error("no text");
      return { ...AnalysisOutputSchema.parse(JSON.parse(block.text)), provider: this.name };
    } catch {
      throw new Error("invalid analysis output");
    }
  }
}
