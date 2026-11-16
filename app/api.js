// The make.fun public API, read-only GET requests, open to any origin.
// Answers are cached in memory, so a second visit to the same view
// costs no request at all, and a bounty the board already fetched is
// reused instead of fetched again. Two callers asking for the same
// answer at the same moment share one request in flight.
//
// The tally below is the app's honesty meter: every real fetch, every
// answer served from the memory cache, and every request that reused
// an answer the app already held is counted, and the footer shows the
// running total. A view that costs nothing after the first visit says
// so on screen.

const API_ROOT = "https://make.fun/api";

// Running totals, read by the footer through tally(). stamped is the
// time of the last change, so the footer can say when the numbers moved.
const tallyBox = { network: 0, cached: 0, shared: 0, stamped: 0 };
const watchers = new Set();

function bump(kind) {
  tallyBox[kind] += 1;
  tallyBox.stamped = Date.now();
  const snap = tally();
  for (const fn of watchers) {
    try { fn(snap); } catch { /* a watcher never breaks a fetch */ }
  }
}

// A snapshot of the counters, for the footer. A fresh copy each time,
// so a caller cannot move the app's own numbers.
export function tally() {
  return { network: tallyBox.network, cached: tallyBox.cached, shared: tallyBox.shared, stamped: tallyBox.stamped };
}

// Subscribe to counter changes. Returns an unsubscribe function.
export function subscribe(fn) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

// Answers fetched from the network, keyed by their full URL.
const answers = new Map();
// Requests already in flight, keyed the same way, so two callers
// asking at once share one fetch instead of starting two.
const pending = new Map();
// Bounties the board already fetched, keyed by slug, so a bounty page
// or leaderboard opened from the board reuses one instead of
// fetching it again.
const boardBounties = new Map();

async function pull(path) {
  const url = API_ROOT + path;
  const held = answers.get(url);
  if (held !== undefined) {
    bump('cached');
    return held;
  }
  const flying = pending.get(url);
  if (flying) {
    bump('shared');
    return flying;
  }
  const job = (async () => {
    bump('network');
    const res = await fetch(url);
    if (!res.ok) {
      const err = new Error('make.fun answered ' + res.status);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    answers.set(url, data);
    return data;
  })();
  pending.set(url, job);
  try {
    return await job;
  } finally {
    pending.delete(url);
  }
}

// The live board. activity=times leaves out the activity a board does
// not show. Every bounty on it is remembered by slug for reuse.
export async function boardList() {
  const data = await pull('/competitions?status=open&activity=times');
  const items = Array.isArray(data.items) ? data.items : [];
  for (const b of items) {
    if (b && typeof b.slug === 'string') boardBounties.set(b.slug, b);
  }
  return items;
}

// One bounty, by slug. When the board already holds it, reuse that
// copy and count it as shared instead of spending a request.
export async function bountyOne(slug) {
  const known = boardBounties.get(slug);
  if (known) {
    bump('shared');
    return known;
  }
  return pull('/competitions/' + encodeURIComponent(slug));
}

// A bounty's entries, newest first: the first page of its submissions.
// Returns { items, next } where next is the cursor for the page after,
// or null when there is no next page.
export async function entryPage(slug, limit = 50) {
  const data = await pull('/competitions/' + encodeURIComponent(slug) + '/submissions?limit=' + limit);
  return { items: Array.isArray(data.items) ? data.items : [], next: data.next_cursor || null };
}

// The next page of a bounty's entries, after a cursor from entryPage.
export async function entryNext(slug, cursor, limit = 50) {
  const data = await pull('/competitions/' + encodeURIComponent(slug) + '/submissions?limit=' + limit + '&cursor=' + encodeURIComponent(cursor));
  return { items: Array.isArray(data.items) ? data.items : [], next: data.next_cursor || null };
}

// A bounty's leaderboard: { entries: [...] } ranked by judge win rate.
export async function rankList(slug) {
  return pull('/competitions/' + encodeURIComponent(slug) + '/leaderboard');
}

// An account's public profile, by handle.
export async function person(handle) {
  return pull('/profiles/' + encodeURIComponent(handle));
}
