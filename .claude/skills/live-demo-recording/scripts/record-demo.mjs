// Drive the built live visual support app in two Chromium contexts and record both.
// Usage (from the repository root, with the server already running on BASE):
//   OUT=_agents_workspace/demo/2026-01-01 BASE=http://localhost:3200 node .claude/skills/live-demo-recording/scripts/record-demo.mjs
import { mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";

const ROOT = process.env.REPO_ROOT ?? process.cwd();
const BASE = process.env.BASE ?? "http://localhost:3200";
const OUT = resolve(ROOT, process.env.OUT ?? "_agents_workspace/demo/run");
const CHROMIUM = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
mkdirSync(OUT, { recursive: true });

const pwPath = resolve(ROOT, "live/node_modules/playwright/index.mjs");
if (!existsSync(pwPath)) throw new Error(`Playwright not found at ${pwPath}; run npm install in live/`);
const { chromium } = await import(pathToFileURL(pwPath).href);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  ...(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {}),
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const agentCtx = await browser.newContext({
  permissions: ["camera", "microphone"], viewport: { width: 1280, height: 800 },
  recordVideo: { dir: `${OUT}/agent`, size: { width: 1280, height: 800 } },
});
const custCtx = await browser.newContext({
  permissions: ["camera", "microphone"], viewport: { width: 400, height: 800 },
  recordVideo: { dir: `${OUT}/customer`, size: { width: 400, height: 800 } },
});
const agent = await agentCtx.newPage();
const cust = await custCtx.newPage();

try {
  await agent.goto(`${BASE}/agent?debug=1`);
  await pause(1500);
  await agent.getByTestId("new-session").click();
  await pause(2500);
  const link = (await agent.getByTestId("customer-link").textContent()).trim();
  console.log("customer link", link);
  await agent.screenshot({ path: `${OUT}/01-agent-new-session.png` });

  await cust.goto(link + "?debug=1");
  await pause(2000);
  await cust.screenshot({ path: `${OUT}/02-customer-consent.png` });
  await cust.getByTestId("start-camera").click();
  await agent.getByTestId("status").filter({ hasText: /live/ }).waitFor({ timeout: 30000 });
  await pause(2500);
  await agent.screenshot({ path: `${OUT}/03-agent-live.png` });
  await cust.screenshot({ path: `${OUT}/04-customer-live.png` });

  await agent.getByTestId("tool-pointer").click();
  const box = await agent.getByTestId("video-overlay").boundingBox();
  for (const [fx, fy] of [[0.5, 0.5], [0.35, 0.6], [0.65, 0.4]]) {
    await agent.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await pause(1500);
  }
  await cust.screenshot({ path: `${OUT}/05-customer-pointer.png` });

  await agent.getByTestId("tool-arrow").click();
  await agent.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await agent.mouse.down();
  await agent.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 15 });
  await agent.mouse.up();
  await pause(2500);

  await agent.getByTestId("freeze").click();
  await cust.waitForFunction(() => window.__live?.state().frozen !== null, null, { timeout: 15000 });
  await pause(1500);
  await agent.getByTestId("tool-rect").click();
  await agent.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.35);
  await agent.mouse.down();
  await agent.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.65, { steps: 15 });
  await agent.mouse.up();
  await pause(1500);
  await agent.getByTestId("tool-text").click();
  await agent.mouse.click(box.x + box.width * 0.32, box.y + box.height * 0.3);
  await pause(500);
  const input = agent.getByTestId("text-input");
  await input.fill("Plug the cable in here");
  await input.press("Enter");
  await pause(2500);
  await agent.screenshot({ path: `${OUT}/06-agent-frozen-drawing.png` });
  await cust.screenshot({ path: `${OUT}/07-customer-frozen-drawing.png` });
  await agent.getByTestId("freeze").click();
  await pause(2000);

  await agent.getByTestId("snapshot").click();
  await agent.getByTestId("gallery-item").first().waitFor({ timeout: 10000 });
  await pause(1000);
  await agent.getByTestId("gallery-item").first().click();
  await pause(800);
  await agent.getByTestId("analyze").click();
  await agent.getByTestId("suggestion-part").first().waitFor({ timeout: 15000 });
  await pause(2000);
  await agent.screenshot({ path: `${OUT}/08-agent-analyze.png` });
  await agent.getByTestId("suggestion-part").first().getByRole("button", { name: /send/i }).click();
  await cust.waitForFunction(() => window.__live?.state().shapes.length >= 2, null, { timeout: 15000 });
  await pause(2500);
  await cust.screenshot({ path: `${OUT}/09-customer-sent-part.png` });
  await agent.keyboard.press("Escape");
  await pause(1500);
} finally {
  await agentCtx.close();
  await custCtx.close();
  await browser.close();
}
console.log("done; recordings under", OUT);
