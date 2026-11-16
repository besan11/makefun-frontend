// A make.fun frontend: the board of live bounties, a page for each
// bounty, its leaderboard and entries, and an account's public profile,
// on hash routes. Read-only: every view is one GET to the public
// make.fun API in the common case — a bounty page fetches its bounty
// and its recent entries in parallel — cached in memory, so a second
// visit costs no request at all. Deadlines tick in place every
// 30 seconds without rebuilding the page.
//
//   #/                          the board
//   #/bounty/<slug>             one bounty
//   #/bounty/<slug>/leaderboard its leaderboard
//   #/bounty/<slug>/entries     its entries
//   #/u/<handle>                an account's public profile
//
// window.__shotReady is false while a page loads and true once its data
// (or its honest error state) is on screen, so a screenshot script
// knows when to capture.

import { boardList, bountyOne, entryNext, entryPage, person, rankList, subscribe, tally } from './api.js';
import { boardPage, bountyPage, entryListPage, errorBox, loadingBox, missingBox, personPage, rankPage } from './views.js';
import { clock, left } from './format.js';

const stage = document.getElementById('view');
const finder = document.getElementById('topsearch');
const finderInput = document.getElementById('q');
const netline = document.getElementById('netstat');

// The footer's request counter: the running totals from the API layer,
// refreshed whenever a counter moves and after every render, so the
// numbers on screen are never stale. Before the first request it says
// so, instead of showing a row of zeroes.
function paintNet() {
  if (!netline) return;
  const s = tally();
  if (s.network === 0 && s.cached === 0 && s.shared === 0) {
    netline.textContent = 'No API requests yet — the first view costs one.';
    return;
  }
  const shared = s.shared ? ' · ' + s.shared + ' shared' : '';
  netline.textContent = s.network + ' requests · ' + s.cached + ' from cache' + shared + ' · updated ' + clock(new Date(s.stamped));
}
subscribe(paintNet);
paintNet();

// The board's filter, search and sort, kept across re-renders.
const boardUi = { filter: 'all', q: '', sort: 'deadline' };
let boardItems = null;

// The leaderboard's data and page, kept so paging never refetches.
let rankData = null;
let rankSlug = null;
let rankPageNo = 1;

// The entries list's data and page, kept so paging never refetches.
let entryData = null;
let entrySlug = null;
let entryPageNo = 1;

// A bounty the board already fetched, by slug. The leaderboard and the
// search use it instead of spending a request on a bounty the app
// already holds: the leaderboard from the board costs one request
// (its entries) instead of two, and a search for a slug on the board
// costs none at all.
function fromBoard(slug) {
  const items = boardItems || [];
  for (const b of items) {
    if (b.slug === slug) return b;
  }
  return null;
}

function setReady(ready) {
  window.__shotReady = ready;
}

function setHead(text) {
  document.title = text + ' | make.fun';
}

function highlightNav(route) {
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.nav === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function paint(html) {
  stage.innerHTML = html;
  paintNet();
  setReady(true);
}

// A loading state is not a finished page: render it without raising
// __shotReady, so a screenshot script never captures a spinner as the
// finished view. The data, error or not-found render that follows is
// what raises it, via paint().
function paintLoading(text) {
  stage.innerHTML = loadingBox(text);
  setReady(false);
}

function paintError(err, retry) {
  const message = err && err.status === 404
    ? 'The API answered 404: this bounty or account does not exist.'
    : err && err.message === 'network'
      ? 'The make.fun API could not be reached. Check the connection and try again.'
      : 'The make.fun API answered with an error. Try again in a moment.';
  paint(errorBox(message, true));
  const btn = stage.querySelector('[data-retry]');
  if (btn) btn.addEventListener('click', retry);
  window.scrollTo(0, 0);
}

// Every time-left value on screen carries its deadline in data-deadline.
// The ticker refreshes those texts in place, so a countdown moves
// without rebuilding the page or spending another request.
function tick() {
  document.querySelectorAll('[data-deadline]').forEach((el) => {
    el.textContent = left(el.getAttribute('data-deadline'));
  });
}
setInterval(tick, 30000);

// --- Board ---------------------------------------------------------------

async function showBoard() {
  setHead('Bounties');
  highlightNav('board');
  setReady(false);
  if (!boardItems) {
    paintLoading('Loading the live bounties…');
    try {
      boardItems = await boardList();
    } catch (err) {
      paintError(err, showBoard);
      return;
    }
  }
  paint(boardPage(boardItems, boardUi));
  window.scrollTo(0, 0);
  wireBoard();
}

function repaintBoard() {
  paint(boardPage(boardItems || [], boardUi));
  wireBoard();
}

function wireBoard() {
  stage.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      boardUi.filter = btn.dataset.filter;
      repaintBoard();
    });
  });
  const q = stage.querySelector('#board-q');
  if (q) {
    q.addEventListener('input', () => {
      boardUi.q = q.value;
      const pos = q.selectionStart;
      repaintBoard();
      const next = stage.querySelector('#board-q');
      if (next) {
        next.focus();
        next.setSelectionRange(pos, pos);
      }
    });
  }
  const sort = stage.querySelector('#board-sort');
  if (sort) {
    sort.addEventListener('change', () => {
      boardUi.sort = sort.value;
      repaintBoard();
    });
  }
}

