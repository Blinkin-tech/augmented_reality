import express from "express";
import type { Config } from "../config";

export function iceRouter(deps: { config: Config }): express.Router {
  const router = express.Router();

  router.get("/", (_req, res) => {
    const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [
      { urls: "stun:stun.l.google.com:19302" },
    ];
    const { turn } = deps.config;
    if (turn) iceServers.push({ urls: turn.url, username: turn.username, credential: turn.credential });
    res.json({ iceServers });
  });

  return router;
}
