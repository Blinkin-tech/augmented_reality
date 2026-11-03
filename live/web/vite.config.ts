import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Accept tunnel hostnames (ngrok, cloudflared); Vite blocks non-localhost Hosts otherwise.
    allowedHosts: true,
    // changeOrigin: false keeps the tunnel Host, so the server builds the customer link with the public origin.
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: false },
      "/ws": { target: "ws://localhost:3000", ws: true, changeOrigin: false },
    },
  },
});
