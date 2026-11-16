// Formatting helpers for the make.fun frontend. Every function here is
// pure: the same input always gives the same output, so a view can be
// re-rendered without the numbers moving under it.

/** Text made safe to put inside HTML. */
export function safe(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Local clock reading, "06:12:08", for the footer stamp. */
export function clock(when = new Date()) {
  return pad(when.getHours()) + ':' + pad(when.getMinutes()) + ':' + pad(when.getSeconds());
}

/**
 * A judge win rate stored in micro-units (950587 means 95.0587%) as a
 * readable percent, never above 100. "95.1%".
 */
export function pct(micro) {
  const n = Number(micro);
  if (!Number.isFinite(n)) return '—';
  return Math.min(100, n / 10000).toFixed(1) + '%';
}

/** A dollar amount: 719 -> "$719", 43.82 -> "$43.82". */
export function usd(amount) {
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : Number(amount);
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n * 100) / 100;
  const parts = String(rounded).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '$' + parts.join('.');
}

/** 1234567 -> "1,234,567". */
export function num(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return String(Math.trunc(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A UTC timestamp as "17 Nov 2026, 12:30 UTC". */
export function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC';
}

/** A short UTC date, "16 Nov 2026". */
export function day(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

/** Time left until an ISO deadline: "2d 3h left", "4h 25m left", "45m left", "Ended". */
export function left(iso, now = Date.now()) {
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return '—';
  const ms = end - now;
  if (ms <= 0) return 'Ended';
  const min = Math.floor(ms / 60000);
  const days = Math.floor(min / 1440);
  if (days > 0) return days + 'd ' + Math.floor((min % 1440) / 60) + 'h left';
  const hours = Math.floor(min / 60);
  if (hours > 0) return hours + 'h ' + (min % 60) + 'm left';
  return min + 'm left';
}

/** A deadline's remaining milliseconds, for sorting and ticking. */
export function leftMs(iso, now = Date.now()) {
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return Number.POSITIVE_INFINITY;
  return end - now;
}

/** How long ago an ISO timestamp was: "3h ago", "2d ago", "just now". */
export function ago(iso, now = Date.now()) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const ms = now - then;
  if (ms < 60000) return 'just now';
  const min = Math.floor(ms / 60000);
  if (min < 60) return min + 'm ago';
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  return day(iso);
}

/** "1 entry" or "252 entries". */
export function countLabel(n) {
  const c = Number(n) || 0;
  return num(c) + (c === 1 ? ' entry' : ' entries');
}

/** A rank as an ordinal: 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th". */
export function place(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const lastTwo = v % 100;
  const last = v % 10;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th';
  return v + suffix;
}

/** The first letter of a name, uppercased, for an initial tile. */
export function initial(text) {
  const clean = String(text ?? '').trim();
  const hit = clean.match(/[A-Za-z0-9]/);
  return hit ? hit[0].toUpperCase() : '?';
}

/** Shorten a wallet address: "HjjcMh…95NPz". */
export function shortAddr(address) {
  const a = String(address ?? '');
  if (a.length <= 10) return a;
  return a.slice(0, 6) + '…' + a.slice(-4);
}

/** A bounty's entry phase from its deadline and status. */
export function phaseOf(bounty) {
  const end = new Date(bounty.deadline).getTime();
  if (Number.isNaN(end)) return 'unknown';
  if (end <= Date.now()) return 'ended';
  if (bounty.status && bounty.status !== 'open') return 'closed';
  if (end - Date.now() < 24 * 3600 * 1000) return 'closing';
  return 'open';
}

/** Whether a bounty still takes entries (open or closing soon). */
export function openNow(bounty) {
  const phase = phaseOf(bounty);
  return phase === 'open' || phase === 'closing';
}

/** "Closing soon" when a deadline is under a day away and still open. */
export function closingSoon(iso, now = Date.now()) {
  const ms = leftMs(iso, now);
  return ms > 0 && ms < 24 * 3600 * 1000;
}
