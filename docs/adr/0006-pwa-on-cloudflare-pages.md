# ADR-0006: Installable web app (PWA) on Cloudflare Pages

**Status:** Proposed
**Date:** 2026-10-11
**Deciders:** Aaditya

## Context
PRODUCT.md names mobile web as the platform. The app builds to one self-contained `app/dist/index.html`. It must install to the home screen, open offline mid-workout, receive push, and pass Razorpay's website review (privacy, terms, refund, contact pages).

## Decision
Ship as a PWA: web manifest, PNG icons, and a service worker that precaches the app shell (network-first for the page so updates arrive, cache fallback offline) and handles push. Host the static `app/dist` on Cloudflare Pages with a `_headers` file setting a strict Content Security Policy (the inline app script is allowed by its SHA-256 hash, computed at build), HSTS, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`. Legal pages are static HTML in the same deploy. Build-time config comes from environment variables (`REPVYN_*`), never from committed secrets; only public keys reach the client.

## Options Considered

### Option A: Cloudflare Pages (chosen)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Free |
| Scalability | Global CDN with Indian points of presence |
| Team familiarity | Static hosting |

**Pros:** free bandwidth; fast in India; headers file.
**Cons:** another dashboard.

### Option B: Vercel
**Pros:** good DX. **Cons:** commercial use needs the paid plan.

### Option C: Netlify
**Pros:** similar `_headers`. **Cons:** bandwidth limits on free plan.

## Consequences
- Easier: ship any time, no store review.
- Harder: iOS push only works once the app is added to the home screen (iOS 16.4+).
- Revisit: Expo apps for the stores (launch plan phase 4).

## Action Items
1. [x] `app/public/` (manifest, service worker, icons, legal pages, `_headers`), build copies them.
2. [ ] Aaditya: connect the folder's repository to Cloudflare Pages, build command `npm run app`, output `app/dist`, add the domain.
