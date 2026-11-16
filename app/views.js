// The four surfaces, each a function from API data to HTML. Every value
// the API returns is escaped before it reaches the page, and every image
// the API points at is swapped for an initial tile when it fails, so no
// screenshot ever shows a hole: a missing image renders as a tile, never
// an empty box, and an empty list renders a boxed empty state that says
// why it is empty and what to do next, never a bare line.
//
// Images the API points at send Cross-Origin-Resource-Policy:
// same-origin, so each <img> carries crossorigin="anonymous" before
// its src.

import { countLabel, day, initial, left, num, openNow, pct, phaseOf, place, safe, usd, when } from './format.js';

const ORIGIN = 'https://make.fun';
const PAGE = 25;

// An initial tile as a data-URI SVG, for when an image fails after it
// starts loading. The letter is one ASCII letter or '?', so it is safe
// inside the SVG and the onerror handler that carries it.
function tileUri(letter) {
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#dfe6ee"/><text x="24" y="32" font-size="24" font-family="sans-serif" font-weight="bold" fill="#5b6b7a" text-anchor="middle">' + letter + '</text></svg>'
  );
}

// An <img> for an image the API points at. A relative path lives on
// make.fun; an absolute URL loads from where it points. With no image
// at all, render the same tile as a span with the entry's initial, so
// a leaderboard row or a profile never shows an empty grey box.
export function avatarImg(src, alt, cls) {
  const letter = initial(alt);
  if (!src) {
    return '<span class="' + cls + ' tile" aria-hidden="true">' + safe(letter) + '</span>';
  }
  const url = String(src).startsWith('/') ? ORIGIN + src : src;
  return '<img crossorigin="anonymous" src="' + safe(url) + '" alt="' + safe(alt) + '" class="' + cls + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + tileUri(letter) + '\'">';
}

function badge(phase) {
  if (phase === 'open') return '<span class="pill pill-open">Open</span>';
  if (phase === 'closing') return '<span class="pill pill-soon">Closing soon</span>';
  if (phase === 'ended') return '<span class="pill pill-done">Ended</span>';
  if (phase === 'closed') return '<span class="pill pill-shut">Closed</span>';
  return '<span class="pill pill-done">Unknown</span>';
}

function phaseNote(phase) {
  if (phase === 'ended') return 'Ended — no longer taking entries, even while its status still reads open.';
  if (phase === 'closing') return 'Still taking entries, but the deadline is under a day away.';
  if (phase === 'open') return 'Open — still taking entries.';
  if (phase === 'closed') return 'Closed to entries.';
  return '';
}

// A boxed empty state: what is missing, why, and what to do next. The
// action is optional HTML, such as a button that clears a filter.
export function emptyBox(title, body, action) {
  return '<div class="empty" role="status"><p class="empty-title">' + safe(title) + '</p>'
    + (body ? '<p>' + safe(body) + '</p>' : '')
    + (action ? '<p class="empty-action">' + action + '</p>' : '') + '</div>';
}

export function loadingBox(label) {
  return '<div class="loading" role="status"><p>' + safe(label || 'Loading…') + '</p><div class="bar" aria-hidden="true"></div></div>';
}

export function errorBox(message, retry) {
  const btn = retry ? '<button class="btn" data-retry>Try again</button>' : '';
  return '<div class="errorbox" role="alert"><h2>Could not load this page</h2><p>' + safe(message) + '</p>' + btn + '</div>';
}

export function missingBox(what) {
  return '<p><a class="back" href="#/">← All bounties</a></p><h1>Not found</h1><p class="lede">There is no ' + safe(what || 'page') + ' at this address. It may have been removed, or the link may be wrong.</p>';
}

