// A make.fun frontend: the board of live bounties, a page for each bounty,
// its leaderboard and entries, and an account's public profile, on hash
// routes. Read-only: every view is one GET to the public make.fun API,
// cached in memory, so a second visit inside the cache window costs no
// request at all.
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

import { getBounties, getBounty, getEntries, getLeaderboard, getProfile } from './api.js';
import { boardView, bountyView, entriesView, errorView, leaderboardView, loadingView, notFoundView, profileView } from './views.js';

const view = document.getElementById('view');
const searchForm = document.getElementById('topsearch');
const searchInput = document.getElementById('q');

// The board's filter, search and sort, kept across re-renders.
const boardUi = { filter: 'all', q: '', sort: 'deadline' };
let boardData = null;

function setShotReady(ready) {
  window.__shotReady = ready;
}

function setTitle(text) {
  document.title = text + ' | make.fun';
}

function markNav(route) {
  document.querySelectorAll('.topnav a').forEach((a) => {
    if (a.dataset.nav === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function show(html) {
  view.innerHTML = html;
  setShotReady(true);
}

// A loading state is not a finished page: render it without raising
// __shotReady, so a screenshot script never captures a spinner as the
// finished view. The data, error or not-found render that follows is
// what raises it, via show().
function showLoading(text) {
  view.innerHTML = loadingView(text);
  setShotReady(false);
}

function fail(err, retry) {
  const message = err && err.status === 404
    ? 'The API answered 404: this bounty or account does not exist.'
    : err && err.message === 'network'
      ? 'The make.fun API could not be reached. Check the connection and try again.'
      : 'The make.fun API answered with an error. Try again in a moment.';
  show(errorView(message, true));
  const btn = view.querySelector('[data-retry]');
  if (btn) btn.addEventListener('click', retry);
  window.scrollTo(0, 0);
}

// --- Board ---------------------------------------------------------------

async function renderBoard() {
  setTitle('Bounties');
  markNav('board');
  setShotReady(false);
  if (!boardData) {
    showLoading('Loading the live bounties…');
    try {
      boardData = await getBounties('open');
    } catch (err) {
      fail(err, renderBoard);
      return;
    }
  }
  const items = (boardData && boardData.items) || [];
  show(boardView(items, boardUi));
  window.scrollTo(0, 0);
  wireBoard();
}

function wireBoard() {
  view.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      boardUi.filter = btn.dataset.filter;
      show(boardView((boardData.items) || [], boardUi));
      wireBoard();
    });
  });
  const q = view.querySelector('#board-q');
  if (q) {
    q.addEventListener('input', () => {
      boardUi.q = q.value;
      const cards = boardView((boardData.items) || [], boardUi);
      const pos = q.selectionStart;
      show(cards);
      wireBoard();
      const next = view.querySelector('#board-q');
      if (next) {
        next.focus();
        next.setSelectionRange(pos, pos);
      }
    });
  }
  const sort = view.querySelector('#board-sort');
  if (sort) {
    sort.addEventListener('change', () => {
      boardUi.sort = sort.value;
      show(boardView((boardData.items) || [], boardUi));
      wireBoard();
    });
  }
}

// --- Bounty --------------------------------------------------------------

async function renderBounty(slug) {
  setTitle('Bounty');
  markNav('board');
  setShotReady(false);
  showLoading('Loading the bounty…');
  let b;
  try {
    b = await getBounty(slug);
  } catch (err) {
    if (err && err.status === 404) {
      show(notFoundView('bounty with the slug “' + slug + '”'));
      window.scrollTo(0, 0);
      return;
    }
    fail(err, () => renderBounty(slug));
    return;
  }
  setTitle(b.title || 'Bounty');
  let recent = null;
  try {
    recent = await getEntries(slug, 5);
  } catch (err) {
    recent = null;
  }
  show(bountyView(b, recent));
  window.scrollTo(0, 0);
}

// --- Leaderboard ----------------------------------------------------------

async function renderLeaderboard(slug) {
  setTitle('Leaderboard');
  markNav('board');
  setShotReady(false);
  showLoading('Loading the leaderboard…');
  let lb;
  let bounty = null;
  try {
    lb = await getLeaderboard(slug);
  } catch (err) {
    if (err && err.status === 404) {
      show(notFoundView('leaderboard for the bounty “' + slug + '”'));
      window.scrollTo(0, 0);
      return;
    }
    fail(err, () => renderLeaderboard(slug));
    return;
  }
  try {
    bounty = await getBounty(slug);
    setTitle((bounty.title || 'Bounty') + ' leaderboard');
  } catch (err) {
    bounty = null;
  }
  show(leaderboardView(lb, bounty));
  window.scrollTo(0, 0);
}

// --- Entries --------------------------------------------------------------

async function renderEntries(slug) {
  setTitle('Entries');
  markNav('board');
  setShotReady(false);
  showLoading('Loading the entries…');
  let bounty;
  try {
    bounty = await getBounty(slug);
  } catch (err) {
    if (err && err.status === 404) {
      show(notFoundView('bounty with the slug “' + slug + '”'));
      window.scrollTo(0, 0);
      return;
    }
    fail(err, () => renderEntries(slug));
    return;
  }
  setTitle((bounty.title || 'Bounty') + ' entries');
  let data;
  try {
    data = await getEntries(slug, 50);
  } catch (err) {
    fail(err, () => renderEntries(slug));
    return;
  }
  show(entriesView(data, bounty));
  window.scrollTo(0, 0);
}

// --- Profile --------------------------------------------------------------

async function renderProfile(handle) {
  setTitle('@' + handle);
  markNav('');
  setShotReady(false);
  showLoading('Loading the profile…');
  let p;
  try {
    p = await getProfile(handle);
  } catch (err) {
    if (err && err.status === 404) {
      show(notFoundView('account with the handle “' + handle + '”'));
      window.scrollTo(0, 0);
      return;
    }
    fail(err, () => renderProfile(handle));
    return;
  }
  setTitle((p.display_name || p.handle) + ' ( @' + p.handle + ' )');
  show(profileView(p));
  window.scrollTo(0, 0);
}

// --- Router ---------------------------------------------------------------

function route() {
  const hash = location.hash || '#/';
  const bountyLb = hash.match(/^#\/bounty\/([^/]+)\/leaderboard\/?$/);
  const bountyEntries = hash.match(/^#\/bounty\/([^/]+)\/entries\/?$/);
  const bounty = hash.match(/^#\/bounty\/([^/]+)\/?$/);
  const profile = hash.match(/^#\/u\/([^/]+)\/?$/);
  if (bountyLb) return renderLeaderboard(decodeURIComponent(bountyLb[1]));
  if (bountyEntries) return renderEntries(decodeURIComponent(bountyEntries[1]));
  if (bounty) return renderBounty(decodeURIComponent(bounty[1]));
  if (profile) return renderProfile(decodeURIComponent(profile[1]));
  return renderBoard();
}

// The top search takes a handle or a bounty slug. A slug that exists
// opens its bounty page; anything else opens that handle's profile.
searchForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const raw = searchInput.value.trim().replace(/^@/, '');
  if (!raw) return;
  setShotReady(false);
  showLoading('Searching…');
  try {
    await getBounty(raw);
    location.hash = '#/bounty/' + encodeURIComponent(raw);
  } catch (err) {
    if (err && err.status === 404) {
      location.hash = '#/u/' + encodeURIComponent(raw);
    } else {
      location.hash = '#/u/' + encodeURIComponent(raw);
    }
  }
});

window.addEventListener('hashchange', route);
route();
