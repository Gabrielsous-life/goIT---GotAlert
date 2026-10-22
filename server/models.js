import { db } from './db.js';
import { round1 } from './time.js';

export const getDevice = async (userId) => (await db.get('SELECT * FROM devices WHERE user_id = ?', [userId])) ?? null;
export const getSettings = (userId) => db.get('SELECT * FROM settings WHERE user_id = ?', [userId]);

export const toUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  createdAt: u.created_at,
});

export const toSettings = (s) => ({
  notifyAnomaly: !!s.notify_anomaly,
  notifyPush: !!s.notify_push,
  notifyEmail: !!s.notify_email,
  quietStart: s.quiet_start,
  quietEnd: s.quiet_end,
  nightMinLiters: s.night_min_liters,
  leakMinutes: s.leak_minutes,
  tolerancePct: s.tolerance_pct,
  dailyLimitL: s.daily_limit_l,
});

export const toDevice = (d) => ({
  id: d.id,
  name: d.name,
  deviceKey: d.device_key,
  address: { street: d.street, district: d.district, city: d.city, state: d.state, cep: d.cep },
  filterCapacityL: d.filter_capacity_l,
  reservoirCapacityL: d.reservoir_capacity_l,
  createdAt: d.created_at,
});

export const toAlert = (a) => ({
  id: a.id,
  type: a.type,
  severity: a.severity,
  title: a.title,
  message: a.message,
  periodStart: a.period_start,
  periodEnd: a.period_end,
  liters: a.liters == null ? null : round1(a.liters),
  createdAt: a.created_at,
  read: a.read_at != null,
});
