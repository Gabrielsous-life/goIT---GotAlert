import { Router } from 'express';
import { db } from '../db.js';
import { HttpError } from '../http.js';
import { toAlert } from '../models.js';

const router = Router();

const TYPES = ['leak', 'night', 'above_avg', 'limit', 'maintenance'];

// ?type=leak  ?unread=true  ?after=<id> (só os mais novos que esse id)  ?limit=50
router.get('/alerts', async (req, res) => {
  const where = ['user_id = ?'];
  const params = [req.userId];
  const { type, unread, after } = req.query;

  if (type) {
    if (!TYPES.includes(type)) throw new HttpError(400, 'Tipo de alerta inválido.');
    where.push('type = ?');
    params.push(type);
  }
  if (unread === 'true') where.push('read_at IS NULL');
  if (after) {
    where.push('id > ?');
    params.push(Number(after) || 0);
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

  const rows = await db.all(
    `SELECT * FROM alerts WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ${limit}`,
    params,
  );
  res.json({ alerts: rows.map(toAlert) });
});

router.get('/alerts/status', async (req, res) => {
  const { unread, latestId } = await db.get(
    'SELECT COALESCE(SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END), 0) AS unread, MAX(id) AS latestId FROM alerts WHERE user_id = ?',
    [req.userId],
  );
  res.json({ unread: Number(unread), latestId: latestId ?? 0 });
});

router.post('/alerts/read-all', async (req, res) => {
  await db.run('UPDATE alerts SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [Date.now(), req.userId]);
  res.json({ ok: true });
});

router.post('/alerts/:id/read', async (req, res) => {
  const id = Number(req.params.id);
  await db.run('UPDATE alerts SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', [Date.now(), id, req.userId]);
  const alert = await db.get('SELECT * FROM alerts WHERE id = ? AND user_id = ?', [id, req.userId]);
  if (!alert) throw new HttpError(404, 'Alerta não encontrado.');
  res.json({ alert: toAlert(alert) });
});

export default router;
