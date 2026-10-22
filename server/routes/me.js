import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { DEMO_MODE } from '../config.js';
import { db } from '../db.js';
import { HttpError, bool, email, int, num, password, text } from '../http.js';
import { getSettings, toSettings, toUser } from '../models.js';

const router = Router();

const userById = (id) => db.get('SELECT * FROM users WHERE id = ?', [id]);

const meResponse = async (userId) => ({
  user: toUser(await userById(userId)),
  settings: toSettings(await getSettings(userId)),
  demoMode: DEMO_MODE,
});

router.get('/me', async (req, res) => res.json(await meResponse(req.userId)));

router.patch('/me', async (req, res) => {
  const body = req.body ?? {};
  const name = text(body.name, 'Nome', { min: 2, max: 80 });
  const mail = email(body.email);
  const phone = text(body.phone, 'Telefone', { min: 8, max: 20, optional: true });
  if (phone && !/^[\d\s()+-]+$/.test(phone)) throw new HttpError(400, 'Telefone: use só números, espaços, parênteses e traço.');
  if (await db.get('SELECT 1 AS taken FROM users WHERE email = ? AND id <> ?', [mail, req.userId])) {
    throw new HttpError(409, 'Já existe outra conta com este e-mail.');
  }

  await db.run('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?', [name, mail, phone, req.userId]);
  res.json(await meResponse(req.userId));
});

router.patch('/me/password', async (req, res) => {
  const body = req.body ?? {};
  const user = await userById(req.userId);
  if (typeof body.current !== 'string' || !(await bcrypt.compare(body.current, user.password_hash))) {
    throw new HttpError(400, 'A senha atual está incorreta.');
  }
  const next = password(body.next, 'Nova senha');
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(next, 10), req.userId]);
  res.json({ ok: true });
});

// Cada campo é opcional: só altera o que vier no corpo da requisição.
const SETTINGS_FIELDS = {
  notifyAnomaly: ['notify_anomaly', (v) => bool(v, 'Alertas de consumo anormal')],
  notifyPush: ['notify_push', (v) => bool(v, 'Notificações no celular')],
  notifyEmail: ['notify_email', (v) => bool(v, 'Notificações por e-mail')],
  quietStart: ['quiet_start', (v) => int(v, 'Início do horário sem uso', 0, 23)],
  quietEnd: ['quiet_end', (v) => int(v, 'Fim do horário sem uso', 0, 23)],
  nightMinLiters: ['night_min_liters', (v) => num(v, 'Litros na madrugada', 1, 500)],
  leakMinutes: ['leak_minutes', (v) => int(v, 'Minutos de fluxo contínuo', 10, 600)],
  tolerancePct: ['tolerance_pct', (v) => int(v, 'Tolerância acima da média', 5, 200)],
  dailyLimitL: ['daily_limit_l', (v) => (v === null || v === '' ? null : num(v, 'Limite diário', 50, 10000))],
};

router.patch('/settings', async (req, res) => {
  const body = req.body ?? {};
  const sets = [];
  const values = [];
  for (const [field, [column, parse]] of Object.entries(SETTINGS_FIELDS)) {
    if (!(field in body)) continue;
    sets.push(`${column} = ?`);
    values.push(parse(body[field]));
  }
  if (sets.length) await db.run(`UPDATE settings SET ${sets.join(', ')} WHERE user_id = ?`, [...values, req.userId]);
  res.json({ settings: toSettings(await getSettings(req.userId)) });
});

export default router;
