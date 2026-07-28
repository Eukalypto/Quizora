#!/usr/bin/env node
// Assembles the Capacitor webDir from a normal `vite build` output. The spa
// prerender option (vite.config.ts) writes a static "shell" for /app to
// dist/client/_shell.html alongside the site's regular hashed JS/CSS —
// that shell (renamed to index.html) plus those assets is the whole native
// app bundle: no server of its own, just the client bundle + a static
// entry point. Game data still comes from the live Worker over the network
// (see src/lib/native-shell.ts) — this script only assembles static files.
import { cpSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLIENT_DIR = join(ROOT, "dist", "client");
const SHELL_HTML = join(CLIENT_DIR, "_shell.html");
const MOBILE_DIR = join(ROOT, "mobile-shell");
const INDEX_HTML = join(MOBILE_DIR, "index.html");

if (!existsSync(SHELL_HTML)) {
  console.error(
    "build-mobile-shell: dist/client/_shell.html not found — did `vite build` run, and is spa.enabled set in vite.config.ts?",
  );
  process.exit(1);
}

rmSync(MOBILE_DIR, { recursive: true, force: true });
cpSync(CLIENT_DIR, MOBILE_DIR, { recursive: true });
renameSync(join(MOBILE_DIR, "_shell.html"), INDEX_HTML);

// The shell's embedded router state is prerendered for the "/app" route
// specifically (see maskPath in vite.config.ts), but Capacitor serves this
// file at its webDir root — the WebView's real window.location.pathname is
// "/", not "/app". Left alone, TanStack Router hydrates against that real
// (wrong) path and renders the marketing landing route instead of the app.
// Rewriting the path via the History API — before any other script runs —
// makes the browser-visible URL match what the prerendered HTML expects,
// with no server round trip.
const html = readFileSync(INDEX_HTML, "utf8");
const patched = html.replace(
  "<head>",
  `<head><script>if(location.pathname!=="/app")history.replaceState(null,"","/app"+location.search+location.hash)</script>`,
);
writeFileSync(INDEX_HTML, patched);

console.log(`build-mobile-shell: wrote ${MOBILE_DIR}`);