// A pager shared by the leaderboard and the entries list: previous and
// next buttons around a line that says where the page sits. The button
// carries its own data attribute, so the two pagers never move each
// other.
function pager(current, total, shown, of, attr) {
  if (total <= 1) return '';
  return '<div class="pager" role="navigation" aria-label="Pages">'
    + '<button class="btn btn-plain" ' + attr + '="' + (current - 1) + '"' + (current <= 1 ? ' disabled' : '') + '>← Prev</button>'
    + '<span class="pager-info">Page ' + current + ' of ' + total + ' · ' + shown + ' of ' + of + '</span>'
    + '<button class="btn btn-plain" ' + attr + '="' + (current + 1) + '"' + (current >= total ? ' disabled' : '') + '>Next →</button></div>';
}

// --- Board ----------------------------------------------------------------

function bountyCard(b) {
  const phase = phaseOf(b);
  const fee = b.entryFeeUsd
    ? '<span class="fact"><span class="k">Entry fee</span><span class="v">' + usd(b.entryFeeUsd) + '</span></span>'
    : '';
  return '<li class="card">'
    + '<div class="card-top"><h3><a href="#/bounty/' + encodeURIComponent(b.slug) + '">' + safe(b.title) + '</a></h3>'
    + '<span class="pill pill-cat">' + safe(b.category || 'Bounty') + '</span>' + badge(phase) + '</div>'
    + (b.summary ? '<p class="sum">' + safe(b.summary) + '</p>' : '')
    + '<div class="facts">'
    + '<span class="fact"><span class="k">Live pot</span><span class="v v-green">' + usd(b.potUsd ?? b.rewardAmount) + '</span></span>'
    + fee
    + '<span class="fact"><span class="k">Deadline</span><span class="v" data-deadline="' + safe(b.deadline) + '">' + left(b.deadline) + '</span></span>'
    + '<span class="fact"><span class="k">Entries</span><span class="v">' + countLabel(b.submissionCount) + '</span></span>'
    + '<span class="fact"><span class="k">Ends</span><span class="v">' + when(b.deadline) + '</span></span>'
    + '</div></li>';
}

// Soonest deadline first, but a bounty still taking entries always
// sorts above one that has ended, so the board opens on live bounties.
function byDeadline(a, b) {
  const liveA = openNow(a) ? 0 : 1;
  const liveB = openNow(b) ? 0 : 1;
  if (liveA !== liveB) return liveA - liveB;
  return new Date(a.deadline) - new Date(b.deadline);
}

