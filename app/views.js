// The four surfaces, each a function from API data to HTML. Every value the
// API returns is escaped before it reaches the page, and every image the
// API points at gets crossorigin="anonymous" before its src, because
// make.fun's avatar and entry images send Cross-Origin-Resource-Policy:
// same-origin.

import { date, entriesLabel, entryState, esc, money, pot, rate, shortDate, timeLeft } from './format.js';

const API_ORIGIN = 'https://make.fun';

// An <img> for an image the API points at. A relative path lives on
// make.fun; an absolute URL loads from where it points.
function img(src, alt, cls) {
  if (!src) return '<span class="' + cls + '" aria-hidden="true"></span>';
  const url = src.startsWith('/') ? API_ORIGIN + src : src;
  return '<img crossorigin="anonymous" src="' + esc(url) + '" alt="' + esc(alt) + '" class="' + cls + '" loading="lazy">';
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
    + '<span class="stat"><span class="k">Deadline</span><span class="v">' + timeLeft(b.deadline) + '</span></span>'
    + '<span class="stat"><span class="k">Entries</span><span class="v">' + entriesLabel(b.submissionCount) + '</span></span>'
    + '<span class="stat"><span class="k">Ends</span><span class="v">' + date(b.deadline) + '</span></span>'
    + '</div></li>';
}

export function boardView(items, ui) {
  const q = (ui.q || '').toLowerCase();
  let list = items.slice();
  if (ui.filter === 'open') list = list.filter((b) => entryState(b) === 'open');
  if (ui.filter === 'closing') list = list.filter((b) => entryState(b) === 'closing');
  if (ui.filter === 'ended') list = list.filter((b) => entryState(b) === 'ended' || entryState(b) === 'closed');
  if (q) {
    list = list.filter((b) => (b.title + ' ' + b.slug + ' ' + (b.category || '')).toLowerCase().includes(q));
  }
  if (ui.sort === 'pot') list.sort((a, b) => Number(b.potUsd ?? b.rewardAmount) - Number(a.potUsd ?? a.rewardAmount));
  else if (ui.sort === 'entries') list.sort((a, b) => (b.submissionCount || 0) - (a.submissionCount || 0));
  else list.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  const chip = (key, label) => '<button class="chip" data-filter="' + key + '" aria-pressed="' + (ui.filter === key ? 'true' : 'false') + '">' + label + '</button>';
  const cards = list.map(bountyCard).join('');
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
    + (list.length ? '<ul class="board">' + cards + '</ul>' : '<p class="empty">No bounties match this filter.</p>');
}

// --- Bounty page ----------------------------------------------------------

