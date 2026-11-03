import http from "node:http";
import { createApp } from "./app";
import { loadConfig, type Config } from "./config";
import { SessionStore } from "./sessions";
import { SnapshotStore } from "./snapshots";

const SESSION_TTL_MS = 60 * 60 * 1000;
const EXPIRE_INTERVAL_MS = 60 * 1000;

export async function startServer(
  config: Config,
): Promise<{ server: http.Server; store: SessionStore; close(): Promise<void> }> {
  const store = new SessionStore({ ttlMs: SESSION_TTL_MS });
  const app = createApp({ store, config, snapshots: new SnapshotStore(config.dataDir) });
  const server = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const timer = setInterval(() => store.expire(), EXPIRE_INTERVAL_MS);
  timer.unref();

  return {
    server,
    store,
    close: () =>
      new Promise<void>((resolve, reject) => {
        clearInterval(timer);
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
      }),
  };
}

if (require.main === module) {
  const config = loadConfig(process.env);
  startServer(config).then(({ server }) => {
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : config.port;
    console.log(`live server listening on port ${port}`);
  });
}
