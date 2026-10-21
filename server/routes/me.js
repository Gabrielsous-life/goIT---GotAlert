import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { DEMO_MODE } from '../config.js';
import { db } from '../db.js';
import { HttpError, bool, email, int, num, password, text } from '../http.js';
import { getSettings, toSettings, toUser } from '../models.js';

const router = Router();

const userById = db.prepare('SELECT * FROM users WHERE id = ?');
const emailTaken = db.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?');
const updateUser = db.prepare('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?');
const updatePassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');

const meResponse = (userId) => ({
  user: toUser(userById.get(userId)),
  settings: toSettings(getSettings(userId)),
  demoMode: DEMO_MODE,
});

router.get('/me', (req, res) => res.json(meResponse(req.userId)));

router.patch('/me', (req, res) => {
  const body = req.body ?? {};
  const name = text(body.name, 'Nome', { min: 2, max: 80 });
  const mail = email(body.email);
  const phone = text(body.phone, 'Telefone', { min: 8, max: 20, optional: true });
  if (phone && !/^[\d\s()+-]+$/.test(phone)) throw new HttpError(400, 'Telefone: use só números, espaços, parênteses e traço.');
  if (emailTaken.get(mail, req.userId)) throw new HttpError(409, 'Já existe outra conta com este e-mail.');

  updateUser.run(name, mail, phone, req.userId);
  res.json(meResponse(req.userId));
});

router.patch('/me/password', (req, res) => {
  const body = req.body ?? {};
  const user = userById.get(req.userId);
  if (typeof body.current !== 'string' || !bcrypt.compareSync(body.current, user.password_hash)) {
    throw new HttpError(400, 'A senha atual está incorreta.');
  }
  const next = password(body.next, 'Nova senha');
  updatePassword.run(bcrypt.hashSync(next, 10), req.userId);
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

router.patch('/settings', (req, res) => {
  const body = req.body ?? {};
  const sets = [];
  const values = [];
  for (const [field, [column, parse]] of Object.entries(SETTINGS_FIELDS)) {
    if (!(field in body)) continue;
    sets.push(`${column} = ?`);
    values.push(parse(body[field]));
  }
  if (sets.length) db.prepare(`UPDATE settings SET ${sets.join(', ')} WHERE user_id = ?`).run(...values, req.userId);
  res.json({ settings: toSettings(getSettings(req.userId)) });
});

export default router;
