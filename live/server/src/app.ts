import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config";
import type { SessionStore } from "./sessions";
import { sessionsRouter } from "./routes/sessions";
import { iceRouter } from "./routes/ice";
import { snapshotsRouter } from "./routes/snapshots";
import type { SnapshotStore } from "./snapshots";

export interface AppDeps {
  store: SessionStore;
  config: Config;
  snapshots: SnapshotStore;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.set("trust proxy", true);

  const api = express.Router();
  api.use(express.json());
  api.use("/sessions", sessionsRouter(deps));
  api.use("/sessions", snapshotsRouter(deps));
  api.use("/ice", iceRouter(deps));
  app.use("/api", api);

  const webDist = path.resolve(__dirname, "..", "..", "web", "dist");
  if (process.env.NODE_ENV !== "development" && fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/ws")) {
        next();
        return;
      }
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  return app;
}
