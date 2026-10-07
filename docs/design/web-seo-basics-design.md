# Design: Web SEO basics

**Feature:** [web-seo-basics.md](../features/web-seo-basics.md)

## 1. Where it fits

| Layer | Change |
|-------|--------|
| `frontend/public/robots.txt` | New |
| `frontend/public/sitemap.xml` | New |
| `frontend/public/og.jpg` | New share image (static) |
| `frontend/index.html` | Meta / canonical / OG / Twitter / JSON-LD |
| `frontend/src/components/MarketingLanding.tsx` | Footer hrefs |
| `frontend/package.json` | `linkinator` + `seo:links` script |
| Docs | Feature notes for GSC / OpenSEO ops |

No backend-cf, mobile, or routing changes.

## 2. File contracts

### 2.1 `robots.txt`

```
User-agent: *
Allow: /

Sitemap: https://lardermind.com/sitemap.xml
```

No `Disallow` for SPA paths (there are none). Do not block `/legal/`.

### 2.2 `sitemap.xml`

Three `<url>` entries:

| loc | changefreq | priority |
|-----|------------|----------|
| `https://lardermind.com/` | weekly | 1.0 |
| `https://lardermind.com/legal/privacy-policy.html` | yearly | 0.3 |
| `https://lardermind.com/legal/terms-of-service.html` | yearly | 0.3 |

Optional `<lastmod>`: omit in v1 (avoid stale dates) or set to feature ship date once.

### 2.3 `index.html` head

- `lang="en"` kept
- `meta name="description"` — pantry → meal planning AI one-liner (~150 chars)
- `link rel="canonical" href="https://lardermind.com/"`
- OG: `og:type=website`, `og:url`, `og:title`, `og:description`, `og:image` → `https://lardermind.com/og.jpg`, `og:site_name=LarderMind`
- Twitter: `summary_large_image` + matching title/description/image
- JSON-LD:

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "LarderMind",
  "url": "https://lardermind.com/",
  "applicationCategory": "LifestyleApplication",
  "operatingSystem": "Web",
  "description": "…"
}
```

### 2.4 `og.jpg`

- Source: same Unsplash kitchen photo already used as hero (`photo-1490645935967-10de6ba17061`), downloaded once into `public/og.jpg` (or cropped ~1200×630 if trivial).
- Served at site root after deploy.

### 2.5 Footer

```tsx
<a href="/legal/privacy-policy.html">Privacy</a>
<a href="/legal/terms-of-service.html">Terms</a>
<a href="mailto:support@lardermind.com">Contact</a>
```

Remove About `#` (no About page). Order: Privacy, Terms, Contact.

### 2.6 linkinator

- `devDependency`: `linkinator`
- Script: `"seo:links": "linkinator https://lardermind.com --recurse --verbosity error"`
- Optional env override documented in task README: `npx linkinator "$URL" …`
- Skip patterns only if first run shows noisy false positives (e.g. mailto may be skipped depending on version — verify).

## 3. Verification

1. `npm run build` → assert files in `dist/app/`.
2. Small Node smoke script or checklist: robots/sitemap strings contain `lardermind.com`.
3. Manual: open `https://lardermind.com/robots.txt` after deploy.
4. `npm run seo:links` against production after deploy (may fail pre-deploy if URLs 404 — run post-ship).

## 4. Risks

| Risk | Mitigation |
|------|------------|
| Operators expect ranking from meta alone | Feature doc non-goals: still CSR shell |
| OG image large | Compress reasonably; Unsplash q=80 crop is fine |
| linkinator fails on SPA hash-less soft links | Only real anchors + legal matter |
| Duplicate legal content in `docs/legal` vs `public/legal` | Unchanged; public is deploy source of truth for URLs |

## 5. Explicitly deferred

- Prerender / Astro marketing site
- `react-helmet` per-view titles
- OpenSEO Docker + DataForSEO
- GSC API automation
