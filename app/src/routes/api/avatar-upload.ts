import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "@/lib/bindings.server";
import { requireCurrentUser } from "@/lib/auth.server";
import { setAvatarUrl } from "@/lib/quiz/db.server";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB — generous for a composited PNG avatar

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Receives the client-composited avatar (see avatar-creator-modal.tsx's
// canvas flatten step) as multipart FormData — binary upload, so it bypasses
// the server-fn/JSON boundary same as before. Stores it in R2 under a
// deterministic per-user key (re-saving just overwrites, no cleanup needed)
// and updates quiz_users.avatar_url to the route that serves it back out
// (see avatar-image.$userId.ts) — no more Higgsfield/fnf involved.
export const Route = createFileRoute("/api/avatar-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireCurrentUser();
        if (!auth.ok) return json({ error: "unauthorized" }, 401);

        const { STORAGE, DB } = bindings();
        if (!STORAGE || !DB) return json({ error: "bindings_missing" }, 500);

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return json({ error: "missing_file" }, 400);
        if (file.size > MAX_UPLOAD_BYTES) return json({ error: "file_too_large" }, 400);

        const bytes = await file.arrayBuffer();
        await STORAGE.put(`user-avatars/${auth.user.id}.png`, bytes, {
          httpMetadata: { contentType: "image/png" },
        });

        const url = `/api/avatar-image/${auth.user.id}`;
        await setAvatarUrl(DB, auth.user.id, url);

        return json({ url });
      },
    },
  },
});
