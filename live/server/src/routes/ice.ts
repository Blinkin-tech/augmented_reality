import express from "express";
import type { Config } from "../config";

export interface RTCIceServerLike {
  urls: string;
  username?: string;
  credential?: string;
}

export function buildIceServers(config: Config): RTCIceServerLike[] {
  const iceServers: RTCIceServerLike[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const { turn } = config;
  if (turn) iceServers.push({ urls: turn.url, username: turn.username, credential: turn.credential });
  return iceServers;
}

export function iceRouter(deps: { config: Config }): express.Router {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.json({ iceServers: buildIceServers(deps.config) });
  });

  return router;
}
