import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { DEMO_EMAIL, DEMO_MODE, DEMO_PASSWORD } from '../config.js';
import { db, transaction } from '../db.js';
import { signToken } from '../auth.js';
import { HttpError, email, password, text } from '../http.js';
import { toUser } from '../models.js';

const router = Router();

const userByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const insertUser = db.prepare(
  'INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
);
const insertSettings = db.prepare('INSERT INTO settings (user_id) VALUES (?)');
const userById = db.prepare('SELECT * FROM users WHERE id = ?');

// Informações públicas que a tela de login usa
router.get('/config', (req, res) => {
  const demoExists = DEMO_MODE && userByEmail.get(DEMO_EMAIL);
  res.json({
    demoMode: DEMO_MODE,
    demoAccount: demoExists ? { email: DEMO_EMAIL, password: DEMO_PASSWORD } : null,
  });
});

router.post('/register', (req, res) => {
  const body = req.body ?? {};
  const name = text(body.name, 'Nome', { min: 2, max: 80 });
  const mail = email(body.email);
  const pass = password(body.password);
  if (userByEmail.get(mail)) throw new HttpError(409, 'Já existe uma conta com este e-mail.');

  const hash = bcrypt.hashSync(pass, 10);
  const id = transaction(() => {
    const { lastInsertRowid } = insertUser.run(name, mail, hash, Date.now());
    insertSettings.run(lastInsertRowid);
    return Number(lastInsertRowid);
  });

  res.status(201).json({ token: signToken(id), user: toUser(userById.get(id)) });
});

router.post('/login', (req, res) => {
  const body = req.body ?? {};
  const user = typeof body.email === 'string' && userByEmail.get(body.email.trim().toLowerCase());
  const ok = user && typeof body.password === 'string' && bcrypt.compareSync(body.password, user.password_hash);
  if (!ok) throw new HttpError(401, 'E-mail ou senha incorretos.');
  res.json({ token: signToken(user.id), user: toUser(user) });
});

export default router;
