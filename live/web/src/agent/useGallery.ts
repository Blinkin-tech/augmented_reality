import { useCallback, useRef, useState } from "react";
import { analyzeSnapshot, uploadSnapshot, type AnalysisResult, type Part, type SnapshotItem } from "../api";
import { captureJpeg } from "./captureFrame";
import type { useFreezeTools } from "./useFreezeTools";

type Tools = ReturnType<typeof useFreezeTools>;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Snapshot gallery, analyze and "send part" flow for the agent console. */
export function useGallery(
  code: string | undefined,
  videoEl: { current: HTMLVideoElement | null },
  tools: Tools,
  setNote: (s: string) => void,
) {
  const [items, setItems] = useState<SnapshotItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult>();
  const gen = useRef(0); // ignores analyze results from a superseded selection or session
  const toolsRef = useRef(tools);
  toolsRef.current = tools;

  const reset = useCallback(() => {
    gen.current++;
    setItems([]); setSelectedId(undefined); setResult(undefined); setAnalyzing(false);
  }, []);

  const select = useCallback((id: string) => {
    gen.current++;
    setSelectedId(id); setResult(undefined); setAnalyzing(false);
  }, []);

  const snapshot = useCallback(async () => {
    const v = videoEl.current;
    if (!code || !v || !v.videoWidth) { setNote("no video frame"); return; }
    try {
      const { bytes } = await captureJpeg(v);
      const item = await uploadSnapshot(code, bytes);
      setItems((xs) => [item, ...xs]);
    } catch (e) {
      setNote(`snapshot failed: ${msg(e)}`);
    }
  }, [code, videoEl, setNote]);

  const analyze = useCallback(async () => {
    if (!code || !selectedId) return;
    const g = ++gen.current;
    setAnalyzing(true); setResult(undefined);
    try {
      const r = await analyzeSnapshot(code, selectedId);
      if (g === gen.current) setResult(r);
    } catch (e) {
      if (g === gen.current) setNote(`analysis failed: ${msg(e)}`);
    } finally {
      if (g === gen.current) setAnalyzing(false);
    }
  }, [code, selectedId, setNote]);

  const sendPart = useCallback(async (part: Part, color: string) => {
    const item = items.find((i) => i.id === selectedId);
    const t = toolsRef.current;
    try {
      if (!t.frozen) {
        if (!item) return;
        const blob = await (await fetch(item.url)).blob();
        const bmp = await createImageBitmap(blob);
        const { width, height } = bmp;
        bmp.close();
        await t.freezeBytes(new Uint8Array(await blob.arrayBuffer()), width, height);
      }
      const [x, y, w, h] = part.box;
      t.rect([[x, y], [x + w, y + h]], color);
      t.text([x, y], part.label, color);
    } catch (e) {
      setNote(`send failed: ${msg(e)}`);
    }
  }, [items, selectedId, setNote]);

  return { items, selectedId, analyzing, result, reset, select, snapshot, analyze, sendPart };
}
