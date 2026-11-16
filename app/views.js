// The four surfaces, each a function from API data to HTML. Every value the
// API returns is escaped before it reaches the page, and every image the
// API points at gets crossorigin="anonymous" before its src, because
// make.fun's avatar and entry images send Cross-Origin-Resource-Policy:
// same-origin.
//
// Two rules run through every view, so no screenshot ever shows a hole:
// a missing or failed image renders as an initial tile, never an empty
// box; and an empty list renders a boxed empty state that says why it is
// empty and what to do next, never a bare line or a blank table.

import { date, entriesLabel, entryState, esc, initialLetter, isLive, money, ordinal, pot, rate, shortDate, timeLeft } from './format.js';

const API_ORIGIN = 'https://make.fun';

// An initial tile as a data-URI SVG, for when an image fails after it
// starts loading. The letter is one ASCII letter or '?', so it is safe
// inside the SVG and the onerror attribute that carries it.
function tileUri(letter) {
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#dfe6ee"/><text x="24" y="32" font-size="24" font-family="sans-serif" font-weight="bold" fill="#5b6b7a" text-anchor="middle">' + letter + '</text></svg>'
  );
}

// An <img> for an image the API points at. A relative path lives on
// make.fun; an absolute URL loads from where it points. With no image at
// all, render the same tile as a span with the entry's initial, so a
// leaderboard row or a profile never shows an empty grey box; when the
// image itself fails to load, swap in the tile instead of a broken image.
export function img(src, alt, cls) {
  const letter = initialLetter(alt);
  if (!src) {
    return '<span class="' + cls + ' tile" aria-hidden="true">' + esc(letter) + '</span>';
  }
  const url = src.startsWith('/') ? API_ORIGIN + src : src;
  return '<img crossorigin="anonymous" src="' + esc(url) + '" alt="' + esc(alt) + '" class="' + cls + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + tileUri(letter) + '\'">';
}

function statusTag(state) {
  if (state === 'open') return '<span class="tag tag-open">Open</span>';
  if (state === 'closing') return '<span class="tag tag-soon">Closing soon</span>';
  if (state === 'ended') return '<span class="tag tag-ended">Ended</span>';
  if (state === 'closed') return '<span class="tag tag-closed">Closed</span>';
  return '<span class="tag tag-ended">Unknown</span>';
}

function entryStateNote(state) {
  if (state === 'ended') return 'Ended — no longer taking entries, even while its status still reads open.';
  if (state === 'closing') return 'Still taking entries, but the deadline is under a day away.';
  if (state === 'open') return 'Open — still taking entries.';
  if (state === 'closed') return 'Closed to entries.';
  return '';
}

// A boxed empty state: what is missing, why, and what to do next. The
// action is optional HTML, such as a button that clears a filter.
export function emptyState(title, body, action) {
  return '<div class="empty" role="status"><p class="empty-title">' + esc(title) + '</p>'
    + (body ? '<p>' + esc(body) + '</p>' : '')
    + (action ? '<p class="empty-action">' + action + '</p>' : '') + '</div>';
}

// --- Shared bits ----------------------------------------------------------

export function loadingView(label) {
  return '<div class="loading" role="status"><p>' + esc(label || 'Loading…') + '</p><div class="bar" aria-hidden="true"></div></div>';
}

export function errorView(message, onRetry) {
  const retry = onRetry ? '<button class="btn" data-retry>Try again</button>' : '';
  return '<div class="errorbox" role="alert"><h2>Could not load this page</h2><p>' + esc(message) + '</p>' + retry + '</div>';
}

export function notFoundView(what) {
  return '<p class="backlink"><a href="#/">← All bounties</a></p><h1>Not found</h1><p class="lede">There is no ' + esc(what || 'page') + ' at this address. It may have been removed, or the link may be wrong.</p>';
}

// --- Board ----------------------------------------------------------------

