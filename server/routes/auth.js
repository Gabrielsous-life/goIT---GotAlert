import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { DEMO_EMAIL, DEMO_MODE, DEMO_PASSWORD } from '../config.js';
import { db, transaction } from '../db.js';
import { signToken } from '../auth.js';
import { HttpError, email, password, text } from '../http.js';
import { toUser } from '../models.js';

const router = Router();

const userByEmail = (mail) => db.get('SELECT * FROM users WHERE email = ?', [mail]);

// Informações públicas que a tela de login usa
router.get('/config', async (req, res) => {
  const demoExists = DEMO_MODE && (await userByEmail(DEMO_EMAIL));
  res.json({
    demoMode: DEMO_MODE,
    demoAccount: demoExists ? { email: DEMO_EMAIL, password: DEMO_PASSWORD } : null,
  });
});

router.post('/register', async (req, res) => {
  const body = req.body ?? {};
  const name = text(body.name, 'Nome', { min: 2, max: 80 });
  const mail = email(body.email);
  const pass = password(body.password);
  if (await userByEmail(mail)) throw new HttpError(409, 'Já existe uma conta com este e-mail.');

  const hash = await bcrypt.hash(pass, 10);
  const id = await transaction(async (tx) => {
    const { lastInsertRowid } = await tx.run(
      'INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
      [name, mail, hash, Date.now()],
    );
    await tx.run('INSERT INTO settings (user_id) VALUES (?)', [lastInsertRowid]);
    return lastInsertRowid;
  });

  const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
  res.status(201).json({ token: signToken(id), user: toUser(user) });
});

router.post('/login', async (req, res) => {
  const body = req.body ?? {};
  const user = typeof body.email === 'string' && (await userByEmail(body.email.trim().toLowerCase()));
  const ok = user && typeof body.password === 'string' && (await bcrypt.compare(body.password, user.password_hash));
  if (!ok) throw new HttpError(401, 'E-mail ou senha incorretos.');
  res.json({ token: signToken(user.id), user: toUser(user) });
});

export default router;
