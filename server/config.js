import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = path.resolve(import.meta.dirname, '..');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

// O consumo é agrupado por dia e por hora no horário local, então o fuso precisa ser fixo.
process.env.TZ ||= 'America/Sao_Paulo';

export const DATA_DIR = path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const PORT = Number(process.env.PORT) || 3000;
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'gotalert.db');
export const DEMO_MODE = process.env.DEMO_MODE !== 'false';
export const JWT_SECRET = process.env.JWT_SECRET || loadOrCreateSecret();

export const DEMO_EMAIL = 'julia@exemplo.com';
export const DEMO_PASSWORD = 'gotalert123';
export const DEMO_DEVICE_KEY = 'GA-DEMO-0001';

function loadOrCreateSecret() {
  const file = path.join(DATA_DIR, '.jwt-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret);
  return secret;
}
