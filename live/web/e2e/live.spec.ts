import { test, expect } from "@playwright/test";

test("agent guides a customer end to end", async ({ browser }) => {
  const agentCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
  const custCtx = await browser.newContext({ permissions: ["camera", "microphone"], viewport: { width: 400, height: 800 } });
  const agent = await agentCtx.newPage(); const cust = await custCtx.newPage();
  await agent.goto("/agent?debug=1"); await agent.getByTestId("new-session").click();
  const link = await agent.getByTestId("customer-link").textContent();
  await cust.goto(link!.replace(/\/s\//, "/s/") + "?debug=1"); await cust.getByTestId("start-camera").click();
  await expect(agent.getByTestId("status")).toHaveText(/live/, { timeout: 30000 });

  // "live" means the peer is connected and the guidance channel is open.
  await agent.getByTestId("tool-pointer").click();
  const box = (await agent.getByTestId("video-overlay").boundingBox())!;
  await agent.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => cust.evaluate(() => (window as any).__live.state().transients.length)).toBe(1);
  const [px, py] = await cust.evaluate(() => (window as any).__live.state().transients[0].pts[0]);
  expect(px).toBeCloseTo(0.5, 2); expect(py).toBeCloseTo(0.5, 2);

  await agent.getByTestId("freeze").click();
  await expect.poll(async () => cust.evaluate(() => (window as any).__live.state().frozen !== null), { timeout: 15000 }).toBe(true);
  await agent.getByTestId("tool-rect").click();
  await agent.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3); await agent.mouse.down();
  await agent.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6); await agent.mouse.up();
  await expect.poll(async () => cust.evaluate(() => (window as any).__live.state().shapes.length)).toBe(1);

  await agent.getByTestId("snapshot").click();
  await expect(agent.getByTestId("gallery-item")).toHaveCount(1);
});
