import { Router } from 'express';
import { DEMO_MODE } from '../config.js';
import { db } from '../db.js';
import { HttpError, num, text } from '../http.js';
import { getDevice, toAlert, toDevice } from '../models.js';
import { deviceHealth, generateDeviceKey, recordReadings } from '../services/device.js';
import { MIN, addDays, floorMinute, startOfDay } from '../time.js';

const router = Router();

const insertDevice = db.prepare(`
  INSERT INTO devices (user_id, name, device_key, filter_cleaned_at, reservoir_emptied_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const updateDevice = db.prepare(`
  UPDATE devices SET name = :name, street = :street, district = :district, city = :city, state = :state,
    cep = :cep, filter_capacity_l = :filterCapacityL, reservoir_capacity_l = :reservoirCapacityL
  WHERE id = :id
`);
// Ao registrar a manutenção, o aviso correspondente deixa de ser pendente.
const resolveMaintenance = db.prepare(
  'UPDATE alerts SET read_at = ? WHERE device_id = ? AND dedupe_key LIKE ? AND read_at IS NULL',
);
const alertById = db.prepare('SELECT * FROM alerts WHERE id = ?');

function requireOwnDevice(userId) {
  const device = getDevice(userId);
  if (!device) throw new HttpError(404, 'Você ainda não cadastrou um dispositivo.');
  return device;
}

const deviceResponse = (userId) => {
  const device = getDevice(userId);
  return device ? { device: toDevice(device), health: deviceHealth(device) } : { device: null };
};

router.get('/device', (req, res) => res.json(deviceResponse(req.userId)));

router.post('/device', (req, res) => {
  if (getDevice(req.userId)) throw new HttpError(409, 'Você já tem um dispositivo cadastrado.');
  const name = text(req.body?.name, 'Nome do dispositivo', { max: 40, optional: true }) ?? 'GotAlert';
  const now = Date.now();
  insertDevice.run(req.userId, name, generateDeviceKey(), now, now, now);
  res.status(201).json(deviceResponse(req.userId));
});

router.patch('/device', (req, res) => {
  const device = requireOwnDevice(req.userId);
  const body = req.body ?? {};
  const address = body.address ?? {};
  const cep = text(address.cep, 'CEP', { max: 9, optional: true });
  if (cep && !/^\d{5}-?\d{3}$/.test(cep)) throw new HttpError(400, 'Digite o CEP no formato 00000-000.');
  const state = text(address.state, 'UF', { min: 2, max: 2, optional: true });

  updateDevice.run({
    id: device.id,
    name: text(body.name, 'Nome do dispositivo', { max: 40 }),
    street: text(address.street, 'Endereço', { max: 120, optional: true }),
    district: text(address.district, 'Bairro', { max: 80, optional: true }),
    city: text(address.city, 'Cidade', { max: 80, optional: true }),
    state: state?.toUpperCase() ?? null,
    cep,
    filterCapacityL: num(body.filterCapacityL, 'Capacidade da vela', 100, 1_000_000),
    reservoirCapacityL: num(body.reservoirCapacityL, 'Capacidade do reservatório', 100, 1_000_000),
  });
  res.json(deviceResponse(req.userId));
});

router.post('/device/filter-cleaned', (req, res) => {
  const device = requireOwnDevice(req.userId);
  const now = Date.now();
  db.prepare('UPDATE devices SET filter_cleaned_at = ? WHERE id = ?').run(now, device.id);
  resolveMaintenance.run(now, device.id, 'maint:filter:%');
  res.json(deviceResponse(req.userId));
});

router.post('/device/reservoir-emptied', (req, res) => {
  const device = requireOwnDevice(req.userId);
  const now = Date.now();
  db.prepare('UPDATE devices SET reservoir_emptied_at = ? WHERE id = ?').run(now, device.id);
  resolveMaintenance.run(now, device.id, 'maint:reservoir:%');
  res.json(deviceResponse(req.userId));
});

router.post('/device/key', (req, res) => {
  const device = requireOwnDevice(req.userId);
  db.prepare('UPDATE devices SET device_key = ? WHERE id = ?').run(generateDeviceKey(), device.id);
  res.json(deviceResponse(req.userId));
});

// Modo demonstração: gera leituras como se o sensor tivesse medido agora.
// Serve para mostrar os alertas funcionando ao vivo no pitch, sem o hardware.
const SCENARIOS = {
  shower: (now) => minutes(now - 8 * MIN, 8, 9),
  leak: (now) => minutes(now - 75 * MIN, 75, 0.7),
  night: (now) => {
    let start = startOfDay(now) + 2 * 60 * MIN + 10 * MIN; // 2h10
    if (start + 30 * MIN > now) start = addDays(start, -1);
    return minutes(start, 30, 1.2);
  },
};

function minutes(start, count, litersPerMinute) {
  const first = floorMinute(start);
  return Array.from({ length: count }, (_, i) => ({ ts: first + i * MIN, liters: litersPerMinute }));
}

router.post('/device/simulate', (req, res) => {
  if (!DEMO_MODE) throw new HttpError(404, 'O modo demonstração está desligado.');
  const scenario = SCENARIOS[req.body?.scenario];
  if (!scenario) throw new HttpError(400, 'Cenário inválido. Use shower, leak ou night.');
  const device = requireOwnDevice(req.userId);
  const now = Date.now();
  const { accepted, alerts } = recordReadings(device, scenario(now), { now });
  res.json({ accepted, alerts: alerts.map((a) => toAlert(alertById.get(a.id))) });
});

export default router;
