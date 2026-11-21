import path from "node:path";

export interface Config {
  port: number;
  publicUrl?: string;
  dataDir: string;
  turn?: { url: string; username: string; credential: string };
  anthropicApiKey?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const { PORT, PUBLIC_URL, DATA_DIR, TURN_URL, TURN_USER, TURN_PASS, ANTHROPIC_API_KEY } = env;
  const turn =
    TURN_URL && TURN_USER && TURN_PASS
      ? { url: TURN_URL, username: TURN_USER, credential: TURN_PASS }
      : undefined;
  return {
    port: PORT ? Number(PORT) : 3000,
    publicUrl: PUBLIC_URL || undefined,
    dataDir: DATA_DIR || path.resolve(__dirname, "..", "..", "data"),
    turn,
    anthropicApiKey: ANTHROPIC_API_KEY || undefined,
  };
}
