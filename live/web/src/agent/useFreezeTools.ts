import { useCallback, useEffect, useRef, useState } from "react";
import type { Shape } from "../protocol/messages";
import type { ControlSender } from "./controlSender";
import { captureJpeg } from "./captureFrame";

export interface Frozen { image: ImageBitmap; w: number; h: number }
type Pt = [number, number];

function releaseFrozen(prev: Frozen | null): void {
  (prev?.image as { close?: () => void } | undefined)?.close?.();
}

/** Freeze frame, drawing shapes, clear and resume for the agent console. */
export function useFreezeTools(
  sender: { current: ControlSender | undefined },
  ui: { bump(): void; setStatus(s: string): void; setNote(s: string): void },
  videoEl: { current: HTMLVideoElement | null },
) {
  const [frozen, setFrozen] = useState<Frozen | null>(null);
  const [textPrompt, setTextPrompt] = useState<{ x: number; y: number } | null>(null);
  const pending = useRef<string>();
  const frozenRef = useRef<Frozen | null>(null);
  const busy = useRef(false);
  const uiRef = useRef(ui);
  uiRef.current = ui;

  const replaceFrozen = useCallback((next: Frozen | null) => {
    releaseFrozen(frozenRef.current);
    frozenRef.current = next;
    setFrozen(next);
  }, []);

  useEffect(() => () => { releaseFrozen(frozenRef.current); frozenRef.current = null; }, []);

  const setVideoEl = useCallback((el: HTMLVideoElement | null) => { videoEl.current = el; }, [videoEl]);

  const onAck = useCallback((ack: { frameId: string; ok: boolean }) => {
    if (ack.frameId !== pending.current) return;
    pending.current = undefined;
    if (ack.ok) uiRef.current.setStatus("live");
    else {
      replaceFrozen(null);
      uiRef.current.setNote("freeze failed, try again");
      uiRef.current.setStatus("live");
    }
  }, [replaceFrozen]);

  /** Freezes the customer on the given JPEG bytes. Throws when nothing was sent. */
  const freezeBytes = useCallback(async (bytes: Uint8Array, w: number, h: number) => {
    const s = sender.current;
    if (!s || !s.isOpen()) throw new Error("customer not connected");
    const image = await createImageBitmap(new Blob([bytes as BlobPart], { type: "image/jpeg" }));
    const id = s.freeze(bytes, w, h);
    if (id === undefined) { image.close(); throw new Error("not sent"); }
    replaceFrozen({ image, w, h });
    pending.current = id;
    uiRef.current.setStatus("sending frame");
  }, [sender, replaceFrozen]);

  const freeze = useCallback(async () => {
    const v = videoEl.current;
    const s = sender.current;
    if (busy.current) return;
    if (!v || !s || !s.isOpen()) { uiRef.current.setNote("customer not connected"); return; }
    busy.current = true;
    try {
      const { bytes, w, h } = await captureJpeg(v);
      await freezeBytes(bytes, w, h);
    } catch {
      uiRef.current.setNote("freeze failed, try again");
    } finally {
      busy.current = false;
    }
  }, [sender, videoEl, freezeBytes]);

  /** Drops frozen state, e.g. when the customer's channel goes away. */
  const reset = useCallback(() => {
    pending.current = undefined;
    replaceFrozen(null);
    setTextPrompt(null);
  }, [replaceFrozen]);

  const resume = useCallback(() => {
    sender.current?.resume();
    reset();
    uiRef.current.setStatus("live");
    uiRef.current.bump();
  }, [sender, reset]);

  const clear = useCallback(() => { sender.current?.clear(); uiRef.current.bump(); }, [sender]);

  const addShape = useCallback((kind: Shape["kind"], points: Pt[], color: string, text?: string) => {
    const s: Shape = { t: "shape", id: crypto.randomUUID(), kind, points, color, ...(text !== undefined ? { text } : {}) };
    sender.current?.shape(s);
    uiRef.current.bump();
  }, [sender]);

  const pen = useCallback((pts: Pt[], color: string) => addShape("path", pts, color), [addShape]);
  const rect = useCallback((pts: Pt[], color: string) => addShape("rect", pts.slice(0, 2), color), [addShape]);
  const openText = useCallback((x: number, y: number) => setTextPrompt({ x, y }), []);
  const text = useCallback((pt: Pt, label: string, color: string) => addShape("text", [pt], color, label), [addShape]);
  const submitText = useCallback((label: string, color: string) => {
    if (textPrompt && label.trim()) text([textPrompt.x, textPrompt.y], label, color);
    setTextPrompt(null);
  }, [textPrompt, text]);
  const cancelText = useCallback(() => setTextPrompt(null), []);

  return { frozen, textPrompt, reset, setVideoEl, onAck, freeze, freezeBytes, resume, clear, pen, rect, text, openText, submitText, cancelText };
}
