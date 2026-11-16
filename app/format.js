// Small formatters for the values the API returns. Everything here is pure:
// the same input always gives the same output, so a view can re-render
// without the numbers moving under it.

// Text made safe to put inside HTML.
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
}

// The first letter of a name, uppercased, for an initial tile. Falls back
// to '?' so a tile never renders blank.
export function initialLetter(text) {
  const clean = String(text ?? '').trim();
  const hit = clean.match(/[A-Za-z0-9]/);
  return hit ? hit[0].toUpperCase() : '?';
}

// A rank as an ordinal: 1 -> '1st', 2 -> '2nd', 3 -> '3rd', 4 -> '4th'.
export function ordinal(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  const lastTwo = num % 100;
  const last = num % 10;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th'
    : last === 1 ? 'st'
    : last === 2 ? 'nd'
    : last === 3 ? 'rd' : 'th';
  return num + suffix;
}

// A dollar amount ('627.50', 500, or null) as '$627.50' or '$500'.
export function money(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// A deadline as a date in UTC, for example '17 Nov 2026, 12:30 UTC'.
export function date(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n) => String(n).padStart(2, '0');
  return d.getUTCDate() + ' ' + months[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC';
}

// The time until a deadline: '2d 4h left', '35m left', '12s left', or 'ended'.
export function timeLeft(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return 'ended';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (days > 0) return days + 'd ' + hours + 'h left';
  if (hours > 0) return hours + 'h ' + minutes + 'm left';
  if (minutes > 0) return minutes + 'm ' + seconds + 's left';
  return seconds + 's left';
}

// Whether a bounty still takes entries. A bounty past its deadline may
// still read status open until its results publish, so the deadline
// decides, not the status alone.
export function entryState(bounty) {
  const deadlineMs = new Date(bounty.deadline).getTime();
  if (Number.isNaN(deadlineMs)) return 'unknown';
  if (deadlineMs <= Date.now()) return 'ended';
  if (bounty.status && bounty.status !== 'open') return 'closed';
  if (deadlineMs - Date.now() < 24 * 3600000) return 'closing';
  return 'open';
}

// Whether a bounty is still open for entries (open or closing soon).
export function isLive(bounty) {
  const state = entryState(bounty);
  return state === 'open' || state === 'closing';
}

// The reward as it stands now: the prize plus any entry fees paid into it.
export function pot(bounty) {
  return money(bounty.potUsd ?? bounty.rewardAmount);
}

// '1 entry' or '252 entries'.
export function entriesLabel(n) {
  const count = Number(n) || 0;
  return count.toLocaleString('en-US') + (count === 1 ? ' entry' : ' entries');
}

// A short date, for example '16 Nov 2026'.
export function shortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return d.getUTCDate() + ' ' + months[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

// A rate as a percentage with one decimal, or a dash when there is none.
export function rate(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return (n * 100).toFixed(1) + '%';
}
