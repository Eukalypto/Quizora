import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "@/lib/bindings.server";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

// Streams a curated Mystery Round image back out of R2 — the bucket has no
// public/custom-domain access configured, so this same-origin route is how
// quiz_mystery_pool.media_url values (set by mystery-sync.server.ts) actually
// resolve to bytes. Not auth-gated: these are game assets, not user data.
export const Route = createFileRoute("/api/mystery-image/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { STORAGE } = bindings();
        if (!STORAGE) return new Response("R2 not bound", { status: 500 });

        const key = `mystery-images/${params._splat}`;
        const obj = await STORAGE.get(key);
        if (!obj) return new Response("Not found", { status: 404 });

        const ext = key.split(".").pop()?.toLowerCase() ?? "";
        const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
        return new Response(obj.body as unknown as BodyInit, {
          status: 200,
          headers: {
            "content-type": contentType,
            "cache-control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
