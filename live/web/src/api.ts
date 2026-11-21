export interface Part { label: string; kind: "port" | "button" | "led" | "display" | "other"; box: [number, number, number, number]; confidence: number }
export interface AnalysisResult {
  provider: string;
  device: { brand: string; model: string; confidence: number } | null;
  parts: Part[];
  notes: string;
}
export interface SnapshotItem { id: string; url: string; takenAt: number }
type F = typeof fetch;

async function fail(r: Response): Promise<never> {
  const body = await r.json().catch(() => ({}));
  throw new Error(body?.error ?? `HTTP ${r.status}`);
}

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) return fail(r);
  return r.json();
}

export const createSession = (f: F = globalThis.fetch) =>
  f("/api/sessions", { method: "POST" }).then((r) => json<{ code: string; customerUrl: string }>(r));

export async function getSession(code: string, f: F = globalThis.fetch): Promise<{ state: string } | undefined> {
  const r = await f(`/api/sessions/${code}`);
  if (r.status === 404) return undefined;
  return json(r);
}

export async function endSession(code: string, f: F = globalThis.fetch): Promise<void> {
  const r = await f(`/api/sessions/${code}/end`, { method: "POST" });
  if (!r.ok) await fail(r);
}

export const uploadSnapshot = (code: string, bytes: Uint8Array, f: F = globalThis.fetch) =>
  f(`/api/sessions/${code}/snapshots`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: bytes as BodyInit })
    .then((r) => json<SnapshotItem>(r));

export const listSnapshots = (code: string, f: F = globalThis.fetch) =>
  f(`/api/sessions/${code}/snapshots`).then((r) => json<SnapshotItem[]>(r));

export const analyzeSnapshot = (code: string, snapshotId: string, f: F = globalThis.fetch) =>
  f(`/api/sessions/${code}/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshotId }) })
    .then((r) => json<AnalysisResult>(r));

export const getIce = (f: F = globalThis.fetch) =>
  f("/api/ice").then((r) => json<{ iceServers: RTCIceServer[] }>(r));
