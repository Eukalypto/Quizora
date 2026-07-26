import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

// Clerk's own env lookup only checks process.env / import.meta.env, neither of
// which reliably carries the Worker's secret store in production (unlike this
// codebase's usual `cloudflare:workers` env access — see bindings.server.ts).
// Read the keys from there directly. `cloudflare:workers` doesn't exist under
// plain `vite dev` (Node/Bun, no Workers runtime) — the catch falls back to
// Clerk's normal resolution, which is how local dev already worked.
// Built from parts so Vite's dev-time import-analysis can't statically resolve
// it (it eagerly fails on a literal specifier even inside try/catch, since
// that's a transform-time check, not a runtime one — @vite-ignore alone
// doesn't suppress it for this plugin).
const CLOUDFLARE_WORKERS_MODULE = ["cloudflare", "workers"].join(":");

async function clerkKeysFromWorkerEnv() {
  try {
    const mod = (await import(CLOUDFLARE_WORKERS_MODULE)) as { env?: Record<string, string> };
    return { secretKey: mod.env?.CLERK_SECRET_KEY, publishableKey: mod.env?.VITE_CLERK_PUBLISHABLE_KEY };
  } catch {
    return {};
  }
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [clerkMiddleware(clerkKeysFromWorkerEnv), csrfMiddleware, errorMiddleware],
}));
