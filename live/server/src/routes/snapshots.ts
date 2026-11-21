import express from "express";
import type { SessionStore } from "../sessions";
import type { SnapshotStore } from "../snapshots";

export function snapshotsRouter(deps: { store: SessionStore; snapshots: SnapshotStore }): express.Router {
  const { store, snapshots } = deps;
  const router = express.Router();
  const rawJpeg = express.raw({ type: "image/jpeg", limit: "5mb" });

  const describe = (code: string, s: { id: string; takenAt: number }) => ({
    id: s.id,
    url: `/api/sessions/${code}/snapshots/${s.id}`,
    takenAt: s.takenAt,
  });

  router.post(
    "/:code/snapshots",
    (req, res, next) => {
      if (!req.is("image/jpeg")) {
        res.status(415).json({ error: "expected image/jpeg" });
        return;
      }
      next();
    },
    rawJpeg,
    async (req, res, next) => {
      try {
        const session = store.get(req.params.code);
        if (!session) {
          res.status(404).json({ error: "not found" });
          return;
        }
        const snapshot = await snapshots.save(session, req.body as Buffer);
        res.status(201).json(describe(session.code, snapshot));
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/:code/snapshots", (req, res) => {
    const session = store.get(req.params.code);
    if (!session) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(snapshots.list(session).map((s) => describe(session.code, s)));
  });

  router.get("/:code/snapshots/:id", async (req, res, next) => {
    try {
      const session = store.get(req.params.code);
      const bytes = session && (await snapshots.read(session, req.params.id));
      if (!bytes) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.type("image/jpeg").send(bytes);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
