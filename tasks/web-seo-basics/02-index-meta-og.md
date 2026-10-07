# 02 — index.html meta / OG / JSON-LD + og.jpg

## Goal

Give the SPA shell shareable and snippet-ready static head tags plus a hosted OG image.

## Work

1. Update `frontend/index.html` with description, canonical, Open Graph, Twitter Card, JSON-LD (`WebApplication`).
2. Add `frontend/public/og.jpg` (hero Unsplash asset saved locally).

## Acceptance

- [ ] Built `index.html` contains description, canonical, `og:image`, twitter tags, JSON-LD
- [ ] `og:image` / twitter image point to `https://lardermind.com/og.jpg`
- [ ] `dist/app/og.jpg` present after build
