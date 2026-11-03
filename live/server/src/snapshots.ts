import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Session, Snapshot } from "./sessions";

export class SnapshotStore {
  constructor(private readonly dataDir: string) {}

  async save(session: Session, jpeg: Buffer): Promise<Snapshot> {
    const id = crypto.randomBytes(4).toString("hex");
    const dir = path.join(this.dataDir, session.code);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, `${id}.jpg`), jpeg);
    const snapshot: Snapshot = { id, file: `${id}.jpg`, takenAt: Date.now() };
    session.snapshots.push(snapshot);
    return snapshot;
  }

  async read(session: Session, id: string): Promise<Buffer | undefined> {
    const snapshot = session.snapshots.find((s) => s.id === id);
    if (!snapshot) return undefined;
    try {
      return await fs.promises.readFile(path.join(this.dataDir, session.code, snapshot.file));
    } catch {
      return undefined;
    }
  }

  list(session: Session): Snapshot[] {
    return session.snapshots;
  }
}
