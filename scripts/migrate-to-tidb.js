// Copia todos os dados do SQLite local (data/gotalert.db) para o TiDB/MySQL definido em DATABASE_URL.
// Uso: npm run migrate          (só copia se o banco de destino estiver vazio)
//      npm run migrate -- --force   (apaga os dados do destino antes de copiar)
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { DATABASE_URL, DB_PATH } from '../server/config.js';

if (!DATABASE_URL) {
  console.log('Defina DATABASE_URL no arquivo .env antes de migrar (veja o .env.example).');
  process.exit(1);
}
if (!fs.existsSync(DB_PATH)) {
  console.log(`Não encontrei o banco local em ${DB_PATH}.`);
  process.exit(1);
}

const { closeDb, db, transaction } = await import('../server/db.js');
const source = new DatabaseSync(DB_PATH, { readOnly: true });
const force = process.argv.includes('--force');

// Ordem respeita as chaves estrangeiras (usuário antes do aparelho, aparelho antes das leituras...)
const TABLES = ['users', 'settings', 'devices', 'readings', 'alerts'];
const BATCH = 500;

const { n } = await db.get('SELECT COUNT(*) AS n FROM users');
if (n > 0 && !force) {
  console.log(`O banco de destino já tem ${n} usuário(s). Para apagar tudo e copiar de novo, use: npm run migrate -- --force`);
  await closeDb();
  process.exit(1);
}

await transaction(async (tx) => {
  if (force) {
    for (const table of [...TABLES].reverse()) await tx.run(`DELETE FROM ${table}`);
  }
  for (const table of TABLES) {
    const rows = source.prepare(`SELECT * FROM ${table}`).all();
    if (!rows.length) {
      console.log(`${table}: 0 linhas`);
      continue;
    }
    const columns = Object.keys(rows[0]);
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const values = chunk.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
      await tx.run(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values}`,
        chunk.flatMap((row) => columns.map((c) => row[c])),
      );
    }
    console.log(`${table}: ${rows.length} linhas copiadas`);
  }
});

source.close();
await closeDb();
console.log('Migração concluída.');
