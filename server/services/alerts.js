import { db } from '../db.js';
import { getSettings } from '../models.js';
import { MIN, HOUR, addDays, dayKey, formatDate, formatLiters, formatTime, startOfDay } from '../time.js';
import { readingsBetween, sumBetween } from './stats.js';

// Leituras separadas por até 1 minuto sem fluxo ainda contam como o mesmo uso contínuo.
const RUN_GAP = 2 * MIN;
// Um vazamento pode ter começado bem antes da leitura que acabou de chegar.
const LOOKBACK = 24 * HOUR;
// Dias usados para calcular a média diária.
const AVERAGE_DAYS = 14;
// Avisa a manutenção quando o uso chega a 90% da capacidade estimada.
const MAINTENANCE_THRESHOLD = 0.9;

const INSERT_ALERT = `
  INSERT INTO alerts (user_id, device_id, type, severity, title, message, period_start, period_end, liters, created_at, dedupe_key)
  VALUES (:userId, :deviceId, :type, :severity, :title, :message, :periodStart, :periodEnd, :liters, :createdAt, :key)
`;

/**
 * Analisa as leituras do dispositivo a partir de `from` e cria (ou atualiza) os alertas:
 *  - leak:        fluxo contínuo por muito tempo (possível vazamento)
 *  - night:       consumo no período em que normalmente ninguém usa água
 *  - above_avg:   consumo do dia acima da média dos últimos 14 dias
 *  - limit:       consumo do dia acima do limite definido pelo usuário
 *  - maintenance: hora de limpar a vela ou esvaziar o reservatório
 * Retorna somente os alertas novos.
 */
export async function evaluateDevice(device, { from, to = Date.now(), silent = false }) {
  const settings = await getSettings(device.user_id);
  const created = [];
  const pending = [];

  // As regras só decidem o que avisar; a gravação no banco acontece depois, em sequência.
  const emit = (alert) => pending.push({ userId: device.user_id, deviceId: device.id, ...alert });

  // Busca as leituras uma vez só (inclui os dias anteriores, para a média),
  // em vez de consultar o banco dia por dia.
  const rows = await readingsBetween(device.id, addDays(startOfDay(from), -AVERAGE_DAYS), to + MIN);
  const supersedes = checkRuns(device, settings, rows, from, emit);
  checkDaily(device, settings, rows, from, to, emit);
  await checkMaintenance(device, to, emit);

  for (const row of pending) {
    const existing = await db.get('SELECT id FROM alerts WHERE dedupe_key = ?', [row.key]);
    if (existing) {
      await db.run('UPDATE alerts SET message = :message, period_end = :periodEnd, liters = :liters WHERE id = :id', {
        id: existing.id, message: row.message, periodEnd: row.periodEnd, liters: row.liters,
      });
      continue;
    }
    const { lastInsertRowid } = await db.run(INSERT_ALERT, row);
    created.push({ id: lastInsertRowid, ...row });
  }
  // Quando vira possível vazamento, o aviso de madrugada do mesmo uso deixa de ficar pendente.
  for (const [readAt, key] of supersedes) {
    await db.run('UPDATE alerts SET read_at = ? WHERE dedupe_key = ? AND read_at IS NULL', [readAt, key]);
  }

  if (!silent) for (const alert of created) await notify(alert, settings);
  return created;
}

function checkRuns(device, settings, allRows, from, emit) {
  const rows = allRows.filter((r) => r.ts >= from - LOOKBACK);
  const supersedes = [];

  for (const run of findRuns(rows)) {
    if (run.end <= from) continue;

    const minutes = Math.round((run.end - run.start) / MIN);
    const period = `entre ${formatTime(run.start)} e ${formatTime(run.end)}`;
    const nightRows = run.rows.filter((r) => inQuietHours(r.ts, settings));
    const isNight = nightRows.length > 0;

    if (minutes >= settings.leak_minutes) {
      emit({
        key: `leak:${device.id}:${run.start}`,
        type: 'leak',
        severity: 'critical',
        title: isNight ? 'Possível vazamento durante a madrugada' : 'Possível vazamento',
        message:
          `A água ficou correndo sem parar ${period} (${minutes} min, ${formatLiters(run.liters)}). ` +
          'Isso costuma indicar torneira aberta, descarga com defeito ou vazamento.',
        periodStart: run.start,
        periodEnd: run.end,
        liters: run.liters,
        createdAt: run.start + settings.leak_minutes * MIN,
      });
    }

    const nightLiters = nightRows.reduce((sum, r) => sum + r.liters, 0);
    if (isNight && nightLiters >= settings.night_min_liters) {
      emit({
        key: `night:${device.id}:${run.start}`,
        type: 'night',
        severity: 'warning',
        title: 'Consumo de água durante a madrugada',
        message: `Foi identificado consumo de ${formatLiters(run.liters)} ${period}, período em que normalmente não há utilização.`,
        periodStart: run.start,
        periodEnd: run.end,
        liters: run.liters,
        createdAt: crossingTime(nightRows, settings.night_min_liters),
      });
    }

    if (minutes >= settings.leak_minutes) supersedes.push([run.start + settings.leak_minutes * MIN, `night:${device.id}:${run.start}`]);
  }
  return supersedes;
}

