// make.fun public API, read-only GET. The API answers any origin (CORS) and
// its ETags are bound to the minute, so answers are cached in memory and
// revalidated with If-None-Match. One view costs one request in the common
// case; a second visit inside the cache window costs none, and two views
// that ask for the same answer at the same moment share one request.
//
// The counter below is the app's honesty meter: every real fetch, every
// answer served from the memory cache, and every request that joined one
// already in flight is counted, and the footer shows the running total.
// A view that costs nothing after the first visit says so on screen.

const API = 'https://make.fun/api';
const FRESH_MS = 45 * 1000;

const cache = new Map();
const inflight = new Map();

// Running totals, read by the footer through stats(). updatedAt is the
// time of the last change, so the footer can say when the numbers moved.
const counts = { network: 0, cached: 0, shared: 0, updatedAt: 0 };
const listeners = new Set();

function note() {
  counts.updatedAt = Date.now();
  const snapshot = stats();
  listeners.forEach((fn) => {
    try { fn(snapshot); } catch { /* a listener never breaks a fetch */ }
  });
}

// A snapshot of the counters, for the footer. A fresh copy each time, so
// a caller cannot move the app's own numbers.
export function stats() {
  return { network: counts.network, cached: counts.cached, shared: counts.shared, updatedAt: counts.updatedAt };
}

// Subscribe to counter changes. Returns an unsubscribe function.
export function onStats(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function cacheKey(path) {
  return path;
}

async function fetchOnce(path, hit) {
  const headers = {};
  if (hit && hit.etag) headers['If-None-Match'] = hit.etag;
  let res;
  counts.network += 1;
  note();
  try {
    res = await fetch(API + path, { headers });
  } catch (err) {
    if (hit) { counts.cached += 1; note(); return hit.data; }
    throw new Error('network');
  }
  if (res.status === 304 && hit) {
    hit.at = Date.now();
    counts.cached += 1;
    note();
    return hit.data;
  }
  if (!res.ok) {
    if (hit) { counts.cached += 1; note(); return hit.data; }
    const err = new Error('http ' + res.status);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  cache.set(cacheKey(path), { data, etag: res.headers.get('etag'), at: Date.now() });
  return data;
}

async function get(path) {
  const key = cacheKey(path);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) { counts.cached += 1; note(); return hit.data; }
  const pending = inflight.get(key);
  if (pending) { counts.shared += 1; note(); return pending; }
  const task = fetchOnce(path, hit).finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

// The live board. activity=times leaves out the activity a board does not show.
export function getBounties(status) {
  const q = status ? '?status=' + encodeURIComponent(status) + '&activity=times' : '?activity=times';
  return get('/competitions' + q);
}

// One bounty, by slug.
export function getBounty(slug) {
  return get('/competitions/' + encodeURIComponent(slug));
}

// A bounty's leaderboard: { entries: [...] }.
export function getLeaderboard(slug) {
  return get('/competitions/' + encodeURIComponent(slug) + '/leaderboard');
}

// A bounty's entries, newest first.
export function getEntries(slug, limit) {
  const n = limit || 20;
  return get('/competitions/' + encodeURIComponent(slug) + '/submissions?limit=' + n);
}

// An account's public profile, by handle.
export function getProfile(handle) {
  return get('/profiles/' + encodeURIComponent(handle));
}

// A bounty's entry fee and vault.
export function getEntryFee(slug) {
  return get('/competitions/' + encodeURIComponent(slug) + '/entry-fee');
}
