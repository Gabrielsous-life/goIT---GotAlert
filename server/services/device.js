import crypto from 'node:crypto';
import { db, transaction } from '../db.js';
import { MIN, floorMinute, round1 } from '../time.js';
import { evaluateDevice } from './alerts.js';
import { lastReadingAt, sumBetween } from './stats.js';

// Sem sinal por mais tempo que isso, o aparelho aparece como desconectado.
const ONLINE_WINDOW = 5 * MIN;

const upsertReading = db.prepare(`
  INSERT INTO readings (device_id, ts, liters) VALUES (?, ?, ?)
  ON CONFLICT(device_id, ts) DO UPDATE SET liters = liters + excluded.liters
`);
const touchDevice = db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?');
const keyExists = db.prepare('SELECT 1 FROM devices WHERE device_key = ?');

// Chave no formato GA-XXXX-XXXX (sem letras parecidas com números, para digitar fácil)
export function generateDeviceKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const chars = Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
    const key = `GA-${chars.slice(0, 4)}-${chars.slice(4)}`;
    if (!keyExists.get(key)) return key;
  }
}

// Grava as leituras (litros por minuto), marca o aparelho como visto e roda a detecção de alertas.
export function recordReadings(device, readings, { now = Date.now(), silent = false } = {}) {
  const valid = readings.filter((r) => r.liters > 0);
  transaction(() => {
    for (const r of valid) upsertReading.run(device.id, floorMinute(r.ts), r.liters);
    touchDevice.run(now, device.id);
  });
  if (!valid.length) return { accepted: 0, alerts: [] };

  const from = floorMinute(valid.reduce((min, r) => Math.min(min, r.ts), Infinity));
  const alerts = evaluateDevice(device, { from, to: now, silent });
  return { accepted: valid.length, alerts };
}

export function deviceHealth(device, now = Date.now()) {
  const part = (since, capacity) => {
    const used = sumBetween(device.id, since, now + MIN);
    return { usedL: round1(used), capacityL: capacity, pct: Math.round((used / capacity) * 100), since };
  };
  return {
    online: device.last_seen_at != null && now - device.last_seen_at < ONLINE_WINDOW,
    lastSeenAt: device.last_seen_at,
    lastReadingAt: lastReadingAt(device.id),
    filter: part(device.filter_cleaned_at, device.filter_capacity_l),
    reservoir: part(device.reservoir_emptied_at, device.reservoir_capacity_l),
  };
}
