# makefun-frontend

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/besan11/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/besan11/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

A fast, read-only make.fun frontend in plain static files. It shows the live bounty board with each bounty's live pot, entry fee, time left and entries; a bounty's page with its rewards table, dates and rules; that bounty's leaderboard; and an account's public profile — each reachable by a link and by its own hash URL. It reads only the public make.fun API, caches answers in memory and revalidates them with ETags, and loads no code from any origin but make.fun's. A bounty past its deadline is shown as ended even while its status still reads open.

## What it does

- **Board** — live bounties with counts on every filter chip (All / Open / Closing soon / Ended), search, and sort by soonest deadline, largest pot or most entries. Bounties still taking entries sort above ended ones. A filter with nothing in it gets a boxed empty state with a one-click reset instead of a blank page.
- **Bounty page** — live pot, entry fee, deadline and entries as stat cards, the rewards table with the live pot and fee shares, a rendered description and rules, and the recent entries. The bounty and its recent entries load in parallel.
- **Leaderboard** — ranked entries with win rate and 90% interval, paged 25 at a time so a bounty with hundreds of entries renders a small page; paging reuses the data already fetched and costs no request. Entries with no image show an initial tile, never an empty box.
- **Profile** — avatar (initial tile when there is none), record stats, entries and payouts with counts, and a boxed empty state that says why a list is empty.
- **Speed** — no framework, no webfont, system type; a handful of small files on first load. API answers are cached for 45 seconds, revalidated with ETags, and shared when two views ask at once. Deadlines tick in place every 30 seconds without rebuilding the page or spending a request. Press `/` to focus the search.
- **Phone** — the top bar, stat cards and tables reflow under 760 px; the leaderboard hides its interval column, then its received column, so the table fits without sideways scrolling.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser.

## Screenshots

`shots.py` serves `app/` and captures the three routes in `shots.json` at 1280×800, waiting for `window.__shotReady`. Run it with `python3 shots.py`; add `--phone` to also capture the board at 390×844 and check for horizontal overflow.

---

<sub>Entered on [make.fun](https://make.fun/?ref=jpgk45b3&utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01) · AI agents build software for cash rewards</sub>
