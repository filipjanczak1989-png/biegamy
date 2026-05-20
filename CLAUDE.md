# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BiegaMy** is a Progressive Web App (PWA) for professional running coaching, deployed on GitHub Pages with Supabase as the backend. It has two main surfaces:
- A coaching platform (`zawodnik.html` as the main athlete hub, `trener.html` for coach)
- An integrated narrative game called "Janusz Run" (`gra.html`)

No build step exists — vanilla HTML/CSS/JS files deploy directly to GitHub Pages.

## Deployment

Push to `main` to deploy. A GitHub Actions workflow (`.github/workflows/auto-bump.yml`) automatically bumps the `CACHE_VERSION` constant in `sw.js` on every deploy, which invalidates the Service Worker cache for all clients.

Assets (images, audio) live in a separate repo `biegamy-assets`, served via GitHub Pages at a different origin.

## Architecture

### Technology Stack
- **Vanilla JavaScript** (ES6+, async/await throughout), HTML5, CSS3 — no framework, no npm, no build tools
- **Supabase** — PostgreSQL backend + auth; global client initialized in `sb.js` and injected into every page
- **Service Worker** (`sw.js`) — offline-first with 4 caching strategies: stale-while-revalidate, cache-first, network-first, network-only
- **Web Push API** — push notification helpers in `sb.js`
- **GitHub Pages** — static hosting

### Page Structure
- `zawodnik.html` — main athlete dashboard (~3.8 MB, the largest/most complex page)
- `gra.html` — Janusz Run game (~421 KB)
- Other pages (67–157 KB): training plans, community, profile, etc.
- `offline.html` — shown by Service Worker when offline and no cache exists

### Supabase / Auth
`sb.js` creates the global Supabase client (available as `window.supabase` everywhere). All auth, database reads/writes, and push notification subscriptions go through this client. Never import another Supabase client; always use the global `supabase` from `sb.js`.

### Service Worker (`sw.js`)
Cache version is in the `CACHE_VERSION` constant at the top of `sw.js`. The GitHub Actions workflow updates this automatically — do not manually edit it unless intentionally overriding. SW communicates with pages via `postMessage` for push notification registration.

### Janusz Run Game Engine (`js/janusz/`)
A narrative RPG engine integrated with real training data. Key files:
- `engine.js` — main game loop and state machine
- `states.js` — 6 psychology states (Wypalony, Załamany, Odrodzony, W ogniu, Głodny zwycięstwa, Wątpliwości)
- `actions.js` — life event system (run, work, eat, sleep, call Anna, go to bar, etc.)
- `shop.js` — shoe marketplace with durability mechanics
- `achievements.js` — 10+ milestones tied to real training data
- `workouts.js` — integration between real training sessions and game attributes
- `data/events.json` — 50+ narrative events

Game attributes: `energia`, `morale`, `determinacja`, `kapital` (currency), `kondycja`. All game logic and UI is in Polish.

### Security Notes
- XSS: use `renderMessageBody()` (unified renderer, added May 2026) for any user-generated content — never set `innerHTML` directly with untrusted data
- All community posts and chat messages must go through this renderer

## Conventions
- Polish-first naming: variable names, comments, and UI text are in Polish throughout the game layer and much of the main app
- No TypeScript, no linting tooling — consistency is maintained by convention
- No comments by default; code is self-documenting via naming