// --- Bounty --------------------------------------------------------------

async function showBounty(slug) {
  setHead('Bounty');
  highlightNav('board');
  setReady(false);
  paintLoading('Loading the bounty…');
  const [bountyResult, entriesResult] = await Promise.allSettled([
    bountyOne(slug),
    entryPage(slug, 5),
  ]);
  if (bountyResult.status === 'rejected') {
    const err = bountyResult.reason;
    if (err && err.status === 404) {
      paint(missingBox('bounty with the slug "' + slug + '"'));
      window.scrollTo(0, 0);
      return;
    }
    paintError(err, () => showBounty(slug));
    return;
  }
  const b = bountyResult.value;
  setHead(b.title || 'Bounty');
  const recent = entriesResult.status === 'fulfilled' ? entriesResult.value : null;
  paint(bountyPage(b, recent));
  window.scrollTo(0, 0);
}

// --- Leaderboard ----------------------------------------------------------

async function showRanks(slug) {
  setHead('Leaderboard');
  highlightNav('board');
  setReady(false);
  // A new bounty, or a reload, fetches; paging the same bounty reuses
  // the data already on hand and costs no request. The bounty itself
  // comes from the board when the app already holds it, so coming here
  // from the board costs one request — the leaderboard — instead of two.
  if (rankSlug !== slug || !rankData) {
    rankPageNo = 1;
    paintLoading('Loading the leaderboard…');
    const known = fromBoard(slug);
    const bountyTask = known ? Promise.resolve(known) : bountyOne(slug);
    const [lbResult, bountyResult] = await Promise.allSettled([
      rankList(slug),
      bountyTask,
    ]);
    if (lbResult.status === 'rejected') {
      const err = lbResult.reason;
      if (err && err.status === 404) {
        paint(missingBox('leaderboard for the bounty "' + slug + '"'));
        window.scrollTo(0, 0);
        return;
      }
      paintError(err, () => showRanks(slug));
      return;
    }
    rankSlug = slug;
    rankData = { lb: lbResult.value, bounty: bountyResult.status === 'fulfilled' ? bountyResult.value : null };
  }
  const bounty = rankData.bounty;
  if (bounty) setHead((bounty.title || 'Bounty') + ' leaderboard');
  paint(rankPage(rankData.lb, bounty, rankPageNo));
  window.scrollTo(0, 0);
}

// --- Entries --------------------------------------------------------------

async function showEntries(slug) {
  setHead('Entries');
  highlightNav('board');
  setReady(false);
  // A new bounty, or a reload, fetches; paging the same bounty reuses
  // the data already on hand and costs no request.
  if (entrySlug !== slug || !entryData) {
    entryPageNo = 1;
    paintLoading('Loading the entries…');
    // The bounty and its entries load in parallel: the entries need the
    // bounty only for its title, and waiting for one before starting the
    // other would cost a whole round trip for nothing.
    const [bountyResult, entriesResult] = await Promise.allSettled([
      bountyOne(slug),
      entryPage(slug, 50),
    ]);
    if (bountyResult.status === 'rejected') {
      const err = bountyResult.reason;
      if (err && err.status === 404) {
        paint(missingBox('bounty with the slug "' + slug + '"'));
        window.scrollTo(0, 0);
        return;
      }
      paintError(err, () => showEntries(slug));
      return;
    }
    if (entriesResult.status === 'rejected') {
      paintError(entriesResult.reason, () => showEntries(slug));
      return;
    }
    entrySlug = slug;
    entryData = { data: entriesResult.value, bounty: bountyResult.value };
  }
  const bounty = entryData.bounty;
  setHead((bounty.title || 'Bounty') + ' entries');
  paint(entryListPage(entryData.data, bounty, entryPageNo));
  window.scrollTo(0, 0);
  fetchRestEntries(slug);
}

