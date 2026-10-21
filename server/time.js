export const MIN = 60_000;
export const HOUR = 60 * MIN;

const pad = (n) => String(n).padStart(2, '0');

// "2025-05-12" no horário local
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDayKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d.getTime() : null;
}

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ts, n) {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export const floorMinute = (ts) => Math.floor(ts / MIN) * MIN;

// 3h23
export function formatTime(ts) {
  const d = new Date(ts);
  return `${d.getHours()}h${pad(d.getMinutes())}`;
}

// 12/05
export function formatDate(ts) {
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function formatLiters(v) {
  const digits = v >= 100 ? 0 : 1;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(v)} L`;
}

export const round1 = (v) => Math.round(v * 10) / 10;
