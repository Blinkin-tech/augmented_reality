export const CHUNK_SIZE = 16384;
const HEADER = 4;
const PAYLOAD = CHUNK_SIZE - HEADER;

/** Split bytes into chunks of at most CHUNK_SIZE, each prefixed with a big-endian uint32 index. */
export function splitFrame(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  const n = Math.max(1, Math.ceil(bytes.length / PAYLOAD));
  for (let i = 0; i < n; i++) {
    const part = bytes.subarray(i * PAYLOAD, (i + 1) * PAYLOAD);
    const chunk = new Uint8Array(HEADER + part.length);
    new DataView(chunk.buffer).setUint32(0, i);
    chunk.set(part, HEADER);
    out.push(chunk);
  }
  return out;
}

export class FrameAssembler {
  private parts = new Map<number, Uint8Array>();

  constructor(private expectedBytes: number, private expectedChunks: number) {}

  add(chunk: ArrayBuffer): void {
    if (chunk.byteLength < HEADER) return;
    const index = new DataView(chunk).getUint32(0);
    this.parts.set(index, new Uint8Array(chunk, HEADER));
  }

  done(): boolean {
    return this.parts.size === this.expectedChunks;
  }

  result(): Uint8Array | undefined {
    const out = new Uint8Array(this.expectedBytes);
    let total = 0;
    for (let i = 0; i < this.expectedChunks; i++) {
      const p = this.parts.get(i);
      if (!p) return undefined;
      total += p.length;
      if (total > this.expectedBytes) return undefined;
      out.set(p, total - p.length);
    }
    return total === this.expectedBytes ? out : undefined;
  }
}
