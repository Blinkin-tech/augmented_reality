import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import type { Config } from "../config";
import { ClaudeVisionProvider } from "./claude";
import { MockVisionProvider } from "./mock";

export const PartSchema = z.object({
  label: z.string(),
  kind: z.enum(["port", "button", "led", "display", "other"]),
  box: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]),
  confidence: z.number().min(0).max(1),
});

export const AnalysisOutputSchema = z.object({
  device: z.object({ brand: z.string(), model: z.string(), confidence: z.number() }).nullable(),
  parts: z.array(PartSchema),
  notes: z.string(),
});

export const AnalysisResultSchema = AnalysisOutputSchema.extend({ provider: z.string() });

export type Part = z.infer<typeof PartSchema>;
export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export interface VisionProvider {
  name: string;
  analyze(image: Buffer, mime: "image/jpeg"): Promise<AnalysisResult>;
}

export function selectProvider(config: Config): VisionProvider {
  if (config.anthropicApiKey) {
    return new ClaudeVisionProvider(new Anthropic({ apiKey: config.anthropicApiKey }));
  }
  return new MockVisionProvider();
}
