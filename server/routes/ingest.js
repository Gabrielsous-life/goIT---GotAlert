import { Router } from 'express';
import { requireDevice } from '../auth.js';
import { db } from '../db.js';
import { HttpError } from '../http.js';
import { recordReadings } from '../services/device.js';
import { HOUR, MIN } from '../time.js';

// API usada pelo sensor (ESP32 ou simulador). Autentica pelo cabeçalho X-Device-Key.
const router = Router();
router.use(requireDevice);

// Vazão máxima aceitável para uma casa; acima disso a leitura provavelmente está errada.
const MAX_LITERS_PER_MINUTE = 60;
const MAX_BATCH = 1440;

function parseReading(r, now) {
  if (!r || typeof r !== 'object') throw new HttpError(400, 'Leitura inválida.');
  const liters = Number(r.liters);
  if (!Number.isFinite(liters) || liters < 0 || liters > MAX_LITERS_PER_MINUTE) {
    throw new HttpError(400, `Litros por leitura devem ficar entre 0 e ${MAX_LITERS_PER_MINUTE}.`);
  }
  const ts = r.ts == null ? now : typeof r.ts === 'number' ? r.ts : Date.parse(r.ts);
  if (!Number.isFinite(ts) || ts > now + 5 * MIN || ts < now - 30 * 24 * HOUR) {
    throw new HttpError(400, 'Horário da leitura inválido (use milissegundos ou ISO 8601, até 30 dias atrás).');
  }
  return { ts: Math.min(ts, now), liters };
}

// Aceita uma leitura { liters, ts? } ou um lote { readings: [...] }
router.post('/readings', async (req, res) => {
  const now = Date.now();
  const body = req.body ?? {};
  const list = Array.isArray(body.readings) ? body.readings : [body];
  if (list.length > MAX_BATCH) throw new HttpError(400, `Envie no máximo ${MAX_BATCH} leituras por vez.`);

  const { accepted, alerts } = await recordReadings(req.device, list.map((r) => parseReading(r, now)), { now });
  res.json({ accepted, newAlerts: alerts.map((a) => ({ id: a.id, type: a.type, title: a.title })) });
});

// Sinal de vida: o app mostra o aparelho como conectado mesmo quando ninguém usa água.
router.post('/heartbeat', async (req, res) => {
  const now = Date.now();
  await db.run('UPDATE devices SET last_seen_at = ? WHERE id = ?', [now, req.device.id]);
  res.json({ ok: true, serverTime: now });
});

export default router;