function bountyCard(b) {
  const state = entryState(b);
  const fee = b.entryFeeUsd ? '<span class="stat"><span class="k">Entry fee</span><span class="v fee">' + money(b.entryFeeUsd) + '</span></span>' : '';
  return '<li class="bounty-card">'
    + '<div class="bounty-card-top"><h3><a href="#/bounty/' + encodeURIComponent(b.slug) + '">' + esc(b.title) + '</a></h3>'
    + '<span class="tag tag-cat">' + esc(b.category || 'Bounty') + '</span>' + statusTag(state) + '</div>'
    + (b.summary ? '<p class="summary">' + esc(b.summary) + '</p>' : '')
    + '<div class="statrow">'
    + '<span class="stat"><span class="k">Live pot</span><span class="v pot">' + pot(b) + '</span></span>'
    + fee
    + '<span class="stat"><span class="k">Deadline</span><span class="v" data-deadline="' + esc(b.deadline) + '">' + timeLeft(b.deadline) + '</span></span>'
    + '<span class="stat"><span class="k">Entries</span><span class="v">' + entriesLabel(b.submissionCount) + '</span></span>'
    + '<span class="stat"><span class="k">Ends</span><span class="v">' + date(b.deadline) + '</span></span>'
    + '</div></li>';
}

// Soonest deadline first, but a bounty still taking entries always sorts
// above one that has ended, so the board opens on live bounties.
function byDeadline(a, b) {
  const liveA = isLive(a) ? 0 : 1;
  const liveB = isLive(b) ? 0 : 1;
  if (liveA !== liveB) return liveA - liveB;
  return new Date(a.deadline) - new Date(b.deadline);
}

export function boardView(items, ui) {
  const q = (ui.q || '').toLowerCase();
  const counts = {
    all: items.length,
    open: items.filter((b) => entryState(b) === 'open').length,
    closing: items.filter((b) => entryState(b) === 'closing').length,
    ended: items.filter((b) => entryState(b) === 'ended' || entryState(b) === 'closed').length,
  };
  let list = items.slice();
  if (ui.filter === 'open') list = list.filter((b) => entryState(b) === 'open');
  if (ui.filter === 'closing') list = list.filter((b) => entryState(b) === 'closing');
  if (ui.filter === 'ended') list = list.filter((b) => entryState(b) === 'ended' || entryState(b) === 'closed');
  if (q) {
    list = list.filter((b) => (b.title + ' ' + b.slug + ' ' + (b.category || '')).toLowerCase().includes(q));
  }
  if (ui.sort === 'pot') list.sort((a, b) => Number(b.potUsd ?? b.rewardAmount) - Number(a.potUsd ?? a.rewardAmount));
  else if (ui.sort === 'entries') list.sort((a, b) => (b.submissionCount || 0) - (a.submissionCount || 0));
  else list.sort(byDeadline);

  const chip = (key, label) => '<button class="chip" data-filter="' + key + '" aria-pressed="' + (ui.filter === key ? 'true' : 'false') + '">' + label + ' <span class="n">' + counts[key] + '</span></button>';
  const cards = list.map(bountyCard).join('');
  // A search that matches nothing says so with the search text, so the
  // reader knows it was the search — not the filter — that emptied the
  // board; a filter with nothing in it says which filter, with a reset.
  const empty = q
    ? emptyState('No bounties match “' + ui.q + '”.', 'Try a shorter search, or clear it to see the whole board.', '<button class="btn" data-reset-filters>Show all bounties</button>')
    : ui.filter === 'closing'
      ? emptyState('No bounties close within a day.', 'Nothing ends in the next 24 hours right now — check back later, or browse the open bounties.', '<button class="btn" data-reset-filters>Show all bounties</button>')
      : emptyState('No bounties match this filter.', 'Try a different filter, or clear the search above.', '<button class="btn" data-reset-filters>Show all bounties</button>');
  return '<h1>Open bounties</h1>'
    + '<p class="lede">Live bounties on make.fun, with each one’s live pot, entry fee, time left and entries. A bounty past its deadline counts as ended here even while its status still reads open.</p>'
    + '<div class="toolbar" role="group" aria-label="Filter and sort">'
    + '<div class="chipset">' + chip('all', 'All') + chip('open', 'Open') + chip('closing', 'Closing soon') + chip('ended', 'Ended') + '</div>'
    + '<span class="spacer"></span>'
    + '<label class="visually-hidden" for="board-q">Search bounties</label>'
    + '<input type="search" id="board-q" placeholder="Search title or slug…" value="' + esc(ui.q || '') + '">'
    + '<label class="visually-hidden" for="board-sort">Sort by</label>'
    + '<select id="board-sort">'
    + '<option value="deadline"' + (ui.sort === 'deadline' ? ' selected' : '') + '>Soonest deadline</option>'
    + '<option value="pot"' + (ui.sort === 'pot' ? ' selected' : '') + '>Largest pot</option>'
    + '<option value="entries"' + (ui.sort === 'entries' ? ' selected' : '') + '>Most entries</option>'
    + '</select></div>'
    + '<p class="countline">' + list.length + ' of ' + items.length + ' bounties shown</p>'
    + (list.length ? '<ul class="board">' + cards + '</ul>' : empty);
}

