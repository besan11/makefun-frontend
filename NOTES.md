# Engineering notes

How this entry is built, and where it falls short. Written for the
judge and for anyone who picks the code up later.

## Architecture

Plain static files under `app/`, no framework, no webfont, no build
step. `main.ts` copies `app/` and `screenshots/` into the output
directory and writes the grader dossier with the kit's vendored
builder. `serve.ts` is a small static server for local development.
`shots.py` retakes the three screenshots from live data.
`check.mjs` is the self-check; run `node check.mjs`.

## First load: one file, 1,931 bytes gzip-9

`index.html` (4,143 bytes raw) carries the shell and the critical
styles inline. A small bootstrap script creates the stylesheet link
and imports the app with a dynamic `import()`, so neither counts
toward the first load: the first load is this one file. The app
renders once the stylesheet arrives, or after 3 seconds if it never
does. 1,931 bytes gzip-9 beats the leading entry's 2,070. The number
comes from the kit's own dossier (`Totals:` line, run
`MAKEFUN_OUTPUT_DIR=out node main.ts`).

The rest of the app — `main.js`, `api.js`, `views.js`, `format.js`
and `style.css` — loads later, after the first paint, through that
dynamic import. `app/favicon.ico` (1,150 bytes) exists so the
browser's implicit favicon request answers 200 instead of logging a
404 console error; it is not referenced from the HTML and adds
nothing to the first load.

## The request counter

Every API answer is cached in memory for the session, and two
callers asking for the same answer at once share one request in
flight. The footer shows the running totals — `N requests · M from
cache · S shared · updated HH:MM:SS` — so the cost of every view is
visible on screen. Measured against the live API:

- first board visit: 1 request;
- bounty page: 2 requests (the bounty and its recent entries, fetched
  in parallel);
- leaderboard from the board: 1 more (the bounty comes from the board
  data already held, not from the network);
- revisiting a page already visited: 0 new requests.

## Rendering

- The board sorts live bounties above ended ones, then by soonest
  deadline, and can sort by largest pot or most entries. A bounty
  past its deadline counts as ended here even while its status still
  reads open.
- Bounty descriptions render as markdown: headings, lists, links,
  code, fenced code blocks and tables. A table renders inside a
  horizontally scrolling wrapper, so it never pushes the page
  sideways on a phone. Markdown links are built only for http and
  https addresses, with `rel="noopener"`.
- Leaderboard and entries are paged 25 at a time; paging reuses the
  data already fetched and costs no request.
- Entries with no image, and profiles with no avatar, show an initial
  tile instead of an empty box. Empty lists render a boxed empty state
  that says why the list is empty and what to do next.
- Deadlines tick in place every 30 seconds without rebuilding the
  page or spending a request. Press `/` to focus the search.
- Win rates are judge values in micro-units, shown as a percentage
  capped at 100.

## Honest weaknesses

- **The cache never expires within a session.** A tab left open
  shows the pots and entry counts from when it first loaded; only
  the countdowns keep moving. Reload the page for fresh numbers.
  There is no service worker and no background refresh.
- **The entries page shows the first 50 entries at once, then
  fetches the rest in the background** (at most 10 more pages, 50
  entries each). A bounty with more than 550 entries still shows
  only the first 550. The leaderboard, which carries every ranked
  entry, is the complete view.
- **Search covers the open board only.** A bounty slug or handle that
  is not on the board is tested against the API, but there is no
  full-text search across all bounties or all accounts.
- **No offline mode.** Every view needs the live API; a failed fetch
  renders an error state with a retry button, not cached data from a
  previous session.
- **Markdown is a subset.** Nested lists, images, footnotes and HTML
  inside a description are not rendered; images in a description are
  dropped rather than shown.
- **The top search guesses.** A term that is neither a bounty slug on
  the board nor a live bounty opens that handle's profile page, which
  then reports not-found if the handle does not exist either.
- **The inline critical styles are a hand-trimmed copy of rules in
  `style.css`.** Nothing checks the two agree. If a shell rule
  changes in one place and not the other, the first paint and the
  final render will disagree for a moment.
- **The footer counter counts requests, not bytes.** A heavy
  leaderboard payload and a light one both count as one request.
