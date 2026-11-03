import { z } from "zod";
import type { Config } from "../config";
import { MockVisionProvider } from "./mock";

export const PartSchema = z.object({
  label: z.string(),
  kind: z.enum(["port", "button", "led", "display", "other"]),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  confidence: z.number(),
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

export function selectProvider(_config: Config): VisionProvider {
  return new MockVisionProvider();
}
