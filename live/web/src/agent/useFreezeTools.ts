import { useCallback, useRef, useState } from "react";
import type { Shape } from "../protocol/messages";
import type { ControlSender } from "./controlSender";
import { captureJpeg } from "./captureFrame";

export interface Frozen { image: ImageBitmap; w: number; h: number }
type Pt = [number, number];

/** Freeze frame, drawing shapes, clear and resume for the agent console. */
export function useFreezeTools(
  sender: { current: ControlSender | undefined },
  ui: { bump(): void; setStatus(s: string): void; setNote(s: string): void },
) {
  const [frozen, setFrozen] = useState<Frozen | null>(null);
  const [textPrompt, setTextPrompt] = useState<{ x: number; y: number } | null>(null);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const pending = useRef<string>();
  const uiRef = useRef(ui);
  uiRef.current = ui;

  const setVideoEl = useCallback((el: HTMLVideoElement | null) => { videoEl.current = el; }, []);

  const onAck = useCallback((ack: { frameId: string; ok: boolean }) => {
    if (ack.frameId !== pending.current) return;
    pending.current = undefined;
    if (ack.ok) uiRef.current.setStatus("live");
    else {
      setFrozen(null);
      uiRef.current.setNote("freeze failed, try again");
      uiRef.current.setStatus("live");
    }
  }, []);

  const freeze = useCallback(async () => {
    const v = videoEl.current;
    const s = sender.current;
    if (!v || !s) return;
    try {
      const { bytes, w, h } = await captureJpeg(v);
      const image = await createImageBitmap(new Blob([bytes as BlobPart], { type: "image/jpeg" }));
      setFrozen({ image, w, h });
      uiRef.current.setStatus("sending frame");
      pending.current = s.freeze(bytes, w, h);
    } catch {
      uiRef.current.setNote("freeze failed, try again");
    }
  }, [sender]);

  const resume = useCallback(() => {
    sender.current?.resume();
    pending.current = undefined;
    setFrozen(null);
    setTextPrompt(null);
    uiRef.current.setStatus("live");
    uiRef.current.bump();
  }, [sender]);

  const clear = useCallback(() => { sender.current?.clear(); uiRef.current.bump(); }, [sender]);

  const addShape = useCallback((kind: Shape["kind"], points: Pt[], color: string, text?: string) => {
    const s: Shape = { t: "shape", id: crypto.randomUUID(), kind, points, color, ...(text !== undefined ? { text } : {}) };
    sender.current?.shape(s);
    uiRef.current.bump();
  }, [sender]);

  const pen = useCallback((pts: Pt[], color: string) => addShape("path", pts, color), [addShape]);
  const rect = useCallback((pts: Pt[], color: string) => addShape("rect", pts.slice(0, 2), color), [addShape]);
  const openText = useCallback((x: number, y: number) => setTextPrompt({ x, y }), []);
  const submitText = useCallback((text: string, color: string) => {
    if (textPrompt && text.trim()) addShape("text", [[textPrompt.x, textPrompt.y]], color, text);
    setTextPrompt(null);
  }, [textPrompt, addShape]);
  const cancelText = useCallback(() => setTextPrompt(null), []);

  return { frozen, textPrompt, setVideoEl, onAck, freeze, resume, clear, pen, rect, openText, submitText, cancelText };
}
