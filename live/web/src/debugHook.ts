/// <reference types="vite/client" />
// Exposes read-only state on window.__live for the e2e test. Enabled outside production builds or with ?debug=1.
export function installDebugHook(hook: Record<string, () => unknown>): void {
  const enabled = import.meta.env.MODE !== "production" || new URLSearchParams(window.location.search).get("debug") === "1";
  if (enabled) (window as unknown as { __live?: unknown }).__live = hook;
}
