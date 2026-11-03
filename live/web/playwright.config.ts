import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "live-e2e-"));

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:3100" },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: {
          executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium",
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        },
      },
    },
  ],
  webServer: {
    command: "npm run build && npm start",
    cwd: "..",
    env: { PORT: "3100", DATA_DIR: dataDir },
    url: "http://localhost:3100/agent",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
