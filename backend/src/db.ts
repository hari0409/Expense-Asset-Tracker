import { createClient } from '@libsql/client';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = createClient({
  url: `file:${path.join(dataDir, 'expense-tracker.db')}`,
});

export async function initDb() {
  // Migrate: add sort_order if missing (idempotent)
  try {
    await db.execute({ sql: 'ALTER TABLE expense_categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0', args: [] });
  } catch { /* column already exists */ }
  try {
    await db.execute({ sql: 'ALTER TABLE savings_instruments ADD COLUMN asset_name TEXT', args: [] });
  } catch { /* column already exists */ }
  try {
    await db.execute({ sql: 'ALTER TABLE savings_instruments ADD COLUMN include_in_assets INTEGER NOT NULL DEFAULT 1', args: [] });
  } catch { /* column already exists */ }
  try {
    await db.execute({ sql: 'ALTER TABLE assets ADD COLUMN include_in_total INTEGER NOT NULL DEFAULT 1', args: [] });
  } catch { /* column already exists */ }
  try {
    await db.execute({ sql: 'ALTER TABLE savings_instruments ADD COLUMN asset_id INTEGER REFERENCES assets(id)', args: [] });
  } catch { /* column already exists */ }
  try {
    await db.execute({ sql: 'ALTER TABLE assets ADD COLUMN base_value REAL NOT NULL DEFAULT 0', args: [] });
  } catch { /* column already exists */ }
  try {
    await db.execute({ sql: 'ALTER TABLE asset_manual_entries ADD COLUMN linked_unplanned_expense_id INTEGER REFERENCES unplanned_expenses(id)', args: [] });
  } catch { /* column already exists */ }
  try {
    await db.execute({ sql: 'ALTER TABLE expenses ADD COLUMN formula TEXT', args: [] });
  } catch { /* column already exists */ }
  try {
    await db.execute({ sql: 'ALTER TABLE expenses ADD COLUMN updated_at TEXT', args: [] });
  } catch { /* column already exists */ }
  await db.execute({ sql: "UPDATE expenses SET updated_at = created_at WHERE updated_at IS NULL", args: [] });
  try {
    await db.execute({ sql: 'ALTER TABLE users ADD COLUMN webauthn_enabled INTEGER NOT NULL DEFAULT 1', args: [] });
  } catch { /* column already exists */ }

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS asset_manual_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      note TEXT,
      date TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      budget REAL NOT NULL DEFAULT 0,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(name, month, year)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      formula TEXT,
      description TEXT,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rent_out_persons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#f59e0b',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rent_out_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL REFERENCES rent_out_persons(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      description TEXT,
      date_given TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      amount_returned REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS savings_instruments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#10b981',
      monthly_target REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS savings_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instrument_id INTEGER NOT NULL REFERENCES savings_instruments(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(instrument_id, month, year)
    );

    CREATE TABLE IF NOT EXISTS rent_out_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL REFERENCES rent_out_persons(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      date TEXT NOT NULL DEFAULT (date('now')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      current_value REAL NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#f59e0b',
      notes TEXT,
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS asset_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(asset_id, month, year)
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      lender TEXT,
      principal REAL,
      has_emi INTEGER NOT NULL DEFAULT 1,
      color TEXT NOT NULL DEFAULT '#f43f5e',
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      start_month INTEGER NOT NULL,
      start_year INTEGER NOT NULL,
      end_month INTEGER,
      end_year INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS emi_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      from_month INTEGER NOT NULL,
      from_year INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS emi_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(loan_id, month, year)
    );

    CREATE TABLE IF NOT EXISTS unplanned_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monthly_income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(month, year)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      webauthn_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      device_name TEXT,
      transports TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await backfillInstrumentAssetMapping();
}

// One-time migration: derive explicit instrument->asset_id from the old hardcoded
// mapping, then set each asset's base_value so that the new derived current_value
// (base_value + SUM(mapped entries)) equals the value stored today (no jump).
const SAVINGS_TO_ASSET_TYPE: Record<string, string> = {
  SIP: 'Mutual Fund', PPF: 'PPF', Stocks: 'Stocks', FD: 'FD', RD: 'FD',
  NPS: 'NPS', Crypto: 'Crypto', Cash: 'Cash', 'Bank Savings': 'Bank Savings',
};

async function backfillInstrumentAssetMapping() {
  const done = await db.execute({ sql: `SELECT value FROM app_meta WHERE key = 'mapping_backfill_done'`, args: [] });
  if (done.rows.length > 0) return;

  const [instruments, assets] = await Promise.all([
    db.execute({ sql: 'SELECT id, type, asset_name FROM savings_instruments', args: [] }),
    db.execute({ sql: 'SELECT id, name, type, current_value FROM assets', args: [] }),
  ]);

  // Map each instrument to an asset by name/type (case-insensitive), mirroring old syncAsset.
  for (const instr of instruments.rows) {
    const key = String(instr.type) === 'Other'
      ? (instr.asset_name ? String(instr.asset_name) : null)
      : (SAVINGS_TO_ASSET_TYPE[String(instr.type)] ?? null);
    if (!key) continue;
    const k = key.toLowerCase();
    const match = assets.rows.find(a =>
      String(a.name).toLowerCase() === k || String(a.type).toLowerCase() === k
    );
    if (match) {
      await db.execute({ sql: 'UPDATE savings_instruments SET asset_id = ? WHERE id = ?', args: [Number(match.id), Number(instr.id)] });
    }
  }

  // Set base_value = current_value - SUM(mapped entries), floored at 0.
  for (const a of assets.rows) {
    const contrib = await db.execute({
      sql: `SELECT COALESCE(SUM(se.amount), 0) AS total
            FROM savings_entries se
            JOIN savings_instruments si ON si.id = se.instrument_id
            WHERE si.asset_id = ?`,
      args: [Number(a.id)],
    });
    const sum = Number(contrib.rows[0]?.total ?? 0);
    const base = Math.max(0, Number(a.current_value) - sum);
    await db.execute({ sql: 'UPDATE assets SET base_value = ? WHERE id = ?', args: [base, Number(a.id)] });
  }

  await db.execute({ sql: `INSERT INTO app_meta (key, value) VALUES ('mapping_backfill_done', datetime('now'))`, args: [] });
}

export default db;
