import { createFileRoute } from "@tanstack/react-router";
import { createMediaContext, safeUploadMedia } from "@higgsfield/fnf/media";
import { createWorkflowPlatformAdapter } from "@higgsfield/fnf/workflow-platform";
import { requireCurrentUser } from "@/lib/auth.server";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB — generous for a phone photo, small enough to stay fast

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Reference-photo upload for the AI avatar creator. Per the fnf SDK's
// binary-upload rule: the browser File never goes through a server-fn/JSON
// boundary — it's posted here as multipart FormData, read server-side, and
// only the resulting submit-ready MediaRef goes back to the client.
export const Route = createFileRoute("/api/avatar-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireCurrentUser();
        if (!auth.ok) return json({ error: "unauthorized" }, 401);

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return json({ error: "missing file" }, 400);
        if (file.size > MAX_UPLOAD_BYTES) return json({ error: "file_too_large" }, 400);

        const adapter = createWorkflowPlatformAdapter({ baseUrl: "https://fnf.internal" });
        const ctx = createMediaContext({ mediaAdapter: adapter });
        const bytes = await file.arrayBuffer();
        const result = await safeUploadMedia(ctx, { source: bytes, filename: file.name, type: "image", forceIpCheck: true });
        if (!result.ok) return json({ error: result.error.code }, 502);

        return json({ ref: result.result.ref });
      },
    },
  },
});
