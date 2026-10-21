// Cria a conta de demonstração com 60 dias de consumo simulado.
// Uso: npm run seed   (apaga e recria só a conta de demonstração)
import { DEMO_DEVICE_KEY, DEMO_EMAIL, DEMO_PASSWORD } from '../server/config.js';
import bcrypt from 'bcryptjs';
import { db, transaction } from '../server/db.js';
import { recordReadings } from '../server/services/device.js';
import { MIN, addDays, startOfDay } from '../server/time.js';

const DAYS = 60;

// Gerador pseudoaleatório com semente fixa: todo seed gera os mesmos dados.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20251021);
const between = (min, max) => min + rand() * (max - min);
const intBetween = (min, max) => Math.floor(between(min, max + 1));

/**
 * Usos de água de uma casa com 4 pessoas ao longo de um dia.
 * Os valores são uma simulação para demonstração, não medições reais.
 * Retorna eventos { start (minuto do dia), duration (min), lpm (litros/min) }.
 */
function householdDay({ weekend, wakeUp }) {
  const events = [];
  const at = (fromHour, toHour) => Math.floor(between(fromHour * 60, toHour * 60));
  const add = (start, duration, lpm) => events.push({ start, duration, lpm });
  const morning = weekend ? [8, 10.5] : [wakeUp, 8.5];

  for (let i = 0, n = intBetween(3, 4); i < n; i++) {
    add(i < 2 ? at(...morning) : at(18, 22.5), intBetween(6, 10), between(8, 10)); // banho
  }
  for (let i = 0, n = intBetween(12, 18); i < n; i++) add(at(morning[0], 23), 1, 6); // descarga
  for (let i = 0, n = intBetween(20, 30); i < n; i++) add(at(morning[0], 23), 1, between(1, 2.5)); // pia
  add(at(11, 12.5), intBetween(6, 12), between(3, 5)); // louça do almoço
  add(at(19.5, 21.5), intBetween(6, 12), between(3, 5)); // louça do jantar
  if (weekend || rand() < 0.4) {
    const start = at(9, 15); // máquina de lavar: três enchimentos
    for (let k = 0; k < 3; k++) add(start + k * 25, 4, 10);
  }
  return events;
}

// Converte eventos em leituras por minuto e ajusta o total do dia para `target` litros.
function toReadings(dayStart, events, target) {
  const total = events.reduce((sum, e) => sum + e.duration * e.lpm, 0);
  const scale = target / total;
  const byMinute = new Map();
  for (const e of events) {
    for (let m = 0; m < e.duration; m++) {
      const minute = Math.min(e.start + m, 24 * 60 - 1);
      byMinute.set(minute, (byMinute.get(minute) ?? 0) + e.lpm * scale);
    }
  }
  return [...byMinute].map(([minute, liters]) => ({ ts: dayStart + minute * MIN, liters: Math.round(liters * 100) / 100 }));
}

const now = Date.now();
const today = startOfDay(now);
const firstDay = addDays(today, -DAYS);

const deviceId = transaction(() => {
  db.prepare('DELETE FROM users WHERE email = ?').run(DEMO_EMAIL);
  db.prepare('DELETE FROM devices WHERE device_key = ?').run(DEMO_DEVICE_KEY);

  const { lastInsertRowid: userId } = db
    .prepare('INSERT INTO users (name, email, phone, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('Júlia Souza', DEMO_EMAIL, '(43) 90000-0000', bcrypt.hashSync(DEMO_PASSWORD, 10), firstDay);
  db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(userId);

  const { lastInsertRowid } = db
    .prepare(`
      INSERT INTO devices (user_id, name, device_key, street, district, city, state, cep,
        filter_cleaned_at, reservoir_emptied_at, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      userId, 'GotAlert da casa', DEMO_DEVICE_KEY,
      'Rua das Nascentes, 100', 'Centro', 'Londrina', 'PR', '86000-000',
      addDays(today, -26) + 9 * 60 * MIN, // vela limpa há 26 dias
      addDays(today, -10) + 9 * 60 * MIN, // reservatório esvaziado há 10 dias
      now, firstDay,
    );
  return Number(lastInsertRowid);
});

const readings = [];
for (let day = firstDay; day <= today; day = addDays(day, 1)) {
  const daysAgo = Math.round((today - day) / (24 * 60 * MIN));
  const weekday = new Date(day).getDay();
  const weekend = weekday === 0 || weekday === 6;

  // Dia do exemplo do projeto: média entre 560 e 620 L, mas 720 L no total,
  // com água correndo sem parar entre 3h23 e 6h44 (possível vazamento).
  if (daysAgo === 1) {
    readings.push(...toReadings(day, householdDay({ weekend, wakeUp: 7 }), 590));
    const leakStart = day + (3 * 60 + 23) * MIN;
    const leakMinutes = (6 * 60 + 44) - (3 * 60 + 23);
    for (let m = 0; m < leakMinutes; m++) readings.push({ ts: leakStart + m * MIN, liters: 130 / leakMinutes });
    continue;
  }

  const events = householdDay({ weekend, wakeUp: 6 });
  let target = between(560, 620);
  if (daysAgo === 9) {
    events.push({ start: 17 * 60, duration: 25, lpm: 9 }); // mangueira no jardim: dia acima da média
    target += 225;
  }
  if (daysAgo === 20) {
    // Descarga com defeito durante a madrugada: 30 L entre 2h05 e 2h35
    for (let m = 0; m < 30; m++) readings.push({ ts: day + (2 * 60 + 5 + m) * MIN, liters: 1 });
  }
  readings.push(...toReadings(day, events, target));
}

const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
const past = readings.filter((r) => r.ts < now);
const { accepted, alerts } = recordReadings(device, past, { now, silent: true });

// Alertas com mais de 2 dias já foram vistos pela usuária.
db.prepare('UPDATE alerts SET read_at = created_at + 3600000 WHERE device_id = ? AND created_at < ?').run(deviceId, now - 2 * 24 * 60 * MIN);

console.log(`Conta de demonstração criada: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
console.log(`Chave do dispositivo: ${DEMO_DEVICE_KEY}`);
console.log(`${accepted} leituras em ${DAYS + 1} dias, ${alerts.length} alertas gerados.`);
