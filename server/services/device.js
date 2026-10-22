import crypto from 'node:crypto';
import { db, transaction, upsertReadings } from '../db.js';
import { MIN, floorMinute, round1 } from '../time.js';
import { evaluateDevice } from './alerts.js';
import { lastReadingAt, sumBetween } from './stats.js';

// Sem sinal por mais tempo que isso, o aparelho aparece como desconectado.
const ONLINE_WINDOW = 5 * MIN;

// Chave no formato GA-XXXX-XXXX (sem letras parecidas com números, para digitar fácil)
export async function generateDeviceKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const chars = Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
    const key = `GA-${chars.slice(0, 4)}-${chars.slice(4)}`;
    if (!(await db.get('SELECT 1 AS ok FROM devices WHERE device_key = ?', [key]))) return key;
  }
}

// Grava as leituras (litros por minuto), marca o aparelho como visto e roda a detecção de alertas.
export async function recordReadings(device, readings, { now = Date.now(), silent = false } = {}) {
  const valid = readings.filter((r) => r.liters > 0);
  await transaction(async (tx) => {
    await upsertReadings(tx, device.id, valid.map((r) => ({ ts: floorMinute(r.ts), liters: r.liters })));
    await tx.run('UPDATE devices SET last_seen_at = ? WHERE id = ?', [now, device.id]);
  });
  if (!valid.length) return { accepted: 0, alerts: [] };

  const from = floorMinute(valid.reduce((min, r) => Math.min(min, r.ts), Infinity));
  const alerts = await evaluateDevice(device, { from, to: now, silent });
  return { accepted: valid.length, alerts };
}

export async function deviceHealth(device, now = Date.now()) {
  const part = async (since, capacity) => {
    const used = await sumBetween(device.id, since, now + MIN);
    return { usedL: round1(used), capacityL: capacity, pct: Math.round((used / capacity) * 100), since };
  };
  return {
    online: device.last_seen_at != null && now - device.last_seen_at < ONLINE_WINDOW,
    lastSeenAt: device.last_seen_at,
    lastReadingAt: await lastReadingAt(device.id),
    filter: await part(device.filter_cleaned_at, device.filter_capacity_l),
    reservoir: await part(device.reservoir_emptied_at, device.reservoir_capacity_l),
  };
}
