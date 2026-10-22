// Acesso ao banco de dados.
//
// Dois bancos são suportados, com a mesma API:
//  - SQLite (padrão): arquivo em data/gotalert.db, não precisa instalar nada.
//  - TiDB Cloud ou MySQL: usado quando a variável DATABASE_URL está definida
//    (ex.: mysql://usuario:senha@host:4000/gotalert).
//
// API (tudo assíncrono):
//   await db.get(sql, params)   -> primeira linha ou undefined
//   await db.all(sql, params)   -> lista de linhas
//   await db.run(sql, params)   -> { changes, lastInsertRowid }
//   await transaction(async (tx) => { await tx.run(...) })
// `params` pode ser uma lista (para "?") ou um objeto (para ":nome").
import { DATABASE_URL, DB_PATH } from './config.js';

export const dialect = DATABASE_URL ? 'mysql' : 'sqlite';

/**
 * Soma litros em leituras já existentes (mesmo aparelho e mesmo minuto) ou cria novas.
 * Envia em lotes, porque no TiDB cada comando é uma ida e volta pela internet.
 */
export async function upsertReadings(executor, deviceId, rows) {
  const BATCH = 500;
  const conflict = dialect === 'mysql'
    ? 'ON DUPLICATE KEY UPDATE liters = liters + VALUES(liters)'
    : 'ON CONFLICT(device_id, ts) DO UPDATE SET liters = liters + excluded.liters';
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk.map(() => '(?, ?, ?)').join(', ');
    const params = chunk.flatMap((r) => [deviceId, r.ts, r.liters]);
    await executor.run(`INSERT INTO readings (device_id, ts, liters) VALUES ${values} ${conflict}`, params);
  }
}

// ---------------------------------------------------------------- SQLite

