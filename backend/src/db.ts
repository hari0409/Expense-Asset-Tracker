import { createClient } from '@libsql/client';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = createClient({
  url: `file:${path.join(dataDir, 'expense-tracker.db')}`,
});

export async function initDb() {
  // 1. Schema — runs first so tables exist before any ALTER/UPDATE migration.
  // Fresh installs get the final shape (user-scoped uniques); existing DBs are
  // brought up to date by the ALTER + rebuild migrations below.
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      webauthn_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      budget REAL NOT NULL DEFAULT 0,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'normal',
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name, month, year)
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
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#f59e0b',
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
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

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      current_value REAL NOT NULL DEFAULT 0,
      base_value REAL NOT NULL DEFAULT 0,
      include_in_total INTEGER NOT NULL DEFAULT 1,
      color TEXT NOT NULL DEFAULT '#f59e0b',
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS savings_instruments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#10b981',
      monthly_target REAL NOT NULL DEFAULT 0,
      notes TEXT,
      asset_name TEXT,
      include_in_assets INTEGER NOT NULL DEFAULT 1,
      asset_id INTEGER REFERENCES assets(id),
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
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

    CREATE TABLE IF NOT EXISTS asset_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(asset_id, month, year)
    );

    CREATE TABLE IF NOT EXISTS asset_manual_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      note TEXT,
      date TEXT NOT NULL DEFAULT (date('now')),
      linked_unplanned_expense_id INTEGER REFERENCES unplanned_expenses(id),
      transfer_group TEXT,
      adhoc_budget_id INTEGER REFERENCES adhoc_budgets(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS adhoc_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      asset_id INTEGER REFERENCES assets(id),
      original_amount REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#a855f7',
      notes TEXT,
      asset_entry_id INTEGER REFERENCES asset_manual_entries(id),
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      user_id INTEGER REFERENCES users(id),
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
      adhoc_budget_id INTEGER REFERENCES adhoc_budgets(id),
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monthly_income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, month, year)
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

  // 2. Additive column migrations — try/catch makes each idempotent (no-op if column exists).
  const addColumn = async (sql: string) => {
    try { await db.execute(sql); } catch { /* column already exists */ }
  };
  await addColumn('ALTER TABLE unplanned_expenses ADD COLUMN adhoc_budget_id INTEGER REFERENCES adhoc_budgets(id)');
  await addColumn('ALTER TABLE asset_manual_entries ADD COLUMN transfer_group TEXT');
  await addColumn('ALTER TABLE adhoc_budgets ADD COLUMN asset_entry_id INTEGER REFERENCES asset_manual_entries(id)');
  await addColumn(`ALTER TABLE expense_categories ADD COLUMN kind TEXT NOT NULL DEFAULT 'normal'`);
  await addColumn('ALTER TABLE asset_manual_entries ADD COLUMN adhoc_budget_id INTEGER REFERENCES adhoc_budgets(id)');
  await addColumn('ALTER TABLE adhoc_budgets ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
  await addColumn('ALTER TABLE adhoc_budgets ADD COLUMN archived_at TEXT');
  for (const table of [
    'expense_categories', 'rent_out_persons', 'assets', 'savings_instruments',
    'adhoc_budgets', 'loans', 'unplanned_expenses', 'monthly_income',
  ]) {
    await addColumn(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER REFERENCES users(id)`);
  }

  // 3. Claim pre-multi-user rows for the original user. Idempotent (only touches NULLs);
  // no-op when no user exists yet (data routes require auth, so data implies a user).
  await db.executeMultiple(`
    UPDATE expense_categories SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL;
    UPDATE rent_out_persons   SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL;
    UPDATE assets             SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL;
    UPDATE savings_instruments SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL;
    UPDATE adhoc_budgets      SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL;
    UPDATE loans              SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL;
    UPDATE unplanned_expenses SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL;
    UPDATE monthly_income     SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL;
  `);

  // 4. One-time rebuilds to move global UNIQUE constraints to per-user ones
  // (SQLite can't alter constraints in place). Gated by an app_meta flag.
  await rebuildForPerUserUniques();

  // 5. One-time data migration — collapse each adhoc budget's per-expense asset entries
  // into a single running-total entry, gated by an app_meta flag.
  await consolidateAdhocBudgetEntries();

  // 6. Forward-link budget running-total entries (asset_manual_entries.adhoc_budget_id)
  // from the legacy reverse pointer (adhoc_budgets.asset_entry_id). Idempotent.
  await db.execute({
    sql: `UPDATE asset_manual_entries
          SET adhoc_budget_id = (SELECT b.id FROM adhoc_budgets b WHERE b.asset_entry_id = asset_manual_entries.id)
          WHERE adhoc_budget_id IS NULL
            AND id IN (SELECT asset_entry_id FROM adhoc_budgets WHERE asset_entry_id IS NOT NULL)`,
    args: [],
  });

  // 7. One-time data migration — move budget-less unplanned expenses into a reserved
  // per-month "Unplanned" category so every expense has a budget source.
  await mergeUnplannedIntoCategories();

  // 8. Indexes (idempotent).
  await db.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_savings_entries_instrument ON savings_entries(instrument_id);
    CREATE INDEX IF NOT EXISTS idx_savings_instruments_asset ON savings_instruments(asset_id);
    CREATE INDEX IF NOT EXISTS idx_asset_manual_entries_asset ON asset_manual_entries(asset_id);
    CREATE INDEX IF NOT EXISTS idx_asset_manual_entries_budget ON asset_manual_entries(adhoc_budget_id);
    CREATE INDEX IF NOT EXISTS idx_asset_snapshots_asset ON asset_snapshots(asset_id);
    CREATE INDEX IF NOT EXISTS idx_unplanned_expenses_budget ON unplanned_expenses(adhoc_budget_id);
    CREATE INDEX IF NOT EXISTS idx_emi_payments_loan ON emi_payments(loan_id);
    CREATE INDEX IF NOT EXISTS idx_emi_rates_loan ON emi_rates(loan_id);
    CREATE INDEX IF NOT EXISTS idx_rent_out_entries_person ON rent_out_entries(person_id);
    CREATE INDEX IF NOT EXISTS idx_rent_out_settlements_person ON rent_out_settlements(person_id);
  `);
}

export const UNPLANNED_CATEGORY_NAME = 'Unplanned';
export const UNPLANNED_CATEGORY_COLOR = '#f97316';

// Reserved per-(user, month, year) category that backs budget-less sudden expenses.
// Created on demand with budget 0 — the user consciously allocates it.
export async function getOrCreateUnplannedCategory(userId: number, month: number, year: number): Promise<number> {
  const existing = await db.execute({
    sql: `SELECT id FROM expense_categories WHERE user_id = ? AND month = ? AND year = ? AND kind = 'unplanned'`,
    args: [userId, month, year],
  });
  if (existing.rows[0]) return Number(existing.rows[0].id);
  try {
    const result = await db.execute({
      sql: `INSERT INTO expense_categories (name, color, budget, month, year, sort_order, kind, user_id)
            VALUES (?, ?, 0, ?, ?, 999, 'unplanned', ?)`,
      args: [UNPLANNED_CATEGORY_NAME, UNPLANNED_CATEGORY_COLOR, month, year, userId],
    });
    return Number(result.lastInsertRowid!);
  } catch {
    // A user-created category already holds the reserved name — adopt it.
    await db.execute({
      sql: `UPDATE expense_categories SET kind = 'unplanned' WHERE user_id = ? AND month = ? AND year = ? AND name = ?`,
      args: [userId, month, year, UNPLANNED_CATEGORY_NAME],
    });
    const adopted = await db.execute({
      sql: `SELECT id FROM expense_categories WHERE user_id = ? AND month = ? AND year = ? AND kind = 'unplanned'`,
      args: [userId, month, year],
    });
    return Number(adopted.rows[0].id);
  }
}

async function rebuildForPerUserUniques() {
  const done = await db.execute({ sql: `SELECT value FROM app_meta WHERE key = 'per_user_uniques_done'`, args: [] });
  if (done.rows[0]) return;

  // Standard SQLite constraint-change procedure: FKs off, copy into a new table
  // with the per-user unique, drop, rename. Children re-bind by name after rename.
  await db.executeMultiple(`
    PRAGMA foreign_keys=OFF;
    BEGIN;

    CREATE TABLE expense_categories_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      budget REAL NOT NULL DEFAULT 0,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'normal',
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name, month, year)
    );
    INSERT INTO expense_categories_new (id, name, color, budget, month, year, sort_order, kind, user_id, created_at)
      SELECT id, name, color, budget, month, year, sort_order, kind, user_id, created_at FROM expense_categories;
    DROP TABLE expense_categories;
    ALTER TABLE expense_categories_new RENAME TO expense_categories;

    CREATE TABLE rent_out_persons_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#f59e0b',
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );
    INSERT INTO rent_out_persons_new (id, name, color, notes, user_id, created_at)
      SELECT id, name, color, notes, user_id, created_at FROM rent_out_persons;
    DROP TABLE rent_out_persons;
    ALTER TABLE rent_out_persons_new RENAME TO rent_out_persons;

    CREATE TABLE assets_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      current_value REAL NOT NULL DEFAULT 0,
      base_value REAL NOT NULL DEFAULT 0,
      include_in_total INTEGER NOT NULL DEFAULT 1,
      color TEXT NOT NULL DEFAULT '#f59e0b',
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );
    INSERT INTO assets_new (id, name, type, current_value, base_value, include_in_total, color, notes, user_id, last_updated, created_at)
      SELECT id, name, type, current_value, base_value, include_in_total, color, notes, user_id, last_updated, created_at FROM assets;
    DROP TABLE assets;
    ALTER TABLE assets_new RENAME TO assets;

    CREATE TABLE savings_instruments_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#10b981',
      monthly_target REAL NOT NULL DEFAULT 0,
      notes TEXT,
      asset_name TEXT,
      include_in_assets INTEGER NOT NULL DEFAULT 1,
      asset_id INTEGER REFERENCES assets(id),
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );
    INSERT INTO savings_instruments_new (id, name, type, color, monthly_target, notes, asset_name, include_in_assets, asset_id, user_id, created_at)
      SELECT id, name, type, color, monthly_target, notes, asset_name, include_in_assets, asset_id, user_id, created_at FROM savings_instruments;
    DROP TABLE savings_instruments;
    ALTER TABLE savings_instruments_new RENAME TO savings_instruments;

    CREATE TABLE monthly_income_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, month, year)
    );
    INSERT INTO monthly_income_new (id, month, year, amount, notes, user_id, created_at)
      SELECT id, month, year, amount, notes, user_id, created_at FROM monthly_income;
    DROP TABLE monthly_income;
    ALTER TABLE monthly_income_new RENAME TO monthly_income;

    INSERT OR REPLACE INTO app_meta (key, value) VALUES ('per_user_uniques_done', 'true');
    COMMIT;
    PRAGMA foreign_keys=ON;
  `);
}

async function consolidateAdhocBudgetEntries() {
  const done = await db.execute({ sql: `SELECT value FROM app_meta WHERE key = 'adhoc_consolidation_done'`, args: [] });
  if (done.rows[0]) return;

  const budgets = await db.execute({ sql: 'SELECT id, name, asset_id FROM adhoc_budgets WHERE asset_id IS NOT NULL AND asset_entry_id IS NULL', args: [] });
  for (const b of budgets.rows) {
    const expenses = await db.execute({ sql: 'SELECT id, amount, date FROM unplanned_expenses WHERE adhoc_budget_id = ?', args: [b.id] });
    if (expenses.rows.length === 0) continue;

    const total = expenses.rows.reduce((s, e) => s + Number(e.amount), 0);
    const latestDate = expenses.rows.reduce((max, e) => (String(e.date) > max ? String(e.date) : max), '0000-00-00');

    for (const e of expenses.rows) {
      await db.execute({ sql: 'DELETE FROM asset_manual_entries WHERE linked_unplanned_expense_id = ?', args: [e.id] });
    }
    const result = await db.execute({
      sql: 'INSERT INTO asset_manual_entries (asset_id, amount, note, date) VALUES (?, ?, ?, ?)',
      args: [b.asset_id, -total, `${b.name} — adhoc spends`, latestDate],
    });
    await db.execute({ sql: 'UPDATE adhoc_budgets SET asset_entry_id = ? WHERE id = ?', args: [Number(result.lastInsertRowid!), b.id] });
  }

  await db.execute({ sql: `INSERT OR REPLACE INTO app_meta (key, value) VALUES ('adhoc_consolidation_done', 'true')`, args: [] });
}

// Moves unplanned expenses that have no adhoc budget (and no legacy asset-withdrawal
// link) into per-month reserved "Unplanned" categories as regular expenses.
async function mergeUnplannedIntoCategories() {
  const done = await db.execute({ sql: `SELECT value FROM app_meta WHERE key = 'unplanned_merge_done'`, args: [] });
  if (done.rows[0]) return;

  const rows = await db.execute({
    sql: `SELECT id, amount, description, date, month, year, user_id
          FROM unplanned_expenses
          WHERE adhoc_budget_id IS NULL AND user_id IS NOT NULL
            AND id NOT IN (
              SELECT linked_unplanned_expense_id FROM asset_manual_entries
              WHERE linked_unplanned_expense_id IS NOT NULL
            )`,
    args: [],
  });

  const categoryIds = new Map<string, number>();
  for (const r of rows.rows) {
    const key = `${r.user_id}-${r.year}-${r.month}`;
    let catId = categoryIds.get(key);
    if (catId == null) {
      catId = await getOrCreateUnplannedCategory(Number(r.user_id), Number(r.month), Number(r.year));
      categoryIds.set(key, catId);
    }
    await db.execute({
      sql: `INSERT INTO expenses (category_id, amount, description, date, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      args: [catId, Number(r.amount), r.description ?? null, String(r.date)],
    });
    await db.execute({ sql: 'DELETE FROM unplanned_expenses WHERE id = ?', args: [r.id] });
  }

  await db.execute({ sql: `INSERT OR REPLACE INTO app_meta (key, value) VALUES ('unplanned_merge_done', 'true')`, args: [] });
}

export default db;
