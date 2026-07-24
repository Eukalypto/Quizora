import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createJobClient } from "@higgsfield/fnf/client";
import { nanoBanana2 } from "@higgsfield/fnf/jobs";
import { createWorkflowPlatformAdapter } from "@higgsfield/fnf/workflow-platform";
import { bindings } from "@/lib/bindings.server";
import { requireCurrentUser } from "@/lib/auth.server";
import { setAvatarUrl } from "@/lib/quiz/db.server";

// Standalone UI host pattern (same as Mystery Round): the client shows one
// upfront cost-confirmation modal before generating, so this callback just
// resolves — every generation call here is pre-approved.
function buildAdapter() {
  return createWorkflowPlatformAdapter({ baseUrl: "https://fnf.internal", confirm: async () => {} });
}

function buildAvatarPrompt(userPrompt: string, hasReferencePhoto: boolean): string {
  const subject = hasReferencePhoto
    ? `Using the provided reference photo as the subject, create a stylized avatar portrait: ${userPrompt}.`
    : `A stylized avatar portrait: ${userPrompt}.`;
  return `${subject} Square framing, centered bust/headshot, vibrant colors, clean simple background, no text, no watermark, no logos.`;
}

export const getAvatarCost = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireCurrentUser();
  if (!auth.ok) throw new Error("unauthorized");

  const adapter = buildAdapter();
  const jobs = createJobClient({ adapter, jobs: [nanoBanana2] });
  const cost = await jobs.cost({
    model: "nano_banana_2",
    prompt: { instruction: "cost preview" },
    settings: { aspectRatio: "1:1", batchSize: 1 },
  });
  return { credits: cost.credits };
});

const mediaRefSchema = z.object({
  id: z.string(),
  type: z.string(),
  url: z.string().optional(),
  role: z.string().optional(),
});

const generateInput = z.object({
  prompt: z.string().min(2).max(2000),
  referenceImage: mediaRefSchema.optional(),
});

export const generateAvatar = createServerFn({ method: "POST" })
  .validator(generateInput)
  .handler(async ({ data }) => {
    const auth = await requireCurrentUser();
    if (!auth.ok) throw new Error("unauthorized");
    const { DB } = bindings();
    if (!DB) throw new Error("D1 binding missing");

    const adapter = buildAdapter();
    const jobs = createJobClient({ adapter, jobs: [nanoBanana2] });
    const result = await jobs.safeSubmit({
      model: "nano_banana_2",
      prompt: { instruction: buildAvatarPrompt(data.prompt, !!data.referenceImage) },
      media: data.referenceImage ? { image: [data.referenceImage] } : undefined,
      settings: { aspectRatio: "1:1", batchSize: 1 },
    });
    if (!result.ok) {
      return { ok: false as const, errorCode: "job_failed" as const };
    }
    const [done] = await jobs.wait(result.generations, { onProgress: () => {} });
    const mediaUrl = done.results?.rawUrl;
    if (!mediaUrl) {
      return { ok: false as const, errorCode: "job_failed" as const };
    }

    await setAvatarUrl(DB, auth.user.id, mediaUrl);
    return { ok: true as const, avatarUrl: mediaUrl };
  });
