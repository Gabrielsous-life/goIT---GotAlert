import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './config.js';
import { db } from './db.js';
import { HttpError } from './http.js';

const TOKEN_TTL = '7d';

export const signToken = (userId) => jwt.sign({ sub: String(userId) }, JWT_SECRET, { expiresIn: TOKEN_TTL });

const userExists = db.prepare('SELECT id FROM users WHERE id = ?');
const deviceByKey = db.prepare('SELECT * FROM devices WHERE device_key = ?');

// Rotas do app: exige "Authorization: Bearer <token>"
export function requireAuth(req, res, next) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Faça login para continuar.');

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
  }

  const id = Number(payload.sub);
  if (!userExists.get(id)) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
  req.userId = id;
  next();
}

// Rotas do sensor: exige "X-Device-Key: <chave do aparelho>"
export function requireDevice(req, res, next) {
  const key = req.get('x-device-key');
  const device = key && deviceByKey.get(key);
  if (!device) throw new HttpError(401, 'Chave do dispositivo inválida.');
  req.device = device;
  next();
}
