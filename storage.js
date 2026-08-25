import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const localLoad = (name, fallback) => {
  const p = path.join(DATA_DIR, name);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { fs.writeFileSync(p, JSON.stringify(fallback, null, 2)); return fallback; }
};
const localSave = (name, value) => fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(value, null, 2));

let pool = null;
let postgresEnabled = Boolean(process.env.DATABASE_URL);

export async function initStorage() {
  if (!postgresEnabled) return { mode: 'local' };
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  await pool.query(`CREATE TABLE IF NOT EXISTS linnmar_state (key TEXT PRIMARY KEY, value JSONB NOT NULL)`);
  return { mode: 'postgres' };
}

export async function loadState(key, fallback) {
  if (!postgresEnabled || !pool) return localLoad(`${key}.json`, fallback);
  try {
    const result = await pool.query('SELECT value FROM linnmar_state WHERE key = $1', [key]);
    if (!result.rows.length) {
      await pool.query('INSERT INTO linnmar_state(key, value) VALUES ($1, $2::jsonb)', [key, JSON.stringify(fallback)]);
      return fallback;
    }
    return result.rows[0].value;
  } catch (error) {
    console.error(`Postgres load failed for ${key}; using local fallback.`, error.message);
    return localLoad(`${key}.json`, fallback);
  }
}

export function saveState(key, value) {
  if (!postgresEnabled || !pool) {
    localSave(`${key}.json`, value);
    return;
  }
  pool.query(
    `INSERT INTO linnmar_state(key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  ).catch((error) => console.error(`Postgres save failed for ${key}:`, error.message));
}

export async function closeStorage() {
  if (pool) await pool.end();
}
