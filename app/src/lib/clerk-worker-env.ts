// Clerk's own env lookup only checks process.env / import.meta.env, neither of
// which reliably carries the Worker's secret store in production (unlike this
// codebase's usual `cloudflare:workers` env access — see bindings.server.ts).
// Every place that constructs a Clerk client (clerkMiddleware in start.ts,
// clerkClient() in auth.server.ts) needs this, since each resolves its keys
// independently — passing keys to one does not carry over to the other.
//
// `cloudflare:workers` doesn't exist under plain `vite dev` (Node/Bun, no
// Workers runtime) — the catch falls back to Clerk's normal resolution.
// Built from parts so Vite's dev-time import-analysis can't statically
// resolve it (it eagerly fails on a literal specifier even inside try/catch,
// since that's a transform-time check, not a runtime one — @vite-ignore
// alone doesn't suppress it for this plugin).
const CLOUDFLARE_WORKERS_MODULE = ["cloudflare", "workers"].join(":");

export async function getClerkWorkerKeys(): Promise<{ secretKey?: string; publishableKey?: string }> {
  try {
    const mod = (await import(CLOUDFLARE_WORKERS_MODULE)) as { env?: Record<string, string> };
    return { secretKey: mod.env?.CLERK_SECRET_KEY, publishableKey: mod.env?.VITE_CLERK_PUBLISHABLE_KEY };
  } catch {
    return {};
  }
}