async function createSqlite(file) {
  const { DatabaseSync } = await import('node:sqlite');
  const conn = new DatabaseSync(file);

  conn.exec(`
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

  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) cache.set(sql, (s = conn.prepare(sql)));
    return s;
  };
  const args = (params = []) => (Array.isArray(params) ? params : [params]);

  const db = {
    async get(sql, params) {
      return stmt(sql).get(...args(params));
    },
    async all(sql, params) {
      return stmt(sql).all(...args(params));
    },
    async run(sql, params) {
      const { changes, lastInsertRowid } = stmt(sql).run(...args(params));
      return { changes: Number(changes), lastInsertRowid: Number(lastInsertRowid) };
    },
  };

  // O SQLite tem uma conexão só. Como cada comando termina na hora, nenhuma outra
  // requisição consegue rodar no meio da transação.
  async function transaction(fn) {
    conn.exec('BEGIN');
    try {
      const result = await fn(db);
      conn.exec('COMMIT');
      return result;
    } catch (err) {
      conn.exec('ROLLBACK');
      throw err;
    }
  }

  return { db, transaction, close: async () => conn.close() };
}

// ---------------------------------------------------------------- TiDB / MySQL

const MYSQL_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(80)  NOT NULL,
    email         VARCHAR(160) NOT NULL COLLATE utf8mb4_general_ci,
    phone         VARCHAR(20),
    password_hash VARCHAR(100) NOT NULL,
    created_at    BIGINT       NOT NULL,
    UNIQUE KEY uq_users_email (email)
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    user_id          BIGINT  NOT NULL PRIMARY KEY,
    notify_anomaly   TINYINT NOT NULL DEFAULT 1,
    notify_push      TINYINT NOT NULL DEFAULT 1,
    notify_email     TINYINT NOT NULL DEFAULT 0,
    quiet_start      INT     NOT NULL DEFAULT 0,
    quiet_end        INT     NOT NULL DEFAULT 5,
    night_min_liters DOUBLE  NOT NULL DEFAULT 20,
    leak_minutes     INT     NOT NULL DEFAULT 60,
    tolerance_pct    INT     NOT NULL DEFAULT 15,
    daily_limit_l    DOUBLE,
    CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS devices (
    id                   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id              BIGINT       NOT NULL,
    name                 VARCHAR(40)  NOT NULL DEFAULT 'GotAlert',
    device_key           VARCHAR(20)  NOT NULL,
    street               VARCHAR(120),
    district             VARCHAR(80),
    city                 VARCHAR(80),
    state                VARCHAR(2),
    cep                  VARCHAR(9),
    filter_capacity_l    DOUBLE       NOT NULL DEFAULT 20000,
    reservoir_capacity_l DOUBLE       NOT NULL DEFAULT 7000,
    filter_cleaned_at    BIGINT       NOT NULL,
    reservoir_emptied_at BIGINT       NOT NULL,
    last_seen_at         BIGINT,
    created_at           BIGINT       NOT NULL,
    UNIQUE KEY uq_devices_user (user_id),
    UNIQUE KEY uq_devices_key (device_key),
    CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS readings (
    id        BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    device_id BIGINT NOT NULL,
    ts        BIGINT NOT NULL,
    liters    DOUBLE NOT NULL,
    UNIQUE KEY idx_readings_device_ts (device_id, ts),
    CONSTRAINT fk_readings_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  )`,
  // AUTO_ID_CACHE=1 faz o TiDB gerar ids sempre crescentes; o app usa o maior id
  // para saber se chegou alerta novo. No MySQL esse trecho é só um comentário.
  `CREATE TABLE IF NOT EXISTS alerts (
    id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT       NOT NULL,
    device_id    BIGINT       NOT NULL,
    type         VARCHAR(20)  NOT NULL,
    severity     VARCHAR(10)  NOT NULL,
    title        VARCHAR(200) NOT NULL,
    message      TEXT         NOT NULL,
    period_start BIGINT,
    period_end   BIGINT,
    liters       DOUBLE,
    created_at   BIGINT       NOT NULL,
    read_at      BIGINT,
    dedupe_key   VARCHAR(191) NOT NULL,
    UNIQUE KEY uq_alerts_dedupe (dedupe_key),
    KEY idx_alerts_user (user_id, created_at),
    CONSTRAINT fk_alerts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_alerts_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  ) /*T![auto_id_cache] AUTO_ID_CACHE=1 */`,
];

async function createMysql(url) {
  const mysql = (await import('mysql2/promise')).default;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL inválida. Use o formato mysql://usuario:senha@host:4000/gotalert');
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '')) || 'gotalert';
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  const options = {
    host: parsed.hostname,
    port: Number(parsed.port) || 4000,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    // O TiDB Cloud exige conexão criptografada. Para um MySQL local sem TLS, use ?ssl=false.
    ssl: parsed.searchParams.get('ssl') === 'false' || (local && !parsed.searchParams.has('ssl'))
      ? undefined
      : { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    charset: 'utf8mb4',
    decimalNumbers: true, // SUM() volta como número, não como texto
    namedPlaceholders: true,
    multipleStatements: false,
  };

  // Cria o banco na primeira vez, se ainda não existir.
  const admin = await mysql.createConnection(options);
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, '')}\``);
  await admin.end();

  const pool = mysql.createPool({ ...options, database, connectionLimit: 5, enableKeepAlive: true });
  for (const sql of MYSQL_SCHEMA) await pool.query(sql);

  const wrap = (conn) => ({
    async get(sql, params) {
      const [rows] = await conn.query(sql, params);
      return rows[0];
    },
    async all(sql, params) {
      const [rows] = await conn.query(sql, params);
      return rows;
    },
    async run(sql, params) {
      const [result] = await conn.query(sql, params);
      return { changes: result.affectedRows, lastInsertRowid: Number(result.insertId) };
    },
  });

  async function transaction(fn) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(wrap(conn));
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
  }

  return { db: wrap(pool), transaction, close: () => pool.end() };
}

// ---------------------------------------------------------------- conexão

// Fica no fim do arquivo porque usa o esquema e as funções declarados acima.
const backend = dialect === 'mysql' ? await createMysql(DATABASE_URL) : await createSqlite(DB_PATH);

export const db = backend.db;
export const transaction = backend.transaction;
export const closeDb = backend.close;
