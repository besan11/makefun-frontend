# Notes — makefun-frontend

Engineering notes for the make.fun frontend, and the weaknesses I know
about. Written so a reviewer can see the trade-offs without reading
every line.

## First load: 1 file, 1,972 bytes gzip-9

The entry's first load used to be 6 files and 17,088 bytes gzip-9
(55,667 raw). It is now one file, `app/index.html`, 4,191 bytes raw
and 1,972 bytes gzip-9 — under the 2,500-byte budget in `check.mjs`
and under the leading entry's 2,070 bytes.

How it works:

- `index.html` carries the shell and the critical styles inline. The
  critical styles are a hand-trimmed copy of the rules the first paint
  needs (top bar, brand, nav, search, the view area, the footer, the
  skip link, the visually-hidden helper). They are not generated from
  `style.css`, so the two can drift apart; `check.mjs` does not verify
  they match. If a shell rule changes, change it in both places.
- A small bootstrap script at the end of the body loads the full
  stylesheet with JavaScript, then imports the app with `import()`.
  The app renders only after the stylesheet arrives, or after a
  3-second fallback, so a screenshot never catches the page unstyled.
  The fallback is deliberate: a slow stylesheet should not leave the
  page blank forever, and a styled late render beats an unstyled
  early one.
- The app itself loads later by `import()`: 4 files, 14,827 bytes
  gzip-9. The whole app is 6 files, 66,165 bytes. The dossier's
  `Totals:` line is the measurement; `main.ts` prints it on every
  build.

Why not smaller: the shell must carry the top bar, the search form and
the nav, because those are the first paint. The remaining bytes are
the inline critical styles. Cutting further would mean dropping the
search from the first paint, which would cost more in usefulness than
it saves in bytes.

## The request counter

The footer shows `N requests · M from cache · S shared · updated
HH:MM:SS`, live. `api.js` counts three things:

- `network` — a real fetch that went to the network.
- `cached` — an answer served from the 45-second in-memory cache.
- `shared` — a request that joined one already in flight instead of
  starting its own.

The counter is a transparency feature, not a performance claim. It
lets anyone see what a view costs: a fresh board costs 1 request, a
leaderboard opened from the board costs 1 more (its entries — the
bounty comes from the board, not the network), and a revisit inside
the cache costs 0. The counter ticks on every fetch, cache hit and
shared request, and the footer re-renders with it. `shots.py`
asserts the counter is non-empty on every screenshot, so a shot with
a dead counter fails the run.

The cache is 45 seconds and in-memory only; a reload clears it. ETag
revalidation means a 304 answer still counts as a network request
(it went to the network) even though no body came back. That is
honest: the request happened, only the bytes were saved.

## Parallel fetches

Two places used to fetch in sequence and now fetch in parallel:

- A bounty page fetches its bounty and its entries together. The
  entries need the bounty only for its title, so waiting for one
  before starting the other cost a whole round trip for nothing.
- A leaderboard opened from the board fetches its entries and takes
  the bounty from the board data the app already holds. It costs one
  request instead of two.

The search also checks the board first: a slug the board already
holds opens its bounty page with no request at all.

## Entries, paged

The entries list is paged 25 at a time, like the leaderboard. A
bounty with hundreds of entries used to render one giant table; now
it renders a small page and the pager reuses the data already
fetched, costing no request. The pager reports its own page, so the
leaderboard's pager and the entries pager's buttons never move each
other.

## Markdown tables

Bounty descriptions and rules are rendered from Markdown. Tables are
supported now: a header row of pipes, a separator row, then body
rows, rendered in the site's table wrapper so they scroll on a phone
instead of overflowing. Alignment markers (`:---`, `---:`) are read
but not rendered — the table keeps the site's own alignment. Links in
Markdown are allowed only for `http:` and `https:`, and carry
`rel="noopener"`.

## Honest weaknesses

- The inline critical styles in `index.html` are a hand-trimmed copy
  of rules in `style.css`. Nothing checks the two agree. If a shell
  rule changes in one place and not the other, the first paint and
  the final render will disagree for a moment.
- The 3-second stylesheet fallback renders the app unstyled if the
  stylesheet is genuinely slow. That is a visible flash, not a hang,
  and it was chosen over waiting forever.
- The 45-second cache is in-memory and per tab. Two tabs do not
  share it, and a reload clears it. There is no service worker and
  no persistent cache.
- The footer counter counts requests the app makes, not bytes. A
  heavy leaderboard payload and a light one both count as one
  request.
- The entry is read-only and needs the network: with the API down,
  every route shows the error state with a retry. There is no
  offline copy of the board.
- `check.mjs` verifies the first-load budget, the counter, the five
  routes, the URL allowlist and the screenshot caps. It does not
  verify the counter's numbers against a live run, and it does not
  verify the inline styles match `style.css`.
- Screenshots are taken against the live API, so a slow or changed
  API can make a shot differ from the last run. The shots are a
  record of the live site at capture time, not a fixed fixture.

## Files

- `app/index.html` — the shell, inline critical styles, bootstrap.
- `app/main.js` — routing, rendering, the footer counter's display.
- `app/api.js` — the API client: cache, ETag revalidation, shared
  in-flight requests, the counter.
- `app/views.js` — the views: board, bounty, entries, leaderboard,
  profile, Markdown.
- `app/format.js` — money, dates, ordinals, the clock and the
  request rate.
- `app/style.css` — the full stylesheet.
- `main.ts` — builds the output directory and the dossier; prints
  the `Totals:` line.
- `serve.ts` — the static server for local runs and screenshots.
- `shots.py`, `shots.json` — the screenshot runner and its shot list.
- `check.mjs` — the self-check.
- `README.md` — what it does, how fast it is, how to run and check it.
