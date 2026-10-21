const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export const fmtNumber = (v) => (v >= 100 ? integer : number).format(v ?? 0);
export const fmtLiters = (v) => `${fmtNumber(v)} L`;

const pad = (n) => String(n).padStart(2, '0');

// 3h23
export function fmtTime(ts) {
  const d = new Date(ts);
  return `${d.getHours()}h${pad(d.getMinutes())}`;
}

export const fmtDateLong = (ts) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(ts);
export const fmtDayMonth = (ts) => `${pad(new Date(ts).getDate())}/${pad(new Date(ts).getMonth() + 1)}`;
export const fmtWeekday = (ts) => {
  const s = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(ts);
  return s[0].toUpperCase() + s.slice(1);
};
export const fmtWeekdayShort = (ts) => {
  const s = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(ts).replace('.', '');
  return s[0].toUpperCase() + s.slice(1);
};
export const fmtMonth = (ts) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(ts);

// "AAAA-MM-DD" (horário local) <-> timestamp
export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function sameDay(a, b) {
  return dayKey(a) === dayKey(b);
}

// "hoje às 4h12", "ontem às 22h30", "12/05 às 9h00"
export function fmtWhen(ts) {
  const now = Date.now();
  if (sameDay(ts, now)) return `Hoje · ${fmtTime(ts)}`;
  if (sameDay(ts, now - 86_400_000)) return `Ontem · ${fmtTime(ts)}`;
  return `${fmtDayMonth(ts)} · ${fmtTime(ts)}`;
}

export function fmtAgo(ts) {
  if (!ts) return 'nunca';
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return fmtWhen(ts);
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
