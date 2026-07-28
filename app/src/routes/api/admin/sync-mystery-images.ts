import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "@/lib/bindings.server";
import { syncMysteryImagesFromR2 } from "@/lib/quiz/mystery-sync.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });
}

// Manual trigger for the Mystery Round image sync (see mystery-sync.server.ts)
// — same token-gated pattern as sync-questions.ts, for pushing a freshly
// uploaded image live immediately instead of waiting for the daily Cron.
export const Route = createFileRoute("/api/admin/sync-mystery-images")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { STORAGE, DB, QUESTION_SYNC_TOKEN } = bindings();
        if (!QUESTION_SYNC_TOKEN) return json({ error: "sync_not_configured" }, 501);
        const provided = request.headers.get("x-admin-token");
        if (provided !== QUESTION_SYNC_TOKEN) return json({ error: "unauthorized" }, 401);
        if (!STORAGE || !DB) return json({ error: "bindings_missing" }, 500);

        const report = await syncMysteryImagesFromR2(STORAGE, DB);
        return json(report, report.ok ? 200 : 500);
      },
    },
  },
});
