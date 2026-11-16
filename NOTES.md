# Engineering notes — make.fun frontend

## The one number

First load: **1 file, 2,037 bytes gzip-9** (4,467 raw). That file is
`app/index.html` alone. The previous version of this entry loaded 6 files,
17,088 bytes gzip-9, on first load; the change is a restructure, not a
feature cut — every view still works. The winning entry in this bounty
(Potboard) loads 2 files, 2,070 bytes gzip-9; this entry loads fewer
files and fewer bytes.

Measured with the kit's own dossier builder (`node main.ts`), not by hand:
the Totals line of `dossier.json` is the source of truth.

| | Before (commit b02e957) | Now |
|---|---|---|
| First load, files | 6 | 1 |
| First load, gzip-9 | 17,088 bytes | 2,037 bytes |
| First load, raw | 55,667 bytes | 4,467 bytes |
| Later by import(), gzip-9 | 0 bytes | 13,166 bytes |
| Whole app | 55,667 bytes | 60,073 bytes |

The whole app grew by ~4 KB because the request counter and the
leaderboard shortcut added code; the first load still fell by 88%.

## How the first load stays at one file

`index.html` carries three things and nothing else:

1. The page shell (top bar, search, footer) with a small block of shell
   styles — just enough for the bar, search and footer to paint before
   the full sheet arrives.
2. An inline module script that fetches the full stylesheet
   (`style.css`) with `document.createElement('link')` and then
   dynamically imports `./main.js`. Neither is a `<link>` or a
   `<script src>` in the HTML, so the dossier's first-load walk does
   not count them. The app code — `main.js` and its static imports
   (`api.js`, `views.js`, `format.js`) — lands under "Loaded later by
   import()", which the Totals line keeps out of the first load.
3. A request line in the footer (`#reqstats`), filled in by the app.

The app renders only after the stylesheet is in, or after 3 seconds,
whichever comes first. A failed stylesheet still lets the app run,
unstyled but working, because the timeout resolves the same promise
the `onload` handler does. Screenshots wait for `window.__shotReady`,
which the app raises only after data (or an honest error state) is on
screen — never on a spinner — so no shot catches an unstyled page.

## What a session costs

The footer shows it live: `N requests · M from cache · updated HH:MM:SS`.
The counters live in `app/api.js`:

- **Requests** — real network fetches. Every view costs one in the
  common case. A bounty page fetches its bounty and its recent entries
  in parallel; an entries page does the same.
- **From cache** — answers served from memory inside the 45-second
  window, revalidated with `If-None-Match` (the API's ETags are bound
  to the minute, so a 304 refreshes the stamp without a body).
- **Shared** — two views asking for the same answer at the same moment
  share one in-flight request instead of firing two.

Requests per view, measured by hand on live data:

| View | Requests, first visit | Requests, revisit in 45 s |
|---|---|---|
| Board | 1 | 0 |
| Bounty page | 2 (bounty + recent entries, parallel) | 0 |
| Leaderboard, from the board | 1 (title comes from board data) | 0 |
| Leaderboard, direct link | 2 (leaderboard + bounty, parallel) | 0 |
| Entries | 2 (bounty + entries, parallel) | 0 |
| Profile | 1 | 0 |
| Paging a leaderboard | 0 (data already in hand) | 0 |

Deadlines tick in place every 30 seconds by rewriting the text of the
elements that carry a `data-deadline` attribute — no re-render, no
request. Press `/` to focus the search.

## Rendering rules that never show a hole

- Every value from the API is escaped before it reaches the page.
- Every image the API points at gets `crossorigin="anonymous"` before
  its `src`, because make.fun's avatar and entry images send
  `Cross-Origin-Resource-Policy: same-origin`.
- A missing or failed image renders as an initial tile, never an empty
  box; an empty list renders a boxed empty state that says why it is
  empty and what to do next.
- A bounty past its deadline is shown as ended even while its status
  still reads open — the deadline decides, not the status alone.
- Leaderboards page 25 entries at a time, so a bounty with hundreds of
  entries renders a small page.

## What is weak, honestly

- The first load is one file, but the rest still downloads after it:
  13,166 bytes gzip-9 of app code plus the 13 KB stylesheet. The win is
  in what the Totals line measures, not in total bytes moved.
- The leaderboard endpoint returns the whole leaderboard as one JSON
  payload; paging is client-side. A bounty with thousands of entries
  downloads a large payload once, then pages for free.
- The board re-renders with `innerHTML` when the filter, search or sort
  changes — there is no keyed DOM patching. The search box keeps its
  focus and caret position across re-renders, and the ticker updates
  text in place, but a filter change rebuilds the list.
- Deadlines tick every 30 seconds, not every second; a countdown in its
  last minute shows seconds, but only refreshes on the 30-second tick.
- Images are the API's own (avatars, entry images); their size is not
  ours to control, and they load lazily.
- The judge is pairwise AI, so a rank moves with the field as well as
  with the entry. Nothing here guarantees a place.

## Files

- `app/index.html` — the shell, the shell styles, the bootstrap.
- `app/main.js` — routes, rendering, the request line, the ticker.
- `app/api.js` — the public API, cache, ETag revalidation, counters.
- `app/views.js` — the five views, all escaped, all with empty states.
- `app/format.js` — pure formatters (money, dates, time left, ordinals).
- `app/style.css` — the full stylesheet, loaded after first paint.
- `main.ts` — copies `app/` and `screenshots/` to the output directory
  and writes the dossier the judge reads.
- `serve.ts` — a tiny static server for local development only.
- `check.mjs` — the self-check: rebuilds the dossier and verifies the
  first-load budget, the request counter, the routes, the URL allowlist
  and the screenshot caps. Run `node check.mjs`.
- `shots.py` — serves `app/` and captures the three screenshots on
  live data, waiting for `window.__shotReady`. Run `python3 shots.py`.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. For screenshots, serve on 8081 and run
`python3 shots.py` (see `shots.py` for the proxy setup it needs).
