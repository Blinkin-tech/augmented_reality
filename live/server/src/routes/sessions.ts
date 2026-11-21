import express from "express";
import type { Config } from "../config";
import type { SessionStore } from "../sessions";

export function sessionsRouter(deps: { store: SessionStore; config: Config }): express.Router {
  const { store, config } = deps;
  const router = express.Router();

  router.post("/", (req, res) => {
    const session = store.create();
    const origin = config.publicUrl
      ? config.publicUrl.replace(/\/+$/, "")
      : `${req.protocol}://${req.get("host")}`;
    res.status(201).json({ code: session.code, customerUrl: `${origin}/s/${session.code}` });
  });

  router.get("/:code", (req, res) => {
    const session = store.get(req.params.code);
    if (!session) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json({ code: session.code, state: session.state, createdAt: session.createdAt });
  });

  router.post("/:code/end", (req, res) => {
    if (!store.end(req.params.code)) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
