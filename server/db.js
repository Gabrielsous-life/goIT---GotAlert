import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from './config.js';

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    phone         TEXT,
    password_hash TEXT    NOT NULL,
    created_at    INTEGER NOT NULL
  );

  -- Preferências de notificação e regras de detecção de cada usuário
  CREATE TABLE IF NOT EXISTS settings (
    user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    notify_anomaly   INTEGER NOT NULL DEFAULT 1,
    notify_push      INTEGER NOT NULL DEFAULT 1,
    notify_email     INTEGER NOT NULL DEFAULT 0,
    quiet_start      INTEGER NOT NULL DEFAULT 0,   -- hora em que começa o período sem uso (0-23)
    quiet_end        INTEGER NOT NULL DEFAULT 5,   -- hora em que termina (exclusiva)
    night_min_liters REAL    NOT NULL DEFAULT 20,  -- litros na madrugada que disparam alerta
    leak_minutes     INTEGER NOT NULL DEFAULT 60,  -- minutos de fluxo contínuo = possível vazamento
    tolerance_pct    INTEGER NOT NULL DEFAULT 15,  -- % acima da média diária que dispara alerta
    daily_limit_l    REAL                          -- limite diário opcional, em litros
  );

  -- Um único módulo GotAlert (filtro de vela + reservatório + sensor) por casa
  CREATE TABLE IF NOT EXISTS devices (
    id                   INTEGER PRIMARY KEY,
    user_id              INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name                 TEXT    NOT NULL DEFAULT 'GotAlert',
    device_key           TEXT    NOT NULL UNIQUE,
    street               TEXT,
    district             TEXT,
    city                 TEXT,
    state                TEXT,
    cep                  TEXT,
    filter_capacity_l    REAL    NOT NULL DEFAULT 20000,
    reservoir_capacity_l REAL    NOT NULL DEFAULT 7000,
    filter_cleaned_at    INTEGER NOT NULL,
    reservoir_emptied_at INTEGER NOT NULL,
    last_seen_at         INTEGER,
    created_at           INTEGER NOT NULL
  );

  -- Cada leitura = litros que passaram pelo sensor durante um minuto
  CREATE TABLE IF NOT EXISTS readings (
    id        INTEGER PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    ts        INTEGER NOT NULL,
    liters    REAL    NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_readings_device_ts ON readings(device_id, ts);

  CREATE TABLE IF NOT EXISTS alerts (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id    INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    type         TEXT    NOT NULL,   -- leak | night | above_avg | limit | maintenance
    severity     TEXT    NOT NULL,   -- critical | warning | info
    title        TEXT    NOT NULL,
    message      TEXT    NOT NULL,
    period_start INTEGER,
    period_end   INTEGER,
    liters       REAL,
    created_at   INTEGER NOT NULL,
    read_at      INTEGER,
    dedupe_key   TEXT    NOT NULL UNIQUE
  );
  CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id, created_at DESC);
`);

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
