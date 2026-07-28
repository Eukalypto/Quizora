// Daily Cron job (paired with question-sync.server.ts): reads curated
// Mystery Round images a content curator drops into R2 under
// mystery-images/<subject_id>/<filename>, and registers each one in
// quiz_mystery_pool so mystery-pool.server.ts can serve it. No AI generation
// involved anymore — an image simply needs to exist in R2 for its subject to
// become playable. Images are served back out through
// src/routes/api/mystery-image.$.ts rather than a public R2 URL, since the
// bucket has no public/custom-domain access configured.
import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { MYSTERY_SUBJECTS } from "./mystery";

const MYSTERY_IMAGES_PREFIX = "mystery-images/";

export interface MysterySyncReport {
  ranAt: string;
  ok: boolean;
  found: number;
  inserted: number;
  unknownSubjects: string[];
  error?: string;
}

async function listAllMysteryImageKeys(storage: R2Bucket): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await storage.list({ prefix: MYSTERY_IMAGES_PREFIX, cursor });
    for (const obj of page.objects) keys.push(obj.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

export async function syncMysteryImagesFromR2(storage: R2Bucket, db: D1Database): Promise<MysterySyncReport> {
  const ranAt = new Date().toISOString();
  try {
    const keys = await listAllMysteryImageKeys(storage);
    const subjectById = new Map(MYSTERY_SUBJECTS.map((s) => [s.id, s]));
    const unknownSubjects = new Set<string>();

    const rows: { level: 1 | 2 | 3; subjectId: string; mediaUrl: string }[] = [];
    for (const key of keys) {
      const rest = key.slice(MYSTERY_IMAGES_PREFIX.length); // "<subject_id>/<filename>"
      const slashIndex = rest.indexOf("/");
      if (slashIndex <= 0) continue; // not a "<subject_id>/<file>" shape
      const subjectId = rest.slice(0, slashIndex);
      const subject = subjectById.get(subjectId);
      if (!subject) {
        unknownSubjects.add(subjectId);
        continue;
      }
      // rest excludes the "mystery-images/" prefix — the serving route
      // (mystery-image.$.ts) re-adds it when reconstructing the R2 key.
      const mediaUrl = `/api/mystery-image/${rest.split("/").map(encodeURIComponent).join("/")}`;
      rows.push({ level: subject.level, subjectId, mediaUrl });
    }

    let inserted = 0;
    for (const row of rows) {
      const result = await db
        .prepare(`INSERT OR IGNORE INTO quiz_mystery_pool (level, subject_id, media_url, status) VALUES (?, ?, ?, 'ready')`)
        .bind(row.level, row.subjectId, row.mediaUrl)
        .run();
      if (result.meta.changes > 0) inserted++;
    }

    return { ranAt, ok: true, found: rows.length, inserted, unknownSubjects: [...unknownSubjects] };
  } catch (error) {
    return { ranAt, ok: false, found: 0, inserted: 0, unknownSubjects: [], error: error instanceof Error ? error.message : String(error) };
  }
}
