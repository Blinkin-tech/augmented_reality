export function targetSize(w: number, h: number, maxLong = 1280): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= maxLong) return { w: Math.round(w), h: Math.round(h) };
  const k = maxLong / long;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export async function captureJpeg(video: HTMLVideoElement, quality = 0.7): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const { w, h } = targetSize(video.videoWidth, video.videoHeight);
  if (w === 0 || h === 0) throw new Error("video has no frame");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!blob) throw new Error("jpeg encode failed");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}
