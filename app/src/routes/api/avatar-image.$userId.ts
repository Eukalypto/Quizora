import { createFileRoute } from "@tanstack/react-router";
import { bindings } from "@/lib/bindings.server";

// Streams a saved custom avatar back out of R2 (see avatar-upload.ts). Public/
// unauthenticated on purpose — avatars are shown to other players (Challenge,
// Ranks), same as the old Higgsfield-hosted URLs were.
export const Route = createFileRoute("/api/avatar-image/$userId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { STORAGE } = bindings();
        if (!STORAGE) return new Response("R2 not bound", { status: 500 });

        const obj = await STORAGE.get(`user-avatars/${params.userId}.png`);
        if (!obj) return new Response("Not found", { status: 404 });

        return new Response(obj.body as unknown as BodyInit, {
          status: 200,
          headers: {
            "content-type": "image/png",
            "cache-control": "private, max-age=60",
          },
        });
      },
    },
  },
});
