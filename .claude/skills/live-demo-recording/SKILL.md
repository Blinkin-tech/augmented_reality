---
name: live-demo-recording
description: "Build, run, and record the live visual support demo: compile both packages, start the production server, run the Playwright end-to-end test, record the agent console and the phone page side by side with the bundled script, and combine them with ffmpeg into one mp4. Use when asked to run the demo, show it, take screenshots, record a video, or prove a change works in the real app. Not for unit tests alone."
---

# Live demo recording

The demo runs in two Chromium contexts in one browser: the agent console at desktop size
and the customer page at phone width. Chromium's fake camera supplies the video, so the
picture is a green test pattern with a clock. WebRTC runs over loopback.

## Steps

Run from the repository root.

1. Build both packages. Stop on any error.
   ```bash
   cd live && npm run build
   ```
2. Run the end-to-end test. It builds again, starts the server on port 3100, and stops it.
   Stop on a failure and report the failing step.
   ```bash
   cd live && npm run test:e2e
   ```
3. Start the production server for the recording on a free port, with a temp data folder.
   ```bash
   mkdir -p _agents_workspace/demo/data
   PORT=3200 DATA_DIR=$PWD/_agents_workspace/demo/data node live/server/dist/index.js > _agents_workspace/demo/server.log 2>&1 &
   ```
   Confirm `curl -s -o /dev/null -w "%{http_code}" http://localhost:3200/agent` prints 200.
4. Record. The script in this skill drives both pages, takes stills at each step, and
   writes two webm files.
   ```bash
   OUT=_agents_workspace/demo/$(date +%F) BASE=http://localhost:3200 node .claude/skills/live-demo-recording/scripts/record-demo.mjs
   ```
   The script resolves Playwright from `live/node_modules` and uses the Chromium at
   `/opt/pw-browsers/chromium`. Set `PW_CHROMIUM` to another path on another machine. Never
   run `playwright install`.
5. Combine the two recordings side by side.
   ```bash
   cd _agents_workspace/demo/$(date +%F) && ffmpeg -loglevel error -y -i agent/*.webm -i customer/*.webm -filter_complex "[0:v]scale=1280:800[a];[1:v]scale=400:800[c];[a][c]hstack=inputs=2,format=yuv420p" -r 25 -c:v libx264 -preset fast -crf 23 -movflags +faststart live-demo.mp4
   ```
6. Stop the server: `pkill -f "live/server/dist/index.js"`.
7. Deliver `live-demo.mp4` and the stills to the user, with the duration and a one-line
   description of each step shown. Write the run report.

## What the recording shows

New session with QR code; customer consent and camera start; status `live`; three pointer
taps; one arrow; freeze with a rectangle and a text label; resume; snapshot; analyze with
the mock provider; Send of one part to the phone.

## Limits

- No audio in the video. The voice path exists but a screen recording has no sound track.
- Loopback only. A real phone on mobile data needs the manual checklist in `live/README.md`
  and may need a TURN relay.
- The script expects the current test ids. If a control was renamed, update the script and
  the end-to-end test together.
