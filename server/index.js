import os from 'node:os';
import path from 'node:path';
import { PORT, ROOT } from './config.js';
import express from 'express';
import { requireAuth } from './auth.js';
import { dialect } from './db.js';
import alertsRoutes from './routes/alerts.js';
import authRoutes from './routes/auth.js';
import consumptionRoutes from './routes/consumption.js';
import deviceRoutes from './routes/device.js';
import ingestRoutes from './routes/ingest.js';
import meRoutes from './routes/me.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/ingest', ingestRoutes);
app.use('/api', requireAuth, meRoutes, deviceRoutes, consumptionRoutes, alertsRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

app.use(express.static(path.join(ROOT, 'public')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido no corpo da requisição.' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`\nGotAlert rodando em http://localhost:${PORT}`);
  console.log(`Banco de dados: ${dialect === 'mysql' ? 'TiDB/MySQL (DATABASE_URL)' : 'SQLite (data/gotalert.db)'}`);
  // Endereços da rede local, para abrir no celular conectado ao mesmo Wi-Fi
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`No celular (mesmo Wi-Fi): http://${a.address}:${PORT}`);
    }
  }
});
