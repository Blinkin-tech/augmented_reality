# Live visual support

## What it is

Live visual support lets a customer share their phone camera with a support agent. The agent sees the video in a browser console. The agent draws on the video to guide the customer. The video travels over WebRTC, a browser standard for live audio and video.

## Requirements

- Node 22.

## Run in development

1. Run `npm install` in the `live/` folder.
2. Run `npm run dev`. The server runs on port 3000. Vite runs on port 5173.
3. Open `http://localhost:5173/agent` in a browser.

## Demo through a tunnel

A tunnel gives the customer a public link to your machine. Phones cannot reach `localhost`. Most tunnels also give you HTTPS, which phone browsers need for the camera.

Tunnel the production server. This is the recommended path:

1. Run `npm run build`.
2. Run `npm start`. The server runs on port 3000.
3. In a second terminal, run `ngrok http 3000`, or run `cloudflared tunnel --url http://localhost:3000`.
4. Open `/agent` through the tunnel URL, for example `https://<tunnel-host>/agent`.

You can tunnel the development server instead:

1. Run `npm run dev`.
2. In a second terminal, run `ngrok http 5173`, or run `cloudflared tunnel --url http://localhost:5173`.
3. Open `/agent` through the tunnel URL.

The customer link uses `PUBLIC_URL` as its origin when you set it. Otherwise it uses the origin of the request. If the customer link does not show the tunnel URL, set `PUBLIC_URL` to the tunnel URL and restart the server. This works for both paths.

## TURN relay

WebRTC connects the phone and the console directly when it can. Some mobile networks block direct connections. A TURN relay server then carries the video. TURN is the relay protocol that WebRTC uses for this.

1. Start a TURN server on a machine with a public IP address:

   ```
   docker run -d --network=host coturn/coturn -n --log-file=stdout --lt-cred-mech --user=demo:demo --realm=demo --external-ip=$(curl -s ifconfig.me)
   ```

2. Set these variables before you start the server:

   ```
   TURN_URL=turn:<public-ip>:3478
   TURN_USER=demo
   TURN_PASS=demo
   ```

Change the demo credentials before you share the server.

## AI analysis

The analyze button sends a snapshot to a vision model. Set `ANTHROPIC_API_KEY` to use a real vision model. Set it before you start the server.

Without `ANTHROPIC_API_KEY`, the analyze endpoint uses a mock provider. The mock returns fixed labels.

## Production

1. Run `npm run build`.
2. Run `npm start`. The server runs on port 3000.
3. Set `PORT` to use a different port, for example `PORT=8080 npm start`.

`DATA_DIR` sets where the server stores its data. The default is `live/data`.

## Tests

- `npm test` runs the unit tests for the server and the web app.
- `npm run test:e2e` runs the end-to-end test with Playwright, a browser test tool. The test builds the app and starts the server on port 3100 by itself.

## Manual demo checklist

The end-to-end test in `live/web/e2e/live.spec.ts` covers the steps from New session to Snapshot, except the voice check. Run them by hand with a laptop and a phone on mobile data. Start the production server and a tunnel to port 3000, as described in "Demo through a tunnel". Run the list twice: once without TURN, and once with TURN.

1. On the laptop, open `/agent` through the tunnel URL. Select New session.
2. Check that the customer link starts with the tunnel URL.
3. On the phone, open the customer link. Read the consent text. Tap Start camera.
4. Wait until the agent status shows live and the video appears.
5. Speak on the laptop. The phone plays the agent's voice.
6. Select the pointer tool. Click the video. The customer sees a pointer.
7. Select Freeze. The customer view stops on one frame.
8. Select the rect tool. Drag a rectangle on the video. The customer sees the rectangle.
9. Select Snapshot. The gallery shows one snapshot.

## Known limits

- Sessions are lost when the server restarts.
- A session has one agent and one customer.
- Nothing is recorded. Snapshots are saved only when the agent takes one.
