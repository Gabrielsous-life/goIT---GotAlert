import { db } from '../db.js';
import { addDays, dayKey } from '../time.js';

export const readingsBetween = (deviceId, from, to) =>
  db.all('SELECT ts, liters FROM readings WHERE device_id = ? AND ts >= ? AND ts < ? ORDER BY ts', [deviceId, from, to]);

export const sumBetween = async (deviceId, from, to) =>
  (await db.get(
    'SELECT COALESCE(SUM(liters), 0) AS total FROM readings WHERE device_id = ? AND ts >= ? AND ts < ?',
    [deviceId, from, to],
  )).total;

export const lastReadingAt = async (deviceId) =>
  (await db.get('SELECT MAX(ts) AS ts FROM readings WHERE device_id = ?', [deviceId])).ts;

// Map "AAAA-MM-DD" -> litros, para os dias em [fromDay, toDay)
export async function dailyTotals(deviceId, fromDay, toDay) {
  const totals = new Map();
  for (let d = fromDay; d < toDay; d = addDays(d, 1)) totals.set(dayKey(d), 0);
  for (const r of await readingsBetween(deviceId, fromDay, toDay)) {
    const key = dayKey(r.ts);
    totals.set(key, totals.get(key) + r.liters);
  }
  return totals;
}

export async function hourlyTotals(deviceId, dayStart) {
  const hours = Array(24).fill(0);
  for (const r of await readingsBetween(deviceId, dayStart, addDays(dayStart, 1))) {
    hours[new Date(r.ts).getHours()] += r.liters;
  }
  return hours;
}

// Média dos dias anteriores que tiveram leitura (dias sem dados são ignorados,
// porque provavelmente o sensor estava desligado).
export async function averageDaily(deviceId, dayStart, days = 14) {
  const totals = [...(await dailyTotals(deviceId, addDays(dayStart, -days), dayStart)).values()].filter((v) => v > 0);
  const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  return { avg, days: totals.length };
}
