# Feature: Web SEO basics (`lardermind.com`)

**Status:** Implemented  
**Scope:** Cloudflare Pages web SPA (`frontend/`) — crawlable static SEO files + landing meta + footer indexable links + local link audit script  
**Out of scope:** SSR / prerender migration, real path-based marketing routes, OpenSEO / SerpBear / CrawlSEO self-host, keyword research, backlink outreach, mobile deep links SEO, authenticated app `noindex` headers, custom OG photography beyond shipping a static share image

**Design:** [web-seo-basics-design.md](../design/web-seo-basics-design.md)  
**Tasks:** [tasks/web-seo-basics/](../../tasks/web-seo-basics/)

---

## 1. Summary

Production domain **https://lardermind.com** is live, but the web app ships almost no SEO surface: no `robots.txt` / `sitemap.xml`, `index.html` has only a title (no description / Open Graph / canonical), and the marketing footer Privacy / Contact / About links are `#` placeholders.

This feature adds the **minimum crawl + share + link-health** layer that works on a Vite CSR SPA hosted on Cloudflare Pages **without** changing the app router or adding SSR.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Canonical origin | `https://lardermind.com` (no trailing slash) | Matches legal docs, Stripe `FRONTEND_URL`, Google OAuth |
| Indexable URLs in sitemap | `/`, `/legal/privacy-policy.html`, `/legal/terms-of-service.html` | Only real public HTML surfaces today |
| Auth app views | Not listed in sitemap | Same SPA URL; no separate public paths |
| Meta / OG | Static tags in `frontend/index.html` | Crawlers that only read first HTML still get share/snippet basics |
| OG image | Hosted at `https://lardermind.com/og.jpg` under `public/` | Avoid hotlinking Unsplash for social crawlers |
| Footer | Privacy + Terms → legal HTML; Contact → `mailto:support@lardermind.com`; drop dead About `#` or replace with Terms | Remove `#` dead ends |
| Link audit | `linkinator` npm script against production (or preview URL) | Topic-recommended, CI-friendly; no self-hosted SEO suite required |
| OpenSEO / rank trackers | **Out of scope** for this feature | Needs DataForSEO (or similar) API key + hosting decision |

---

## 2. Requirements

### 2.1 Crawl / index files

1. Serve `robots.txt` that allows public crawl and declares the sitemap URL.
2. Serve `sitemap.xml` listing the three indexable URLs with absolute `https://lardermind.com` locators.
3. Files live under `frontend/public/` so Vite copies them into `dist/app/` on Pages deploy.

### 2.2 Document head (landing shell)

1. `meta name="description"` summarizing the product.
2. `link rel="canonical"` → `https://lardermind.com/`.
3. Open Graph + Twitter Card tags (title, description, url, type/image).
4. Optional JSON-LD `SoftwareApplication` (or `WebApplication`) for the product name + url.
5. Keep existing `<title>` intent (product name + short value prop).

### 2.3 Marketing footer

1. Privacy → `/legal/privacy-policy.html`.
2. Terms → `/legal/terms-of-service.html` (add if missing).
3. Contact → `mailto:support@lardermind.com`.
4. No remaining footer `#` placeholders for those items.

### 2.4 Link health tooling

1. DevDependency + npm script to run linkinator against a configurable base URL (default `https://lardermind.com`).
2. Document how to run after deploy; optional skip patterns for external noise if needed.

### 2.5 Operator follow-ups (documented, not coded)

1. Submit sitemap in Google Search Console for `lardermind.com`.
2. Decide later whether to self-host OpenSEO (BYO DataForSEO key).

---

## 3. Acceptance

1. After build, `dist/app/robots.txt` and `dist/app/sitemap.xml` exist and reference `lardermind.com`.
2. Built `dist/app/index.html` contains description, canonical, OG, Twitter, and JSON-LD.
3. `dist/app/og.jpg` exists.
4. Marketing footer Privacy / Terms / Contact are real links (no `#`).
5. `npm run seo:links` (or documented equivalent) is available and can crawl the production origin.
6. Feature docs + task checklist updated.

---

## 4. Edge cases

| Case | Handling |
|------|----------|
| `www` vs apex | Canonical + sitemap use apex `lardermind.com`; DNS/Pages should redirect www → apex (ops, out of scope if already set) |
| SPA deep views | Not separate URLs; not in sitemap |
| Legal pages already have their own title/description | Leave as-is; sitemap still lists them |
| Social crawlers that execute little/no JS | Rely on static `index.html` tags + `og.jpg` |

---

## 5. Non-goals reminder

Shipping this does **not** make Google index rich per-section marketing content inside the SPA. That needs prerender/SSR or a separate static marketing site (future feature).