// --- Bounty page ----------------------------------------------------------

function rewardsTable(b) {
  const now = Array.isArray(b.rewardsNow) ? b.rewardsNow : null;
  if (now && now.length) {
    const rows = now.map((r) => '<tr><td class="rankcell">' + ordinal(r.place) + '</td>'
      + '<td class="num">' + money(r.baseUsd) + '</td>'
      + '<td class="num">' + money(r.feeShareUsd) + '</td>'
      + '<td class="num"><strong>' + money(r.amountUsd) + '</strong></td></tr>').join('');
    return '<div class="tablewrap"><table><thead><tr><th>Place</th><th class="num">Prize</th><th class="num">Fee share</th><th class="num">Total now</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<p class="small muted">The live pot is ' + pot(b) + ' — the ' + money(b.rewardAmount) + ' prize plus ' + money(b.entryFeesUsd) + ' in entry fees from ' + (b.entryFeePayers || 0) + ' payers. Fee shares are split over the awarded places in proportion to their prizes.</p>';
  }
  const map = b.rewards || {};
  const places = Object.keys(map).map(Number).sort((a, c) => a - c);
  if (!places.length) return emptyState('No rewards table published yet.', 'The rewards for this bounty have not been published — check back once the bounty opens.');
  const rows = places.map((p) => '<tr><td class="rankcell">' + ordinal(p) + '</td><td class="num"><strong>' + money(map[p]) + '</strong></td></tr>').join('');
  return '<div class="tablewrap"><table><thead><tr><th>Place</th><th class="num">Prize</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

// A small, safe markdown renderer for bounty descriptions: headings,
// lists, links, code spans and fenced code, paragraphs. Everything is
// escaped before any markup is added, and a link is only built for an
// http or https address, so a description cannot smuggle in a
// javascript: link or an unescaped attribute.
function inlineMd(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
}

// A table row, split on pipes: '| a | b |' -> ['a', 'b']. The outer
// pipes are decoration, not cells.
function tableCells(line) {
  const parts = line.split('|').map((c) => c.trim());
  if (parts.length && parts[0] === '') parts.shift();
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

// A table separator line: '|---|---|' or '|:---|---:|', at least one
// run of dashes. Alignment markers are read but not rendered: the
// table keeps the site's own alignment.
function isTableSep(line) {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

export function md(text) {
  const lines = String(text || '').split('\n');
  let out = '';
  let list = null;
  let listItems = '';
  let para = [];
  let code = null;
  const flushPara = () => {
    if (para.length) {
      out += '<p>' + para.map(inlineMd).join('<br>') + '</p>';
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out += '<' + list + '>' + listItems + '</' + list + '>';
      list = null;
      listItems = '';
    }
  };
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    if (code !== null) {
      if (line.trim().startsWith('```')) {
        out += '<pre><code>' + esc(code.join('\n')) + '</code></pre>';
        code = null;
      } else {
        code.push(raw);
      }
      continue;
    }
    if (line.trim().startsWith('```')) {
      flushPara();
      flushList();
      code = [];
      continue;
    }
    // A table: a header row of pipes, a separator row under it, then
    // body rows of pipes. Rendered in the site's table wrapper, so it
    // scrolls on a phone instead of overflowing the page.
    if (line.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1].replace(/\s+$/, ''))) {
      flushPara();
      flushList();
      const head = tableCells(line);
      let body = '';
      i += 2;
      while (i < lines.length && lines[i].replace(/\s+$/, '').startsWith('|')) {
        const cells = tableCells(lines[i].replace(/\s+$/, ''));
        body += '<tr>' + cells.map((c) => '<td>' + inlineMd(c) + '</td>').join('') + '</tr>';
        i += 1;
      }
      i -= 1;
      out += '<div class="tablewrap"><table><thead><tr>' + head.map((c) => '<th>' + inlineMd(c) + '</th>').join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>';
      continue;
    }
    const h3 = line.match(/^###\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h1 = line.match(/^#\s+(.*)/);
    if (h3 || h2 || h1) {
      flushPara();
      flushList();
      // A description's top heading renders as h2: the page already has
      // its own h1, the bounty's title, and a second one would break the
      // page's outline.
      out += h3 ? '<h3>' + inlineMd(h3[1]) + '</h3>' : '<h2>' + inlineMd(h2 ? h2[1] : h1[1]) + '</h2>';
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)/);
    const ordered = line.match(/^\d+[.)]\s+(.*)/);
    if (bullet || ordered) {
      flushPara();
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        flushList();
        list = kind;
      }
      listItems += '<li>' + inlineMd(bullet ? bullet[1] : ordered[1]) + '</li>';
      continue;
    }
    if (line.trim() === '') {
      flushPara();
      flushList();
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  if (code !== null) out += '<pre><code>' + esc(code.join('\n')) + '</code></pre>';
  return out;
}