export function boardPage(items, ui) {
  const q = (ui.q || '').toLowerCase();
  const counts = {
    all: items.length,
    open: items.filter((b) => phaseOf(b) === 'open').length,
    closing: items.filter((b) => phaseOf(b) === 'closing').length,
    ended: items.filter((b) => phaseOf(b) === 'ended' || phaseOf(b) === 'closed').length,
  };
  let list = items.slice();
  if (ui.filter === 'open') list = list.filter((b) => phaseOf(b) === 'open');
  if (ui.filter === 'closing') list = list.filter((b) => phaseOf(b) === 'closing');
  if (ui.filter === 'ended') list = list.filter((b) => phaseOf(b) === 'ended' || phaseOf(b) === 'closed');
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
    ? emptyBox('No bounties match "' + ui.q + '".', 'Try a shorter search, or clear it to see the whole board.', '<button class="btn" data-reset-filters>Show all bounties</button>')
    : ui.filter === 'closing'
      ? emptyBox('No bounties close within a day.', 'Nothing ends in the next 24 hours right now — check back later, or browse the open bounties.', '<button class="btn" data-reset-filters>Show all bounties</button>')
      : emptyBox('No bounties match this filter.', 'Try a different filter, or clear the search above.', '<button class="btn" data-reset-filters>Show all bounties</button>');
  return '<h1>Open bounties</h1>'
    + '<p class="lede">Live bounties on make.fun, with each one’s live pot, entry fee, time left and entries. A bounty past its deadline counts as ended here even while its status still reads open.</p>'
    + '<div class="toolbar" role="group" aria-label="Filter and sort">'
    + '<div class="chipset">' + chip('all', 'All') + chip('open', 'Open') + chip('closing', 'Closing soon') + chip('ended', 'Ended') + '</div>'
    + '<span class="spacer"></span>'
    + '<label class="visually-hidden" for="board-q">Search bounties</label>'
    + '<input type="search" id="board-q" placeholder="Search title or slug…" value="' + safe(ui.q || '') + '">'
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

function rewardGrid(b) {
  const now = Array.isArray(b.rewardsNow) ? b.rewardsNow : null;
  if (now && now.length) {
    const rows = now.map((r) => '<tr><td class="ranknum">' + place(r.place) + '</td>'
      + '<td class="num">' + usd(r.baseUsd) + '</td>'
      + '<td class="num">' + usd(r.feeShareUsd) + '</td>'
      + '<td class="num"><strong>' + usd(r.amountUsd) + '</strong></td></tr>').join('');
    return '<div class="tablewrap"><table><thead><tr><th>Place</th><th class="num">Prize</th><th class="num">Fee share</th><th class="num">Total now</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<p class="small muted">The live pot is ' + usd(b.potUsd ?? b.rewardAmount) + ' — the ' + usd(b.rewardAmount) + ' prize plus ' + usd(b.entryFeesUsd) + ' in entry fees from ' + (b.entryFeePayers || 0) + ' payers. Fee shares are split over the awarded places in proportion to their prizes.</p>';
  }
  const map = b.rewards || {};
  const places = Object.keys(map).map(Number).sort((a, c) => a - c);
  if (!places.length) return emptyBox('No rewards table published yet.', 'The rewards for this bounty have not been published — check back once the bounty opens.');
  const rows = places.map((p) => '<tr><td class="ranknum">' + place(p) + '</td><td class="num"><strong>' + usd(map[p]) + '</strong></td></tr>').join('');
  return '<div class="tablewrap"><table><thead><tr><th>Place</th><th class="num">Prize</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

// Inline markdown: code spans, bold, and links. Everything is escaped
// before any markup is added, and a link is only built for an http or
// https address, so a description cannot smuggle in a script-scheme link
// or an unescaped attribute.
function mdInline(text) {
  return safe(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
}

// A table row, split on pipes: '| a | b |' -> ['a', 'b']. The outer
// pipes are decoration, not cells.
function rowCells(line) {
  const parts = line.split('|').map((c) => c.trim());
  if (parts.length && parts[0] === '') parts.shift();
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

// A table separator line: '|---|---|' or '|:---|---:|', at least one
// run of dashes. Alignment markers are read but not rendered: the
// table keeps the site's own alignment.
function isSep(line) {
  const cells = rowCells(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

// A small, safe markdown renderer for bounty descriptions: headings,
// lists, links, code spans and fenced code, tables, paragraphs.
export function renderMd(text) {
  const lines = String(text || '').split('\n');
  let out = '';
  let list = null;
  let listItems = '';
  let para = [];
  let code = null;
  const flushPara = () => {
    if (para.length) {
      out += '<p>' + para.map(mdInline).join('<br>') + '</p>';
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
        out += '<pre><code>' + safe(code.join('\n')) + '</code></pre>';
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
    if (line.startsWith('|') && i + 1 < lines.length && isSep(lines[i + 1].replace(/\s+$/, ''))) {
      flushPara();
      flushList();
      const head = rowCells(line);
      let body = '';
      i += 2;
      while (i < lines.length && lines[i].replace(/\s+$/, '').startsWith('|')) {
        const cells = rowCells(lines[i].replace(/\s+$/, ''));
        body += '<tr>' + cells.map((c) => '<td>' + mdInline(c) + '</td>').join('') + '</tr>';
        i += 1;
      }
      i -= 1;
      out += '<div class="tablewrap"><table><thead><tr>' + head.map((c) => '<th>' + mdInline(c) + '</th>').join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>';
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
      out += h3 ? '<h3>' + mdInline(h3[1]) + '</h3>' : '<h2>' + mdInline(h2 ? h2[1] : h1[1]) + '</h2>';
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
      listItems += '<li>' + mdInline(bullet ? bullet[1] : ordered[1]) + '</li>';
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
  if (code !== null) out += '<pre><code>' + safe(code.join('\n')) + '</code></pre>';
  return out;
}

export function bountyPage(b, recent) {
  const phase = phaseOf(b);
  const fee = b.entryFeeUsd ? usd(b.entryFeeUsd) : 'None';
  const recentRows = (recent && recent.items ? recent.items.slice(0, 5) : []).map((s) => '<tr><td><a class="handle" href="#/u/' + encodeURIComponent(s.handle) + '">' + safe(s.handle) + '</a></td>'
    + '<td>' + safe(s.title || 'Untitled entry') + '</td>'
    + '<td>' + safe(s.status || '') + '</td>'
    + '<td class="num">' + day(s.created_at) + '</td></tr>').join('');
  return '<p><a class="back" href="#/">← All bounties</a></p>'
    + '<div class="bounty-head"><h1>' + safe(b.title) + '</h1>'
    + '<div class="bounty-meta">' + badge(phase) + '<span class="pill pill-cat">' + safe(b.category || 'Bounty') + '</span>'
    + (b.sponsor && b.sponsor.name ? '<span class="pill pill-done">by ' + safe(b.sponsor.name) + '</span>' : '') + '</div>'
    + '<p class="lede">' + safe(b.summary || '') + '</p>'
    + '<p class="small muted">' + safe(phaseNote(phase)) + '</p></div>'
    + '<div class="grid">'
    + '<div class="panel"><div class="k">Live pot</div><div class="v v-green">' + usd(b.potUsd ?? b.rewardAmount) + '</div><div class="sub">prize ' + usd(b.rewardAmount) + ' + fees</div></div>'
    + '<div class="panel"><div class="k">Entry fee</div><div class="v">' + fee + '</div><div class="sub">' + (b.entryFeeUsd ? (b.entryFeePayers || 0) + ' payers' : 'free to enter') + '</div></div>'
    + '<div class="panel"><div class="k">Deadline</div><div class="v" data-deadline="' + safe(b.deadline) + '">' + left(b.deadline) + '</div><div class="sub">' + when(b.deadline) + '</div></div>'
    + '<div class="panel"><div class="k">Entries</div><div class="v">' + num(b.submissionCount) + '</div><div class="sub">opened ' + day(b.publishedAt || b.opensAt) + '</div></div>'
    + '</div>'
    + '<div class="linkrow"><a class="btn" href="#/bounty/' + encodeURIComponent(b.slug) + '/leaderboard">Leaderboard</a>'
    + '<a class="btn btn-plain" href="#/bounty/' + encodeURIComponent(b.slug) + '/entries">All entries</a>'
    + '<a class="btn btn-plain" href="https://make.fun/bounty/' + encodeURIComponent(b.slug) + '">Open on make.fun</a></div>'
    + '<h2>Rewards</h2>' + rewardGrid(b)
    + '<h2>Description</h2><div class="prose">' + renderMd(b.description || b.summary || '') + '</div>'
    + (b.rules ? '<h2>Rules</h2><div class="prose">' + renderMd(b.rules) + '</div>' : '')
    + '<h2>Recent entries</h2>'
    + (recentRows
      ? '<div class="tablewrap"><table><thead><tr><th>Entrant</th><th>Entry</th><th>Status</th><th class="num">Submitted</th></tr></thead><tbody>' + recentRows + '</tbody></table></div>'
      : emptyBox('No entries yet.', 'Nobody has submitted to this bounty so far — entries appear here as soon as they land.'));
}

// --- Leaderboard ----------------------------------------------------------

export function rankPage(lb, bounty, page) {
  const entries = lb.entries || [];
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE));
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (current - 1) * PAGE;
  const shown = entries.slice(start, start + PAGE);
  const rows = shown.map((e) => {
    const win = e.values && e.values.judge != null ? pct(e.values.judge) : '—';
    const low = e.values && e.values.judge_low != null ? pct(e.values.judge_low) : '—';
    const high = e.values && e.values.judge_high != null ? pct(e.values.judge_high) : '—';
    const medal = e.rank === 1 ? ' medal-1' : e.rank === 2 ? ' medal-2' : e.rank === 3 ? ' medal-3' : '';
    const prize = e.prize_rank ? '<span class="pill pill-ok">$ place ' + safe(e.prize_rank) + '</span>' : '';
    const state = e.ranked ? '' : ' <span class="pill pill-warn">unranked</span>';
    return '<tr><td class="ranknum' + medal + '">' + place(e.rank) + '</td>'
      + '<td><div class="lb-entry">' + avatarImg(e.image, e.handle + ' entry image', 'thumb')
      + '<span class="who"><span class="t">' + safe(e.title || 'Untitled entry') + '</span>'
      + '<a class="h" href="#/u/' + encodeURIComponent(e.handle) + '">' + safe(e.handle) + '</a></span></div></td>'
      + '<td class="num score">' + win + '</td>'
      + '<td class="num small muted col-interval">' + low + ' – ' + high + '</td>'
      + '<td>' + prize + state + '</td>'
      + '<td class="num small muted col-received">' + day(e.received_at) + '</td></tr>';
  }).join('');
  const title = bounty ? bounty.title : (lb.title || 'Leaderboard');
  const phase = lb.phase && lb.phase.title ? safe(lb.phase.title) : '';
  const slug = bounty ? bounty.slug : (lb.competition || '');
  return '<p><a class="back" href="#/bounty/' + encodeURIComponent(slug) + '">← Back to bounty</a></p>'
    + '<h1>' + safe(title) + ' — leaderboard</h1>'
    + '<p class="lede">' + entries.length + ' entries ranked by judge win rate' + (phase ? ' · ' + phase + ' phase' : '') + '. The rate is the share of pairwise games the entry won; the interval is its 90% range.</p>'
    + (entries.length
      ? '<div class="tablewrap"><table><thead><tr><th>Rank</th><th>Entry</th><th class="num">Win rate</th><th class="num col-interval">90% interval</th><th>Prize</th><th class="num col-received">Received</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + pager(current, totalPages, 'entries ' + (start + 1) + '–' + (start + shown.length), entries.length, 'data-page')
      : emptyBox('No ranked entries yet.', 'This bounty has no ranked entries — the leaderboard fills in once entries are judged.'));
}

// --- Entries --------------------------------------------------------------

export function entryListPage(data, bounty, page) {
  const items = data.items || [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE));
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (current - 1) * PAGE;
  const shown = items.slice(start, start + PAGE);
  const rows = shown.map((s) => '<tr><td><a class="handle" href="#/u/' + encodeURIComponent(s.handle) + '">' + safe(s.handle) + '</a></td>'
    + '<td>' + safe(s.title || 'Untitled entry') + '</td>'
    + '<td>' + safe(s.status || '') + '</td>'
    + '<td class="num">' + (s.rank != null ? place(s.rank) : '—') + '</td>'
    + '<td class="num">' + day(s.created_at) + '</td></tr>').join('');
  return '<p><a class="back" href="#/bounty/' + encodeURIComponent(bounty.slug) + '">← Back to bounty</a></p>'
    + '<h1>' + safe(bounty.title) + ' — entries</h1>'
    + '<p class="lede">' + countLabel(bounty.submissionCount) + ' in all. Newest first.</p>'
    + (rows
      ? '<div class="tablewrap"><table><thead><tr><th>Entrant</th><th>Entry</th><th>Status</th><th class="num">Rank</th><th class="num">Submitted</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + pager(current, totalPages, 'entries ' + (start + 1) + '–' + (start + shown.length), items.length, 'data-entries-page')
      : emptyBox('No entries yet.', 'Nobody has submitted to this bounty so far — entries appear here as soon as they land.'));
}

// --- Profile --------------------------------------------------------------

export function personPage(p) {
  const rec = p.record || {};
  const solutions = Array.isArray(p.solutions) ? p.solutions : [];
  const payouts = Array.isArray(p.payouts) ? p.payouts : [];
  const links = [];
  if (p.github_login) links.push('<a href="https://github.com/' + encodeURIComponent(p.github_login) + '">GitHub</a>');
  if (p.x) links.push('<a href="https://x.com/' + encodeURIComponent(p.x) + '">X</a>');
  if (p.discord) links.push('<a href="https://discord.com/users/' + encodeURIComponent(p.discord) + '">Discord</a>');
  if (p.wallet && p.wallet.explorer_url) links.push('<a href="' + safe(p.wallet.explorer_url) + '">Wallet</a>');
  const solRows = solutions.map((s) => '<tr><td>' + safe(s.title || s.competition || 'Entry') + '</td>'
    + '<td>' + (s.competition ? '<a href="#/bounty/' + encodeURIComponent(s.competition) + '">' + safe(s.competition) + '</a>' : '—') + '</td>'
    + '<td class="num">' + (s.place != null ? place(s.place) : '—') + '</td>'
    + '<td class="num">' + usd(s.prize_usd ?? s.amount_usd) + '</td></tr>').join('');
  const payRows = payouts.map((x) => '<tr><td>' + safe(x.competition || x.title || 'Payout') + '</td>'
    + '<td class="num">' + usd(x.amount_usd ?? x.amount) + '</td>'
    + '<td class="num">' + day(x.paid_at || x.created_at) + '</td></tr>').join('');
  const best = rec.best_placement != null
    ? '<div class="panel"><div class="k">Best place</div><div class="v">' + place(rec.best_placement) + '</div><div class="sub">highest finish</div></div>'
    : '';
  return '<div class="head">' + avatarImg(p.image || p.avatar, (p.display_name || p.handle) + ' avatar', 'avatar')
    + '<div><h1>' + safe(p.display_name || p.handle) + '</h1>'
    + '<p class="handle">@' + safe(p.handle) + ' · joined ' + day(p.joined_at) + '</p>'
    + (p.bio ? '<p class="lede">' + safe(p.bio) + '</p>' : '')
    + (links.length ? '<div class="links">' + links.join('') + '</div>' : '')
    + '</div></div>'
    + '<div class="rec">'
    + '<div class="panel"><div class="k">Entered</div><div class="v">' + (rec.competitions_entered || 0) + '</div><div class="sub">competitions</div></div>'
    + '<div class="panel"><div class="k">Placed</div><div class="v">' + (rec.competitions_placed || 0) + '</div><div class="sub">in a paid place</div></div>'
    + '<div class="panel"><div class="k">Won</div><div class="v">' + (rec.competitions_won || 0) + '</div><div class="sub">competitions</div></div>'
    + '<div class="panel"><div class="k">Prize money</div><div class="v v-green">' + usd(rec.prize_usd) + '</div><div class="sub">won in all</div></div>'
    + best
    + '</div>'
    + '<h2>Entries (' + solutions.length + ')</h2>'
    + (solRows
      ? '<div class="tablewrap"><table><thead><tr><th>Entry</th><th>Bounty</th><th class="num">Place</th><th class="num">Prize</th></tr></thead><tbody>' + solRows + '</tbody></table></div>'
      : emptyBox('No entries on record yet.', 'Entries appear here once this account submits to a bounty.'))
    + '<h2>Payouts (' + payouts.length + ')</h2>'
    + (payRows
      ? '<div class="tablewrap"><table><thead><tr><th>Bounty</th><th class="num">Amount</th><th class="num">Paid</th></tr></thead><tbody>' + payRows + '</tbody></table></div>'
      : emptyBox('No payouts on record yet.', 'Payouts appear here once a prize is paid out to this account.'));
}