function checkDaily(device, settings, allRows, from, to, emit) {
  const totalsByDay = new Map();
  for (const r of allRows) totalsByDay.set(dayKey(r.ts), (totalsByDay.get(dayKey(r.ts)) ?? 0) + r.liters);

  for (let day = startOfDay(from); day <= to; day = addDays(day, 1)) {
    const dayEnd = Math.min(addDays(day, 1), to + MIN);
    const rows = allRows.filter((r) => r.ts >= day && r.ts < dayEnd);
    if (!rows.length) continue;

    const total = rows.reduce((sum, r) => sum + r.liters, 0);
    const periodEnd = rows.at(-1).ts + MIN;
    const { avg, days } = averageBefore(totalsByDay, day);

    // Só compara com a média depois de ter pelo menos uma semana de histórico.
    const threshold = avg * (1 + settings.tolerance_pct / 100);
    if (days >= 7 && total > threshold) {
      emit({
        key: `above_avg:${device.id}:${day}`,
        type: 'above_avg',
        severity: 'warning',
        title: 'Consumo acima da média',
        message:
          `O consumo de ${formatDate(day)} chegou a ${formatLiters(total)}, ` +
          `acima da sua média de ${formatLiters(avg)} por dia (alerta a partir de +${settings.tolerance_pct}%).`,
        periodStart: day,
        periodEnd,
        liters: total,
        createdAt: crossingTime(rows, threshold),
      });
    }

    const limit = settings.daily_limit_l;
    if (limit && total > limit) {
      emit({
        key: `limit:${device.id}:${day}`,
        type: 'limit',
        severity: 'warning',
        title: 'Limite diário ultrapassado',
        message: `O consumo de ${formatDate(day)} chegou a ${formatLiters(total)} e passou do limite de ${formatLiters(limit)} que você definiu.`,
        periodStart: day,
        periodEnd,
        liters: total,
        createdAt: crossingTime(rows, limit),
      });
    }
  }
}

// Mesma regra de stats.averageDaily, mas usando os totais já calculados.
function averageBefore(totalsByDay, dayStart) {
  const totals = [];
  for (let d = addDays(dayStart, -AVERAGE_DAYS); d < dayStart; d = addDays(d, 1)) {
    const v = totalsByDay.get(dayKey(d)) ?? 0;
    if (v > 0) totals.push(v);
  }
  const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  return { avg, days: totals.length };
}

async function checkMaintenance(device, to, emit) {
  const parts = [
    {
      kind: 'filter',
      since: device.filter_cleaned_at,
      capacity: device.filter_capacity_l,
      title: 'Hora de limpar a vela do filtro',
      action: 'Limpe a vela e registre a limpeza na tela Meu dispositivo.',
    },
    {
      kind: 'reservoir',
      since: device.reservoir_emptied_at,
      capacity: device.reservoir_capacity_l,
      title: 'Esvazie o reservatório de resíduos',
      action: 'Esvazie o reservatório e registre na tela Meu dispositivo.',
    },
  ];

  for (const part of parts) {
    const used = await sumBetween(device.id, part.since, to + MIN);
    if (used < part.capacity * MAINTENANCE_THRESHOLD) continue;
    const pct = Math.round((used / part.capacity) * 100);
    emit({
      key: `maint:${part.kind}:${device.id}:${part.since}`,
      type: 'maintenance',
      severity: 'info',
      title: part.title,
      message: `Já passaram ${formatLiters(used)} pelo filtro desde ${formatDate(part.since)} (${pct}% da capacidade estimada). ${part.action}`,
      periodStart: part.since,
      periodEnd: to,
      liters: used,
      createdAt: to,
    });
  }
}

function findRuns(rows) {
  const runs = [];
  let current = null;
  for (const r of rows) {
    if (current && r.ts - current.lastTs <= RUN_GAP) {
      current.lastTs = r.ts;
      current.liters += r.liters;
      current.rows.push(r);
    } else {
      current = { start: r.ts, lastTs: r.ts, liters: r.liters, rows: [r] };
      runs.push(current);
    }
  }
  for (const run of runs) run.end = run.lastTs + MIN;
  return runs;
}

// Início == fim desliga a regra; início > fim atravessa a meia-noite (ex.: 23h às 5h).
function inQuietHours(ts, s) {
  const h = new Date(ts).getHours();
  return s.quiet_start <= s.quiet_end
    ? h >= s.quiet_start && h < s.quiet_end
    : h >= s.quiet_start || h < s.quiet_end;
}

// Momento em que a soma das leituras passou do limite
function crossingTime(rows, limit) {
  let sum = 0;
  for (const r of rows) {
    sum += r.liters;
    if (sum > limit) return r.ts + MIN;
  }
  return rows.at(-1).ts + MIN;
}

async function notify(alert, settings) {
  if (!settings.notify_anomaly || !settings.notify_email) return;
  // Envio de e-mail real precisa de um servidor SMTP; por enquanto só registramos no console.
  const { email } = await db.get('SELECT email FROM users WHERE id = ?', [alert.userId]);
  console.log(`[e-mail simulado] Para ${email}: ${alert.title} — ${alert.message}`);
}
