export type ClientSignal =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: unknown };

export function parseClientSignal(raw: string): ClientSignal | undefined {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof data !== "object" || data === null) return undefined;
  const msg = data as Record<string, unknown>;
  if ((msg.type === "offer" || msg.type === "answer") && typeof msg.sdp === "string") {
    return { type: msg.type, sdp: msg.sdp };
  }
  if (msg.type === "ice" && "candidate" in msg) {
    return { type: "ice", candidate: msg.candidate };
  }
  return undefined;
}
