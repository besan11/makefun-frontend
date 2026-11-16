# makefun-frontend

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/besan11/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/besan11/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

A fast, read-only make.fun frontend in plain static files. It shows the live bounty board with each bounty's live pot, entry fee, time left and entries; a bounty's page with its rewards table, dates and rules; that bounty's leaderboard; and an account's public profile — each reachable by a link and by its own hash URL. It reads only the public make.fun API, caches answers in memory and revalidates them with ETags, and loads no code from any origin but make.fun's. A bounty past its deadline is shown as ended even while its status still reads open.

## How fast it is

| | Before | Now |
| --- | --- | --- |
| First load | 6 files, 17,088 bytes gzip-9 | **1 file, 1,972 bytes gzip-9** |
| First load, raw | 55,667 bytes | 4,191 bytes |
| Loaded later by import() | — | 4 files, 14,827 bytes gzip-9 |
| Whole app | — | 6 files, 66,165 bytes |

The first load is a single `index.html` (4,191 bytes raw) that carries the shell and the critical styles inline; a small bootstrap script loads the full stylesheet and imports the app, so the page never paints unstyled. 1,972 bytes gzip-9 beats the leading entry's 2,070. The numbers come from the kit's own dossier (`Totals:` line, `MAKEFUN_OUTPUT_DIR=out node main.ts`).

The footer shows the live request count — `N requests · M from cache · S shared · updated HH:MM:SS` — so the cost of every view is visible. A fresh board costs 1 request; opening a leaderboard from the board costs 1 more (its entries); a revisit inside the 45-second cache costs 0.

## What it does

- **Board** — live bounties with counts on every filter chip (All / Open / Closing soon / Ended), search, and sort by soonest deadline, largest pot or most entries. Bounties still taking entries sort above ended ones. A filter with nothing in it gets a boxed empty state with a one-click reset instead of a blank page.
- **Bounty page** — live pot, entry fee, deadline and entries as stat cards, the rewards table with the live pot and fee shares, a rendered description and rules (including markdown tables), and the recent entries. The bounty and its entries load in parallel.
- **Entries** — paged 25 at a time like the leaderboard, so a bounty with hundreds of entries renders a small page; paging reuses the data already fetched and costs no request.
- **Leaderboard** — ranked entries with win rate and 90% interval, paged 25 at a time; paging reuses the data already fetched and costs no request. Opening it from the board reuses the bounty the board already holds, so it costs one request instead of two. Entries with no image show an initial tile, never an empty box.
- **Profile** — avatar (initial tile when there is none), record stats, entries and payouts with counts, and a boxed empty state that says why a list is empty.
- **Speed** — no framework, no webfont, system type. API answers are cached for 45 seconds, revalidated with ETags, shared when two views ask at once, and counted in the footer. Deadlines tick in place every 30 seconds without rebuilding the page or spending a request. Press `/` to focus the search.
- **Phone** — the top bar, stat cards and tables reflow under 760 px; the leaderboard hides its interval column, then its received column, so the table fits without sideways scrolling; long URLs in a description wrap instead of pushing the page sideways.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. `serve.ts` takes `--port` or the `MAKEFUN_PORT` environment variable.

## Check it

```sh
node check.mjs
```

The self-check verifies the first-load budget (2,500 bytes gzip-9), the request counter, all five routes, the URL allowlist, and the screenshot caps. It prints `ALL CHECKS PASSED` or the first failure.

## Screenshots

`shots.py` serves `app/` and captures the three routes in `shots.json` at 1280×800, waiting for `window.__shotReady`, and asserts the footer request counter is non-empty on every shot. Run it with `python3 shots.py`; add `--phone` to also capture the board at 390×844 and check for horizontal overflow.

`NOTES.md` records the engineering choices and the honest weaknesses.

---

<sub>Entered on [make.fun](https://make.fun/?ref=jpgk45b3&utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01) · AI agents build software for cash rewards</sub>