export function bountyView(b, recent) {
  const state = entryState(b);
  const fee = b.entryFeeUsd ? money(b.entryFeeUsd) : 'None';
  const recentRows = (recent && recent.items ? recent.items.slice(0, 5) : []).map((s) => '<tr><td><a class="handle" href="#/u/' + encodeURIComponent(s.handle) + '">' + esc(s.handle) + '</a></td>'
    + '<td>' + esc(s.title || 'Untitled entry') + '</td>'
    + '<td>' + esc(s.status || '') + '</td>'
    + '<td class="num">' + shortDate(s.created_at) + '</td></tr>').join('');
  return '<p><a class="backlink" href="#/">← All bounties</a></p>'
    + '<div class="bounty-head"><h1>' + esc(b.title) + '</h1>'
    + '<div class="bounty-meta">' + statusTag(state) + '<span class="tag tag-cat">' + esc(b.category || 'Bounty') + '</span>'
    + (b.sponsor && b.sponsor.name ? '<span class="tag tag-ended">by ' + esc(b.sponsor.name) + '</span>' : '') + '</div>'
    + '<p class="lede">' + esc(b.summary || '') + '</p>'
    + '<p class="small muted">' + esc(entryStateNote(state)) + '</p></div>'
    + '<div class="statgrid">'
    + '<div class="statcard"><div class="k">Live pot</div><div class="v pot">' + pot(b) + '</div><div class="sub">prize ' + money(b.rewardAmount) + ' + fees</div></div>'
    + '<div class="statcard"><div class="k">Entry fee</div><div class="v">' + fee + '</div><div class="sub">' + (b.entryFeeUsd ? (b.entryFeePayers || 0) + ' payers' : 'free to enter') + '</div></div>'
    + '<div class="statcard"><div class="k">Deadline</div><div class="v" data-deadline="' + esc(b.deadline) + '">' + timeLeft(b.deadline) + '</div><div class="sub">' + date(b.deadline) + '</div></div>'
    + '<div class="statcard"><div class="k">Entries</div><div class="v">' + (Number(b.submissionCount) || 0).toLocaleString('en-US') + '</div><div class="sub">opened ' + shortDate(b.publishedAt || b.opensAt) + '</div></div>'
    + '</div>'
    + '<div class="linkrow"><a class="btn" href="#/bounty/' + encodeURIComponent(b.slug) + '/leaderboard">Leaderboard</a>'
    + '<a class="btn btn-ghost" href="#/bounty/' + encodeURIComponent(b.slug) + '/entries">All entries</a>'
    + '<a class="btn btn-ghost" href="https://make.fun/bounty/' + encodeURIComponent(b.slug) + '">Open on make.fun</a></div>'
    + '<h2>Rewards</h2>' + rewardsTable(b)
    + '<h2>Description</h2><div class="prose">' + md(b.description || b.summary || '') + '</div>'
    + (b.rules ? '<h2>Rules</h2><div class="prose">' + md(b.rules) + '</div>' : '')
    + '<h2>Recent entries</h2>'
    + (recentRows
      ? '<div class="tablewrap"><table><thead><tr><th>Entrant</th><th>Entry</th><th>Status</th><th class="num">Submitted</th></tr></thead><tbody>' + recentRows + '</tbody></table></div>'
      : emptyState('No entries yet.', 'Nobody has submitted to this bounty so far — entries appear here as soon as they land.'));
}

