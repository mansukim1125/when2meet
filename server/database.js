import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { createStore } from '../supabase/functions/_shared/store.js';

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
