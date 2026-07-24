import { createFileRoute } from "@tanstack/react-router";
import { requireCurrentUser } from "@/lib/auth.server";

// Browser-safe endpoint for the current Clerk user, in the shape the client
// hooks expect. A signed-out visitor gets 401, matching the old behavior.
export const Route = createFileRoute("/api/user")({
  server: {
    handlers: {
      GET: async () => {
        const auth = await requireCurrentUser();
        if (!auth.ok) {
          return new Response(JSON.stringify(auth.body), {
            status: auth.status,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        }

        return new Response(JSON.stringify(auth.user), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