function rewardsTable(b) {
  const now = Array.isArray(b.rewardsNow) ? b.rewardsNow : null;
  if (now && now.length) {
    const rows = now.map((r) => '<tr><td class="rankcell">' + esc(r.place) + '</td>'
      + '<td class="num">' + money(r.baseUsd) + '</td>'
      + '<td class="num">' + money(r.feeShareUsd) + '</td>'
      + '<td class="num"><strong>' + money(r.amountUsd) + '</strong></td></tr>').join('');
    return '<div class="tablewrap"><table><thead><tr><th>Place</th><th class="num">Prize</th><th class="num">Fee share</th><th class="num">Total now</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<p class="small muted">The live pot is ' + pot(b) + ' — the ' + money(b.rewardAmount) + ' prize plus ' + money(b.entryFeesUsd) + ' in entry fees from ' + (b.entryFeePayers || 0) + ' payers. Fee shares are split over the awarded places in proportion to their prizes.</p>';
  }
  const map = b.rewards || {};
  const places = Object.keys(map).map(Number).sort((a, c) => a - c);
  if (!places.length) return '<p class="empty">No rewards table published yet.</p>';
  const rows = places.map((p) => '<tr><td class="rankcell">' + p + '</td><td class="num"><strong>' + money(map[p]) + '</strong></td></tr>').join('');
  return '<div class="tablewrap"><table><thead><tr><th>Place</th><th class="num">Prize</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

// A small, safe markdown renderer for bounty descriptions: headings,
// lists, code spans and fenced code, paragraphs. Everything is escaped
// before any markup is added.
function inlineMd(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
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
  for (const raw of lines) {
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
    const h3 = line.match(/^###\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    if (h3 || h2) {
      flushPara();
      flushList();
      out += h3 ? '<h3>' + inlineMd(h3[1]) + '</h3>' : '<h2>' + inlineMd(h2[1]) + '</h2>';
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
    + '<div class="statcard"><div class="k">Deadline</div><div class="v">' + timeLeft(b.deadline) + '</div><div class="sub">' + date(b.deadline) + '</div></div>'
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
      : '<p class="empty">No entries yet.</p>');
}

// --- Leaderboard ----------------------------------------------------------

export function leaderboardView(lb, bounty) {
  const entries = lb.entries || [];
  const rows = entries.map((e) => {
    const win = e.values && e.values.judge != null ? rate(e.values.judge / 1000000) : '—';
    const low = e.values && e.values.judge_low != null ? rate(e.values.judge_low / 1000000) : '—';
    const high = e.values && e.values.judge_high != null ? rate(e.values.judge_high / 1000000) : '—';
    const medal = e.rank === 1 ? ' medal-1' : e.rank === 2 ? ' medal-2' : e.rank === 3 ? ' medal-3' : '';
    const prize = e.prize_rank ? '<span class="pill pill-ok">$ place ' + esc(e.prize_rank) + '</span>' : '';
    const state = e.ranked ? '' : ' <span class="pill pill-warn">unranked</span>';
    return '<tr><td class="rankcell' + medal + '">' + esc(e.rank) + '</td>'
      + '<td><div class="lb-entry">' + img(e.image, e.handle + ' entry image', 'lb-thumb')
      + '<span class="who"><span class="t">' + esc(e.title || 'Untitled entry') + '</span>'
      + '<a class="h" href="#/u/' + encodeURIComponent(e.handle) + '">' + esc(e.handle) + '</a></span></div></td>'
      + '<td class="num score">' + win + '</td>'
      + '<td class="num small muted">' + low + ' – ' + high + '</td>'
      + '<td>' + prize + state + '</td>'
      + '<td class="num small muted">' + shortDate(e.received_at) + '</td></tr>';
  }).join('');
  const title = bounty ? bounty.title : (lb.title || 'Leaderboard');
  const phase = lb.phase && lb.phase.title ? esc(lb.phase.title) : '';
  return '<p><a class="backlink" href="#/bounty/' + encodeURIComponent(lb.competition || '') + '">← Back to bounty</a></p>'
    + '<h1>' + esc(title) + ' — leaderboard</h1>'
    + '<p class="lede">' + entries.length + ' entries ranked by judge win rate' + (phase ? ' · ' + phase + ' phase' : '') + '. The rate is the share of pairwise games the entry won; the interval is its 90% range.</p>'
    + (entries.length
      ? '<div class="tablewrap"><table><thead><tr><th>Rank</th><th>Entry</th><th class="num">Win rate</th><th class="num">90% interval</th><th>Prize</th><th class="num">Received</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<p class="empty">No ranked entries yet.</p>');
}

// --- Entries --------------------------------------------------------------

export function entriesView(data, bounty) {
  const items = data.items || [];
  const rows = items.map((s) => '<tr><td><a class="handle" href="#/u/' + encodeURIComponent(s.handle) + '">' + esc(s.handle) + '</a></td>'
    + '<td>' + esc(s.title || 'Untitled entry') + '</td>'
    + '<td>' + esc(s.status || '') + '</td>'
    + '<td class="num">' + (s.rank != null ? esc(s.rank) : '—') + '</td>'
    + '<td class="num">' + shortDate(s.created_at) + '</td></tr>').join('');
  return '<p><a class="backlink" href="#/bounty/' + encodeURIComponent(bounty.slug) + '">← Back to bounty</a></p>'
    + '<h1>' + esc(bounty.title) + ' — entries</h1>'
    + '<p class="lede">' + entriesLabel(bounty.submissionCount) + ' in all. Newest first.</p>'
    + (rows
      ? '<div class="tablewrap"><table><thead><tr><th>Entrant</th><th>Entry</th><th>Status</th><th class="num">Rank</th><th class="num">Submitted</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<p class="empty">No entries yet.</p>');
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
    + '<td class="num">' + (s.place != null ? esc(s.place) : '—') + '</td>'
    + '<td class="num">' + money(s.prize_usd ?? s.amount_usd) + '</td></tr>').join('');
  const payRows = payouts.map((x) => '<tr><td>' + esc(x.competition || x.title || 'Payout') + '</td>'
    + '<td class="num">' + money(x.amount_usd ?? x.amount) + '</td>'
    + '<td class="num">' + shortDate(x.paid_at || x.created_at) + '</td></tr>').join('');
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
    + '</div>'
    + '<h2>Entries</h2>'
    + (solRows
      ? '<div class="tablewrap"><table><thead><tr><th>Entry</th><th>Bounty</th><th class="num">Place</th><th class="num">Prize</th></tr></thead><tbody>' + solRows + '</tbody></table></div>'
      : '<p class="empty">No entries on record yet.</p>')
    + '<h2>Payouts</h2>'
    + (payRows
      ? '<div class="tablewrap"><table><thead><tr><th>Bounty</th><th class="num">Amount</th><th class="num">Paid</th></tr></thead><tbody>' + payRows + '</tbody></table></div>'
      : '<p class="empty">No payouts on record yet.</p>');
}
