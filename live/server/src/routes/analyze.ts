import express from "express";
import type { SessionStore } from "../sessions";
import type { SnapshotStore } from "../snapshots";
import type { VisionProvider } from "../vision/provider";

export function analyzeRouter(deps: {
  store: SessionStore;
  snapshots: SnapshotStore;
  vision: VisionProvider;
}): express.Router {
  const { store, snapshots, vision } = deps;
  const router = express.Router();

  router.post("/:code/analyze", async (req, res, next) => {
    try {
      const session = store.get(req.params.code);
      const snapshotId = (req.body as { snapshotId?: unknown } | undefined)?.snapshotId;
      const bytes =
        session && typeof snapshotId === "string" ? await snapshots.read(session, snapshotId) : undefined;
      if (!bytes) {
        res.status(404).json({ error: "not found" });
        return;
      }
      try {
        res.json(await vision.analyze(bytes, "image/jpeg"));
      } catch (err) {
        res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
