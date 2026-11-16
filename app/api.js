// make.fun public API, read-only GET. The API answers any origin (CORS) and
// its ETags are bound to the minute, so answers are cached in memory and
// revalidated with If-None-Match. One view costs one request in the common
// case; a second visit inside the cache window costs none, and two views
// that ask for the same answer at the same moment share one request.

const API = 'https://make.fun/api';
const FRESH_MS = 45 * 1000;

const cache = new Map();
const inflight = new Map();

// What this session has cost so far: real network fetches, answers served
// from the cache instead, and requests shared with one already in flight.
// The footer shows it, so the price of a session is visible next to the
// data it bought. A listener never breaks a fetch: its errors are caught.
const stats = { fetches: 0, cacheHits: 0, shared: 0 };
const statListeners = new Set();

export function requestStats() {
  return { ...stats };
}

export function onRequestStats(fn) {
  statListeners.add(fn);
  return () => statListeners.delete(fn);
}

function noteStats() {
  const snapshot = { ...stats };
  statListeners.forEach((fn) => {
    try { fn(snapshot); } catch { /* stats stay silent */ }
  });
}

function cacheKey(path) {
  return path;
}

async function fetchOnce(path, hit) {
  const headers = {};
  if (hit && hit.etag) headers['If-None-Match'] = hit.etag;
  stats.fetches++;
  noteStats();
  let res;
  try {
    res = await fetch(API + path, { headers });
  } catch (err) {
    if (hit) return hit.data;
    throw new Error('network');
  }
  if (res.status === 304 && hit) {
    hit.at = Date.now();
    return hit.data;
  }
  if (!res.ok) {
    if (hit) return hit.data;
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
  if (hit && Date.now() - hit.at < FRESH_MS) {
    stats.cacheHits++;
    noteStats();
    return hit.data;
  }
  const pending = inflight.get(key);
  if (pending) {
    stats.shared++;
    noteStats();
    return pending;
  }
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