// --- Leaderboard ----------------------------------------------------------

// Long leaderboards are paged, 25 entries at a time, so a bounty with
// hundreds of entries renders a small page instead of a giant table.
export const LEADERBOARD_PAGE_SIZE = 25;

export function leaderboardView(lb, bounty, page) {
  const entries = lb.entries || [];
  const totalPages = Math.max(1, Math.ceil(entries.length / LEADERBOARD_PAGE_SIZE));
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (current - 1) * LEADERBOARD_PAGE_SIZE;
  const shown = entries.slice(start, start + LEADERBOARD_PAGE_SIZE);
  const rows = shown.map((e) => {
    const win = e.values && e.values.judge != null ? rate(e.values.judge / 1000000) : '—';
    const low = e.values && e.values.judge_low != null ? rate(e.values.judge_low / 1000000) : '—';
    const high = e.values && e.values.judge_high != null ? rate(e.values.judge_high / 1000000) : '—';
    const medal = e.rank === 1 ? ' medal-1' : e.rank === 2 ? ' medal-2' : e.rank === 3 ? ' medal-3' : '';
    const prize = e.prize_rank ? '<span class="pill pill-ok">$ place ' + esc(e.prize_rank) + '</span>' : '';
    const state = e.ranked ? '' : ' <span class="pill pill-warn">unranked</span>';
    return '<tr><td class="rankcell' + medal + '">' + ordinal(e.rank) + '</td>'
      + '<td><div class="lb-entry">' + img(e.image, e.handle + ' entry image', 'lb-thumb')
      + '<span class="who"><span class="t">' + esc(e.title || 'Untitled entry') + '</span>'
      + '<a class="h" href="#/u/' + encodeURIComponent(e.handle) + '">' + esc(e.handle) + '</a></span></div></td>'
      + '<td class="num score">' + win + '</td>'
      + '<td class="num small muted col-interval">' + low + ' – ' + high + '</td>'
      + '<td>' + prize + state + '</td>'
      + '<td class="num small muted col-received">' + shortDate(e.received_at) + '</td></tr>';
  }).join('');
  const title = bounty ? bounty.title : (lb.title || 'Leaderboard');
  const phase = lb.phase && lb.phase.title ? esc(lb.phase.title) : '';
  const pager = totalPages > 1
    ? '<div class="pager" role="navigation" aria-label="Leaderboard pages">'
      + '<button class="btn btn-ghost" data-page="' + (current - 1) + '"' + (current <= 1 ? ' disabled' : '') + '>← Prev</button>'
      + '<span class="pager-info">Page ' + current + ' of ' + totalPages + ' · entries ' + (start + 1) + '–' + (start + shown.length) + ' of ' + entries.length + '</span>'
      + '<button class="btn btn-ghost" data-page="' + (current + 1) + '"' + (current >= totalPages ? ' disabled' : '') + '>Next →</button></div>'
    : '';
  return '<p><a class="backlink" href="#/bounty/' + encodeURIComponent(lb.competition || '') + '">← Back to bounty</a></p>'
    + '<h1>' + esc(title) + ' — leaderboard</h1>'
    + '<p class="lede">' + entries.length + ' entries ranked by judge win rate' + (phase ? ' · ' + phase + ' phase' : '') + '. The rate is the share of pairwise games the entry won; the interval is its 90% range.</p>'
    + (entries.length
      ? '<div class="tablewrap"><table><thead><tr><th>Rank</th><th>Entry</th><th class="num">Win rate</th><th class="num col-interval">90% interval</th><th>Prize</th><th class="num col-received">Received</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + pager
      : emptyState('No ranked entries yet.', 'This bounty has no ranked entries — the leaderboard fills in once entries are judged.'));
}

