import { Router } from 'express';
import { db } from '../db.js';
import { HttpError } from '../http.js';
import { getDevice, toAlert } from '../models.js';
import { deviceHealth } from '../services/device.js';
import { averageDaily, dailyTotals, hourlyTotals, sumBetween } from '../services/stats.js';
import { HOUR, MIN, addDays, dayKey, parseDayKey, round1, startOfDay } from '../time.js';

const router = Router();

const ANOMALY_TYPES = "('leak', 'night')";
const LATEST_UNREAD = `
  SELECT * FROM alerts WHERE user_id = ? AND read_at IS NULL
  ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC LIMIT 1
`;
const anomaliesInRange = (userId, before, after) => db.all(`
  SELECT period_start, period_end FROM alerts
  WHERE user_id = ? AND type IN ${ANOMALY_TYPES} AND period_start < ? AND period_end > ?
`, [userId, before, after]);
const alertsInRange = (userId, before, after) => db.all(`
  SELECT * FROM alerts
  WHERE user_id = ? AND type <> 'maintenance' AND period_start < ? AND period_end > ?
  ORDER BY created_at
`, [userId, before, after]);

const changePct = (current, previous) => (previous > 0 ? round1(((current - previous) / previous) * 100) : null);

// Horas do dia (0-23) cobertas por algum alerta de vazamento ou consumo de madrugada
async function anomalyHours(userId, dayStart) {
  const dayEnd = addDays(dayStart, 1);
  const hours = new Set();
  for (const a of await anomaliesInRange(userId, dayEnd, dayStart)) {
    const end = Math.min(a.period_end, dayEnd);
    for (let t = Math.max(a.period_start, dayStart); t < end; t += MIN) hours.add(new Date(t).getHours());
  }
  return [...hours].sort((a, b) => a - b);
}

function dayParam(value, now) {
  if (!value) return startOfDay(now);
  const day = parseDayKey(value);
  if (day == null) throw new HttpError(400, 'Data inválida. Use o formato AAAA-MM-DD.');
  return day;
}

router.get('/consumption/summary', async (req, res) => {
  const now = Date.now();
  const unreadAlerts = Number(
    (await db.get('SELECT COUNT(*) AS n FROM alerts WHERE user_id = ? AND read_at IS NULL', [req.userId])).n,
  );
  const latest = await db.get(LATEST_UNREAD, [req.userId]);
  const latestAlert = latest ? toAlert(latest) : null;

  const device = await getDevice(req.userId);
  if (!device) return res.json({ hasDevice: false, now, unreadAlerts, latestAlert });

  const today = startOfDay(now);
  const yesterday = addDays(today, -1);
  const todayTotal = await sumBetween(device.id, today, now + MIN);
  // Compara com ontem até o mesmo horário, senão o dia de hoje sempre pareceria menor.
  const yesterdaySameTime = await sumBetween(device.id, yesterday, yesterday + (now - today));
  const { avg, days } = await averageDaily(device.id, today);

  res.json({
    hasDevice: true,
    now,
    today: { liters: round1(todayTotal), changePct: changePct(todayTotal, yesterdaySameTime) },
    yesterday: { liters: round1(await sumBetween(device.id, yesterday, today)) },
    average: { liters: round1(avg), days },
    hourly: (await hourlyTotals(device.id, today)).map(round1),
    anomalyHours: await anomalyHours(req.userId, today),
    unreadAlerts,
    latestAlert,
    device: { name: device.name, ...(await deviceHealth(device, now)) },
  });
});

router.get('/consumption/day', async (req, res) => {
  const device = await getDevice(req.userId);
  const now = Date.now();
  const day = dayParam(req.query.date, now);
  const dayEnd = addDays(day, 1);
  if (!device) return res.json({ date: dayKey(day), total: 0, hourly: Array(24).fill(0), anomalyHours: [], alerts: [] });

  const hourly = (await hourlyTotals(device.id, day)).map(round1);
  res.json({
    date: dayKey(day),
    total: round1(hourly.reduce((a, b) => a + b, 0)),
    average: round1((await averageDaily(device.id, day)).avg),
    hourly,
    anomalyHours: await anomalyHours(req.userId, day),
    alerts: (await alertsInRange(req.userId, dayEnd, day)).map(toAlert),
  });
});

router.get('/consumption/week', async (req, res) => {
  const device = await getDevice(req.userId);
  const endDay = dayParam(req.query.end, Date.now());
  const startDay = addDays(endDay, -6);
  const totals = await dailyTotals(device?.id ?? 0, startDay, addDays(endDay, 1));
  const days = [...totals].map(([date, liters]) => ({ date, liters: round1(liters) }));
  const withData = days.filter((d) => d.liters > 0);

  res.json({
    days,
    total: round1(days.reduce((a, d) => a + d.liters, 0)),
    average: withData.length ? round1(withData.reduce((a, d) => a + d.liters, 0) / withData.length) : 0,
  });
});

router.get('/consumption/month', async (req, res) => {
  const device = await getDevice(req.userId);
  const now = Date.now();

  let year, month;
  if (req.query.month) {
    const m = /^(\d{4})-(\d{2})$/.exec(req.query.month);
    if (!m || +m[2] < 1 || +m[2] > 12) throw new HttpError(400, 'Mês inválido. Use o formato AAAA-MM.');
    [year, month] = [+m[1], +m[2] - 1];
  } else {
    const d = new Date(now);
    [year, month] = [d.getFullYear(), d.getMonth()];
  }

  const first = new Date(year, month, 1).getTime();
  const next = new Date(year, month + 1, 1).getTime();
  const totals = await dailyTotals(device?.id ?? 0, first, next);
  const days = [...totals].map(([date, liters]) => ({
    date,
    liters: parseDayKey(date) > now ? null : round1(liters),
  }));

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    weeks.push({
      from: chunk[0].date,
      to: chunk.at(-1).date,
      liters: chunk.every((d) => d.liters == null) ? null : round1(chunk.reduce((a, d) => a + (d.liters ?? 0), 0)),
    });
  }

  const total = days.reduce((a, d) => a + (d.liters ?? 0), 0);
  const withData = days.filter((d) => d.liters > 0);
  const maxDay = withData.reduce((best, d) => (!best || d.liters > best.liters ? d : best), null);

  // No mês atual, compara com o mesmo número de dias do mês anterior.
  const prevFirst = new Date(year, month - 1, 1).getTime();
  const isCurrent = now >= first && now < next;
  const prevEnd = isCurrent ? Math.min(prevFirst + (now - first), first) : first;
  const prevTotal = device ? await sumBetween(device.id, prevFirst, prevEnd) : 0;

  const alertDates = new Set();
  if (device) {
    for (const a of await alertsInRange(req.userId, next, first)) alertDates.add(dayKey(Math.max(a.period_start, first)));
  }

  res.json({
    month: `${year}-${String(month + 1).padStart(2, '0')}`,
    days,
    weeks,
    total: round1(total),
    average: withData.length ? round1(total / withData.length) : 0,
    previous: { total: round1(prevTotal), samePeriod: isCurrent },
    changePct: changePct(total, prevTotal),
    maxDay,
    alertDates: [...alertDates].sort(),
  });
});

export default router;
