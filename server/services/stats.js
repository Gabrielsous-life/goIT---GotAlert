import { db } from '../db.js';
import { addDays, dayKey } from '../time.js';

const rangeStmt = db.prepare(
  'SELECT ts, liters FROM readings WHERE device_id = ? AND ts >= ? AND ts < ? ORDER BY ts',
);
const sumStmt = db.prepare(
  'SELECT COALESCE(SUM(liters), 0) AS total FROM readings WHERE device_id = ? AND ts >= ? AND ts < ?',
);
const lastReadingStmt = db.prepare('SELECT MAX(ts) AS ts FROM readings WHERE device_id = ?');

export const readingsBetween = (deviceId, from, to) => rangeStmt.all(deviceId, from, to);
export const sumBetween = (deviceId, from, to) => sumStmt.get(deviceId, from, to).total;
export const lastReadingAt = (deviceId) => lastReadingStmt.get(deviceId).ts;

// Map "AAAA-MM-DD" -> litros, para os dias em [fromDay, toDay)
export function dailyTotals(deviceId, fromDay, toDay) {
  const totals = new Map();
  for (let d = fromDay; d < toDay; d = addDays(d, 1)) totals.set(dayKey(d), 0);
  for (const r of readingsBetween(deviceId, fromDay, toDay)) {
    const key = dayKey(r.ts);
    totals.set(key, totals.get(key) + r.liters);
  }
  return totals;
}

export function hourlyTotals(deviceId, dayStart) {
  const hours = Array(24).fill(0);
  for (const r of readingsBetween(deviceId, dayStart, addDays(dayStart, 1))) {
    hours[new Date(r.ts).getHours()] += r.liters;
  }
  return hours;
}

// Média dos dias anteriores que tiveram leitura (dias sem dados são ignorados,
// porque provavelmente o sensor estava desligado).
export function averageDaily(deviceId, dayStart, days = 14) {
  const totals = [...dailyTotals(deviceId, addDays(dayStart, -days), dayStart).values()].filter((v) => v > 0);
  const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  return { avg, days: totals.length };
}