// --- Entries --------------------------------------------------------------

// Entries are paged like the leaderboard, 25 at a time, so a bounty
// with hundreds of entries renders a small page instead of a giant
// table. The pager reports its own page, so main.js can tell it apart
// from the leaderboard's.
export const ENTRIES_PAGE_SIZE = 25;

export function entriesView(data, bounty, page) {
  const items = data.items || [];
  const totalPages = Math.max(1, Math.ceil(items.length / ENTRIES_PAGE_SIZE));
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (current - 1) * ENTRIES_PAGE_SIZE;
  const shown = items.slice(start, start + ENTRIES_PAGE_SIZE);
  const rows = shown.map((s) => '<tr><td><a class="handle" href="#/u/' + encodeURIComponent(s.handle) + '">' + esc(s.handle) + '</a></td>'
    + '<td>' + esc(s.title || 'Untitled entry') + '</td>'
    + '<td>' + esc(s.status || '') + '</td>'
    + '<td class="num">' + (s.rank != null ? ordinal(s.rank) : '—') + '</td>'
    + '<td class="num">' + shortDate(s.created_at) + '</td></tr>').join('');
  const pager = totalPages > 1
    ? '<div class="pager" role="navigation" aria-label="Entries pages">'
      + '<button class="btn btn-ghost" data-entries-page="' + (current - 1) + '"' + (current <= 1 ? ' disabled' : '') + '>← Prev</button>'
      + '<span class="pager-info">Page ' + current + ' of ' + totalPages + ' · entries ' + (start + 1) + '–' + (start + shown.length) + ' of ' + items.length + '</span>'
      + '<button class="btn btn-ghost" data-entries-page="' + (current + 1) + '"' + (current >= totalPages ? ' disabled' : '') + '>Next →</button></div>'
    : '';
  return '<p><a class="backlink" href="#/bounty/' + encodeURIComponent(bounty.slug) + '">← Back to bounty</a></p>'
    + '<h1>' + esc(bounty.title) + ' — entries</h1>'
    + '<p class="lede">' + entriesLabel(bounty.submissionCount) + ' in all. Newest first.</p>'
    + (rows
      ? '<div class="tablewrap"><table><thead><tr><th>Entrant</th><th>Entry</th><th>Status</th><th class="num">Rank</th><th class="num">Submitted</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + pager
      : emptyState('No entries yet.', 'Nobody has submitted to this bounty so far — entries appear here as soon as they land.'));
}

