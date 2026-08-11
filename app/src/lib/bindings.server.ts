// Server-only access to this app's Cloudflare bindings. Each is present ONLY if
// opted into via app.manifest.json (D1 `DB`, R2 `STORAGE`, KV `KV`, and the
// container `CONTAINER`) — so the accessors are optional; guard before use.
// `cloudflare:workers` is the Workers-runtime module that exposes the Worker
// env (bindings) — usable inside any server-side code (server functions,
// server routes). It is NOT bundled; the runtime provides it.
//
// Import the binding types directly — NOT via the global tsconfig `types` list,
// which would clobber the DOM globals the client/SSR React code relies on.
import type {
  D1Database,
  DurableObjectNamespace,
  KVNamespace,
  R2Bucket,
} from "@cloudflare/workers-types";

// Loaded lazily via a computed specifier (same pattern as getClerkWorkerKeys
// in clerk-worker-env.ts) rather than a static
// `import { env } from "cloudflare:workers"`: this module sits in the
// server bundle's eagerly-loaded root graph, and the spa prerender build
// step (vite.config.ts) runs that bundle under plain Node — which has no
// `cloudflare:` scheme and throws ERR_UNSUPPORTED_ESM_URL_SCHEME on a
// static import, crashing the whole build before it ever routes a request.
// A top-level await here still resolves correctly under workerd (the
// runtime this normally executes in) — this changes nothing for actual
// deployed requests, only makes the Node-only prerender crawl tolerate the
// module's absence.
const CLOUDFLARE_WORKERS_MODULE = ["cloudflare", "workers"].join(":");
let env: Record<string, unknown> = {};
try {
  env = ((await import(CLOUDFLARE_WORKERS_MODULE)) as { env?: Record<string, unknown> }).env ?? {};
} catch {
  // Not running under workerd (e.g. the prerender crawl) — bindings() below
  // falls back to empty, matching the optional-binding guards callers
  // already need for opt-out-of-manifest bindings.
}

type AppEnv = {
  DB?: D1Database;
  STORAGE?: R2Bucket;
  KV?: KVNamespace;
  // The container's Durable Object — present only when "container" is set in
  // the manifest. Reach an instance with env.CONTAINER.getByName(id), then
  // .fetch(). See skills/containers.md.
  CONTAINER?: DurableObjectNamespace;
  HF_ENV?: string;
  APP_SLUG?: string;
  // Shared secret gating the manual question-bank sync trigger — see
  // src/routes/api/admin/sync-questions.ts. Set via `wrangler secret put`.
  QUESTION_SYNC_TOKEN?: string;
  // Expected "Authorization" header value on inbound RevenueCat webhooks —
  // see src/routes/api/webhooks/revenuecat.ts. Set via `wrangler secret put`.
  REVENUECAT_WEBHOOK_SECRET?: string;
  // RevenueCat's server-side secret API key — can read/mutate any subscriber
  // in the project, never expose to the client. Used by
  // src/lib/quiz/entitlements.server.ts. Set via `wrangler secret put`.
  REVENUECAT_SECRET_API_KEY?: string;
};

export function bindings(): AppEnv {
  return env as unknown as AppEnv;
}
