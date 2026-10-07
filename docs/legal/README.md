# Legal pages (LarderMind)

| File | Purpose |
|------|---------|
| [privacy-policy.html](./privacy-policy.html) | Privacy Policy (ZH + EN) + Play Data Safety mapping |
| [terms-of-service.html](./terms-of-service.html) | Terms of Service (ZH + EN) |

**Last updated in docs:** 2026-09-22

**Developer:** Bert · **Contact:** support@lardermind.com  
**Governing law:** Canada · **Age:** 13+ · **Subscriptions:** Web Stripe disclosed · **App IAP:** not live yet

## Deploy

Copies also live under `frontend/public/legal/` so Cloudflare Pages can serve:

- `https://lardermind.com/legal/privacy-policy.html`
- `https://lardermind.com/legal/terms-of-service.html`

After frontend deploy, paste the privacy URL into Google Play Console → App content → Privacy policy.

## SEO (ops)

- Sitemap: `https://lardermind.com/sitemap.xml` (also linked from `robots.txt`)
- After web deploy: submit the sitemap in [Google Search Console](https://search.google.com/search-console) for `lardermind.com`
- Optional later: self-host [OpenSEO](https://github.com/every-app/open-seo) with a DataForSEO API key for keyword/rank research (not required for basic indexing)
