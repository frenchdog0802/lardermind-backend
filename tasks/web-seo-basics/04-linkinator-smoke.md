# 04 — linkinator + build smoke

## Goal

Add a local/CI-friendly broken-link check and a tiny smoke assert for SEO static files.

## Work

1. Add `linkinator` devDependency.
2. Add `seo:links` script defaulting to `https://lardermind.com`.
3. Add `scripts/seo-static-smoke.mjs` that fails if `dist/app/robots.txt`, `sitemap.xml`, `og.jpg` missing or if sitemap lacks the three locs; wire as `seo:smoke` (run after build).

## Acceptance

- [ ] `npm run seo:links` defined
- [ ] `npm run build && npm run seo:smoke` passes
- [ ] README/task notes: run `seo:links` after Pages deploy