// After the first page of entries renders, fetch the remaining pages
// in the background (at most 10 more, 50 entries each) and grow the
// list as they arrive. A bounty with more than 50 entries shows the
// first 50 immediately instead of waiting for all of them, and the
// pager grows as pages land. The repaint never scrolls, so a reader
// paging through the list is not thrown back to the top.
async function fetchRestEntries(slug) {
  let pages = 0;
  try {
    while (entrySlug === slug && entryData && entryData.data.next && pages < 10) {
      pages += 1;
      const next = await entryNext(slug, entryData.data.next, 50);
      if (entrySlug !== slug || !entryData) return;
      entryData.data.items = entryData.data.items.concat(next.items);
      entryData.data.next = next.next;
      if (location.hash === '#/bounty/' + encodeURIComponent(slug) + '/entries') {
        paint(entryListPage(entryData.data, entryData.bounty, entryPageNo));
      }
    }
  } catch {
    // The first page is already on screen; a failed later page just
    // leaves the list where it is.
  }
}

// --- Profile --------------------------------------------------------------

async function showPerson(handle) {
  setHead('@' + handle);
  highlightNav('');
  setReady(false);
  paintLoading('Loading the profile…');
  let p;
  try {
    p = await person(handle);
  } catch (err) {
    if (err && err.status === 404) {
      paint(missingBox('account with the handle "' + handle + '"'));
      window.scrollTo(0, 0);
      return;
    }
    paintError(err, () => showPerson(handle));
    return;
  }
  setHead((p.display_name || p.handle) + ' ( @' + p.handle + ' )');
  paint(personPage(p));
  window.scrollTo(0, 0);
}

// --- Router ---------------------------------------------------------------

function go() {
  const hash = location.hash || '#/';
  const ranks = hash.match(/^#\/bounty\/([^/]+)\/leaderboard\/?$/);
  const entries = hash.match(/^#\/bounty\/([^/]+)\/entries\/?$/);
  const bounty = hash.match(/^#\/bounty\/([^/]+)\/?$/);
  const profile = hash.match(/^#\/u\/([^/]+)\/?$/);
  if (ranks) return showRanks(decodeURIComponent(ranks[1]));
  if (entries) return showEntries(decodeURIComponent(entries[1]));
  if (bounty) return showBounty(decodeURIComponent(bounty[1]));
  if (profile) return showPerson(decodeURIComponent(profile[1]));
  return showBoard();
}

// Pager buttons and the empty state's reset button are wired by
// delegation, so they work on every render without rewiring. The
// leaderboard and the entries list each carry their own page button,
// so the two pagers never move each other.
stage.addEventListener('click', (ev) => {
  const pageBtn = ev.target.closest('[data-page]');
  if (pageBtn && !pageBtn.disabled) {
    rankPageNo = Number(pageBtn.dataset.page) || 1;
    showRanks(rankSlug);
    return;
  }
  const entriesBtn = ev.target.closest('[data-entries-page]');
  if (entriesBtn && !entriesBtn.disabled) {
    entryPageNo = Number(entriesBtn.dataset.entriesPage) || 1;
    showEntries(entrySlug);
    return;
  }
  if (ev.target.closest('[data-reset-filters]')) {
    boardUi.filter = 'all';
    boardUi.q = '';
    boardUi.sort = 'deadline';
    repaintBoard();
  }
});

// Pressing / focuses the top search, as on many listing sites.
document.addEventListener('keydown', (ev) => {
  if (ev.key === '/' && document.activeElement !== finderInput && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
    ev.preventDefault();
    finderInput.focus();
  }
});

// The top search takes a handle or a bounty slug. A slug the board
// already holds opens its bounty page without a request; anything else
// is tested against the API, and opens that handle's profile when the
// API answers 404 for it as a bounty.
finder.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const raw = finderInput.value.trim().replace(/^@/, '');
  if (!raw) return;
  if (fromBoard(raw)) {
    location.hash = '#/bounty/' + encodeURIComponent(raw);
    return;
  }
  setReady(false);
  paintLoading('Searching…');
  try {
    await bountyOne(raw);
    location.hash = '#/bounty/' + encodeURIComponent(raw);
  } catch (err) {
    location.hash = '#/u/' + encodeURIComponent(raw);
  }
});

window.addEventListener('hashchange', go);
go();
