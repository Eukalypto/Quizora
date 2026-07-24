# Custom Higgsfield app

This is the constrained fallback template for products that do not fit the
purpose-built Studio, Preset, or App Detail layouts.

Read before editing:

1. `src/layouts/AGENTS.md` — mandatory shell and visual contract.
2. `src/components/AGENTS.md` — shared recipe catalog.
3. `packages/quanta/ai/AGENTS.md` — Quanta APIs and tokens.

Do not treat this template as a blank canvas. Keep `CustomAppShell` and compose
the product from the custom-ui recipes plus Quanta primitives. All shipped
visible content is mock and must be replaced.

A full shadcn kit lives in `@/components/ui`, skinned with the same Quanta
`--hf-*` tokens — it coexists with Quanta rather than replacing it. See
"shadcn UI kit" in `src/components/AGENTS.md` for when to use which.

## Public landing contract

- `/` is the public landing and `/app` is the full product. Preserve this route
  split even when the product adds deeper routes.
- Generate `src/landing-content.ts` from the same AppBrief used for the product.
  Replace the template hero, exactly three visual steps, exactly three feature
  cards, showcase media, final CTA, and every placeholder asset.
- Keep the enforced Preset-style step previews: step 1 is a product-specific
  `instruction` UI, step 2 is the product's primary `action`, and step 3 is
  representative `result` media. Never fill the three previews with cover
  images or repeated screenshots.
- Generate dedicated result and showcase assets under `public/assets/landing/`.
  Do not reuse the marketplace cover, app preview, another section asset, or
  the same file copied under different names. `check:adapted` rejects repeated
  paths and duplicate file contents.
- The route preview uses `/app?preview=1`. Every custom product must honor
  `previewMode`: render deterministic representative data and perform no
  uploads, generation approvals, analytics, persistence writes, camera/mic
  access, or other side effects.
- Prefer the live route preview. Switch `preview.kind` to `media` with an owned
  image/video poster when the full UI cannot be rendered safely or cheaply in
  preview mode.
- Describe only real product behavior. Never fabricate testimonials, customer
  logos, usage metrics, or unsupported results.

Required completion checks:

```bash
bun run check:ui
bun run check:adapted
bun run typecheck
bun run build
```
