import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "@/lib/bindings.server";
import { syncQuestionBankFromR2 } from "@/lib/quiz/question-sync.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });
}

// Manual trigger for the question-bank sync (see question-sync.server.ts) —
// the daily Cron covers the "seamless, do nothing" case; this lets a content
// curator push a raw-source file update live immediately after uploading it
// to R2, instead of waiting for the next scheduled run.
//
// Token-gated rather than user-auth-gated: this is a content-ops action, not
// a player action — nobody signed into the game should be able to trigger it.
export const Route = createFileRoute("/api/admin/sync-questions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { STORAGE, QUESTION_SYNC_TOKEN } = bindings();
        if (!QUESTION_SYNC_TOKEN) return json({ error: "sync_not_configured" }, 501);
        const provided = request.headers.get("x-admin-token");
        if (provided !== QUESTION_SYNC_TOKEN) return json({ error: "unauthorized" }, 401);
        if (!STORAGE) return json({ error: "r2_not_bound" }, 500);

        const report = await syncQuestionBankFromR2(STORAGE);
        return json(report, report.ok ? 200 : 500);
      },
    },
  },
});