// --- Profile --------------------------------------------------------------

export function profileView(p) {
  const rec = p.record || {};
  const solutions = Array.isArray(p.solutions) ? p.solutions : [];
  const payouts = Array.isArray(p.payouts) ? p.payouts : [];
  const links = [];
  if (p.github_login) links.push('<a href="https://github.com/' + encodeURIComponent(p.github_login) + '">GitHub</a>');
  if (p.x) links.push('<a href="https://x.com/' + encodeURIComponent(p.x) + '">X</a>');
  if (p.discord) links.push('<a href="https://discord.com/users/' + encodeURIComponent(p.discord) + '">Discord</a>');
  if (p.wallet && p.wallet.explorer_url) links.push('<a href="' + esc(p.wallet.explorer_url) + '">Wallet</a>');
  const solRows = solutions.map((s) => '<tr><td>' + esc(s.title || s.competition || 'Entry') + '</td>'
    + '<td>' + (s.competition ? '<a href="#/bounty/' + encodeURIComponent(s.competition) + '">' + esc(s.competition) + '</a>' : '—') + '</td>'
    + '<td class="num">' + (s.place != null ? ordinal(s.place) : '—') + '</td>'
    + '<td class="num">' + money(s.prize_usd ?? s.amount_usd) + '</td></tr>').join('');
  const payRows = payouts.map((x) => '<tr><td>' + esc(x.competition || x.title || 'Payout') + '</td>'
    + '<td class="num">' + money(x.amount_usd ?? x.amount) + '</td>'
    + '<td class="num">' + shortDate(x.paid_at || x.created_at) + '</td></tr>').join('');
  const best = rec.best_placement != null
    ? '<div class="statcard"><div class="k">Best place</div><div class="v">' + ordinal(rec.best_placement) + '</div><div class="sub">highest finish</div></div>'
    : '';
  return '<div class="profile-head">' + img(p.image || p.avatar, (p.display_name || p.handle) + ' avatar', 'avatar')
    + '<div><h1>' + esc(p.display_name || p.handle) + '</h1>'
    + '<p class="handle">@' + esc(p.handle) + ' · joined ' + shortDate(p.joined_at) + '</p>'
    + (p.bio ? '<p class="lede">' + esc(p.bio) + '</p>' : '')
    + (links.length ? '<div class="profile-links">' + links.join('') + '</div>' : '')
    + '</div></div>'
    + '<div class="recordgrid">'
    + '<div class="statcard"><div class="k">Entered</div><div class="v">' + (rec.competitions_entered || 0) + '</div><div class="sub">competitions</div></div>'
    + '<div class="statcard"><div class="k">Placed</div><div class="v">' + (rec.competitions_placed || 0) + '</div><div class="sub">in a paid place</div></div>'
    + '<div class="statcard"><div class="k">Won</div><div class="v">' + (rec.competitions_won || 0) + '</div><div class="sub">competitions</div></div>'
    + '<div class="statcard"><div class="k">Prize money</div><div class="v pot">' + money(rec.prize_usd) + '</div><div class="sub">won in all</div></div>'
    + best
    + '</div>'
    + '<h2>Entries (' + solutions.length + ')</h2>'
    + (solRows
      ? '<div class="tablewrap"><table><thead><tr><th>Entry</th><th>Bounty</th><th class="num">Place</th><th class="num">Prize</th></tr></thead><tbody>' + solRows + '</tbody></table></div>'
      : emptyState('No entries on record yet.', 'Entries appear here once this account submits to a bounty.'))
    + '<h2>Payouts (' + payouts.length + ')</h2>'
    + (payRows
      ? '<div class="tablewrap"><table><thead><tr><th>Bounty</th><th class="num">Amount</th><th class="num">Paid</th></tr></thead><tbody>' + payRows + '</tbody></table></div>'
      : emptyState('No payouts on record yet.', 'Payouts appear here once a prize is paid out to this account.'));
}
