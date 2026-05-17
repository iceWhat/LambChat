# LambChat PWA Optimization Design

Date: 2026-05-17

## Goal

Improve LambChat's PWA experience in a low-risk pass, prioritizing update reliability, visible offline status, install metadata quality, and cache correctness. The implementation should preserve the current dynamic chat behavior: API, SSE, WebSocket, and tool routes must keep bypassing service worker runtime caches.

## Current State

- `frontend/src/sw.ts` uses `vite-plugin-pwa` with Workbox `injectManifest`.
- The service worker precaches the Vite manifest, serves navigation requests with `NetworkFirst`, provides `/offline.html` as fallback, caches same-origin static assets, caches Google font styles/files, and handles push notification clicks.
- `frontend/src/pwa.ts` registers `/sw.js`, watches for waiting updates, and exposes `activateWaitingLambChatPwaUpdate`.
- `frontend/src/pwaRouting.ts` classifies backend, streaming, navigation, and static asset requests.
- `frontend/public/manifest.json` already includes install metadata, shortcuts, maskable icon entries, and wide/narrow screenshots.
- `nginx/nginx.conf` gives long cache headers to `/assets/`, shorter cache headers to `/icons/`, `/images/`, and `/manifest.json`.
- Existing tests cover PWA guards, routing, manifest metadata, service worker source checks, offline fallback, and notification click handling.

## Recommended Approach

Use a staged "safe full pass":

1. Add user-visible update handling.
2. Add user-visible online/offline state.
3. Tighten cache headers and routing guardrails.
4. Refine manifest/install details where they do not create compatibility risk.

This keeps the work incremental and testable while avoiding advanced offline data features that would touch authentication, privacy, and synchronization semantics.

## Update Experience

Add an app-level PWA update prompt that listens for `PWA_UPDATE_AVAILABLE_EVENT`.

Behavior:

- When a new waiting service worker is detected, show a compact banner or toast.
- The primary action activates `activateWaitingLambChatPwaUpdate(registration)`.
- Once the controller changes, the existing `pwa.ts` flow reloads the page.
- If activation returns `false`, dismiss or keep the prompt without forcing reload.

Constraints:

- Do not auto-refresh while the user is chatting.
- Keep the prompt small and non-blocking.
- Reuse existing event and activation helpers instead of registering a second service worker watcher.

Tests:

- Event listener stores the registration and renders the update prompt.
- Clicking the update action calls the activation helper.
- No prompt appears when no update event is fired.

## Offline And Reconnect Experience

Add a global online/offline notice using browser `online` and `offline` events.

Behavior:

- When offline, show a compact notice that chat, files, and sync may pause.
- When online again, show a short reconnecting/restored state or dismiss the offline notice.
- Keep API, SSE, and WebSocket requests uncached and handled by the existing application/network flows.
- Improve `/offline.html` with a retry action and a home/chat link, keeping it static and dependency-free.

Constraints:

- Do not implement message queueing or offline writes in this pass.
- Do not store chat/session data in browser caches or IndexedDB.
- Keep offline copy clear but brief.

Tests:

- Online status helper or component responds to `online` and `offline` events.
- Service worker tests continue proving navigation fallback exists.

## Cache Strategy

Keep current Workbox strategy boundaries:

- Navigation: `NetworkFirst`, with `/offline.html` or `/index.html` fallback.
- Static same-origin assets: `StaleWhileRevalidate`, capped by expiration.
- Google font CSS: `StaleWhileRevalidate`.
- Google font files: `CacheFirst`.
- Backend, SSE, WebSocket, and dynamic tool paths: bypass.

Refinements:

- Add or keep tests proving `/api`, `/ws`, `/health`, `/tools`, `/human`, `/services`, agent routes, and event streams bypass service worker caches.
- Consider increasing stable icon cache TTL in nginx to match their immutable nature.
- Prefer a short or no-cache policy for `/manifest.json` and `/sw.js` so install/update metadata is not stale.
- Keep hashed `/assets/` immutable.

## Manifest And Install Metadata

Keep the current manifest structure and make only compatibility-safe refinements:

- Keep `id`, `scope`, `display`, `display_override`, shortcuts, screenshots, and maskable icons.
- Optionally change `start_url` to include a source marker such as `/?source=pwa` if analytics or routing needs it.
- Add a dedicated notification badge icon only if a suitable monochrome asset exists.
- Avoid changing icon files in this pass unless the existing maskable safe area is known to be poor.

## Non-Goals

- Offline chat composition queue.
- Offline session history storage.
- Background sync.
- Push subscription provisioning changes.
- Major visual redesign of the app shell.
- New PWA library or service worker strategy rewrite.

## Implementation Boundaries

Likely files:

- `frontend/src/pwa.ts`
- `frontend/src/pwaGuards.ts`
- `frontend/src/pwaRouting.ts`
- `frontend/src/App.tsx` or an app layout component
- `frontend/src/components/...` for the update/offline prompt
- `frontend/public/offline.html`
- `frontend/public/manifest.json`
- `frontend/src/__tests__/...`
- `nginx/nginx.conf`

Before editing shared UI files, inspect current app layout and existing toast/banner patterns. Existing uncommitted user changes in frontend styling/auth/sidebar files must be preserved.

## Verification

Run targeted checks first:

- PWA guard/routing/source tests.
- Any new component tests for update and online/offline UI.
- `pnpm build` or at least `tsc -b` in `frontend`.

Manual checks:

- Production build registers `/sw.js`.
- Offline navigation serves fallback.
- Dynamic API/SSE/WS requests are not served from runtime caches.
- Update prompt appears when a waiting worker exists and reloads only after activation.
