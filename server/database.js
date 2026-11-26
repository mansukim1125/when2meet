import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function createStore(prepare, schema, responseOrder) {
  const polls = `${schema}polls`;
  const responses = `${schema}responses`;
  const selectPoll = prepare(`SELECT id, title, description, dates FROM ${polls} WHERE id = $1`);
  const createPoll = prepare(`INSERT INTO ${polls} (id, title, description, dates) VALUES ($1, $2, $3, $4)`);
  const selectResponses = prepare(`
    SELECT name, dates, CASE WHEN token_hash = $1 THEN 1 ELSE 0 END AS is_own
    FROM ${responses} WHERE poll_id = $2 ORDER BY ${responseOrder}
  `);
  const saveResponse = prepare(`
    INSERT INTO ${responses} (poll_id, token_hash, name, dates) VALUES ($1, $2, $3, $4)
    ON CONFLICT (poll_id, token_hash) DO UPDATE SET name = excluded.name, dates = excluded.dates
  `);
  const checkHealth = prepare('SELECT 1');

  return {
    createPoll,
    async getPoll(id) {
      const [poll] = await selectPoll(id);
      return poll;
    },
    getResponses(id, hash) {
      return selectResponses(hash, id);
    },
    saveResponse,
    checkHealth,
  };
}

async function openSqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  const path = resolve(process.env.DB_PATH || 'data/nalmoa.sqlite');
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      dates TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS responses (
      poll_id TEXT NOT NULL REFERENCES polls(id),
      token_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      dates TEXT NOT NULL,
      PRIMARY KEY (poll_id, token_hash)
    );
  `);

  const prepare = (sql) => {
    const statement = db.prepare(sql.replace(/\$(\d+)/g, '?$1'));
    return (...params) => statement.all(...params);
  };
  return createStore(prepare, '', 'rowid');
}

async function openPostgres(connectionString) {
  const url = URL.parse(connectionString);
  if (!url?.hostname || !['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw Object.assign(new Error('Invalid PostgreSQL URL'), { code: 'INVALID_DATABASE_URL' });
  }

  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString,
    ssl: true,
    max: 5,
    connectionTimeoutMillis: 5_000,
    query_timeout: 12_000,
  });
  pool.on('error', (error) => {
    console.error('PostgreSQL idle connection error:', error.code ?? error.name);
  });

  try {
    const schema = readFileSync(new URL('./postgres.sql', import.meta.url), 'utf8');
    await pool.query(schema);
  } catch (error) {
    await pool.end();
    throw error;
  }

  const prepare = (sql) => async (...params) => (await pool.query(sql, params)).rows;
  return createStore(prepare, 'nalmoa.', 'response_order');
}

export async function openDatabase() {
  const url = process.env.DATABASE_URL;
  return url === undefined ? openSqlite() : openPostgres(url);
}
