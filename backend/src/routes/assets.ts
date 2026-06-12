import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from '../db';

const router = Router();

// Derived current value = base_value + mapped savings entries + manual entries.
const DERIVED_VALUE = `(a.base_value + COALESCE((
  SELECT SUM(se.amount) FROM savings_entries se
  JOIN savings_instruments si ON si.id = se.instrument_id
  WHERE si.asset_id = a.id
), 0) + COALESCE((
  SELECT SUM(me.amount) FROM asset_manual_entries me WHERE me.asset_id = a.id
), 0))`;

const ASSET_SELECT = `SELECT a.id, a.name, a.type, a.color, a.notes, a.include_in_total,
  a.base_value, a.last_updated, a.created_at, ${DERIVED_VALUE} AS current_value
  FROM assets a`;

// Asset ownership gate for all /:id/* entry routes.
async function userAsset(assetId: string | number, userId: number) {
  const row = await db.execute({ sql: 'SELECT id, name FROM assets WHERE id = ? AND user_id = ?', args: [assetId, userId] });
  return row.rows[0] ?? null;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await db.execute({ sql: `${ASSET_SELECT} WHERE a.user_id = ? ORDER BY current_value DESC`, args: [req.userId!] });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { name, type, base_value, current_value, color, notes, include_in_total } = req.body;
  const base = base_value ?? current_value ?? 0;
  try {
    const result = await db.execute({
      sql: 'INSERT INTO assets (name, type, base_value, current_value, color, notes, include_in_total, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [name, type, base, base, color || '#f59e0b', notes || null, include_in_total ?? 1, req.userId!],
    });
    const id = result.lastInsertRowid!;
    const row = await db.execute({ sql: `${ASSET_SELECT} WHERE a.id = ?`, args: [id] });
    res.status(201).json(row.rows[0]);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'Asset name already exists' });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { name, type, base_value, color, notes, include_in_total } = req.body;
  try {
    await db.execute({
      sql: `UPDATE assets SET name=?, type=?, base_value=COALESCE(?, base_value), color=?, notes=?, include_in_total=?, last_updated=datetime('now') WHERE id=? AND user_id=?`,
      args: [name, type, base_value ?? null, color, notes || null, include_in_total ?? 1, req.params.id, req.userId!],
    });
    const row = await db.execute({ sql: `${ASSET_SELECT} WHERE a.id = ?`, args: [req.params.id] });
    res.json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/snapshot', async (req: Request, res: Response) => {
  const { month, year } = req.query;
  if (!month || !year) return res.status(400).json({ error: 'month and year required' });
  try {
    await db.execute({
      sql: 'DELETE FROM asset_snapshots WHERE month = ? AND year = ? AND asset_id IN (SELECT id FROM assets WHERE user_id = ?)',
      args: [Number(month), Number(year), req.userId!],
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const asset = await userAsset(req.params.id, req.userId!);
    if (!asset) return res.status(204).end();
    // Unmap any instruments pointing here so they revert to "unmapped" (recording blocked).
    await db.execute({ sql: 'UPDATE savings_instruments SET asset_id = NULL WHERE asset_id = ?', args: [req.params.id] });
    await db.execute({ sql: 'DELETE FROM assets WHERE id = ?', args: [req.params.id] });
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const byType = await db.execute({
      sql: `SELECT type, SUM(val) as total, COUNT(*) as count FROM (
              SELECT a.type AS type, ${DERIVED_VALUE} AS val
              FROM assets a WHERE a.include_in_total = 1 AND a.user_id = ?
            ) GROUP BY type ORDER BY total DESC`,
      args: [req.userId!],
    });
    const total = await db.execute({
      sql: `SELECT COALESCE(SUM(${DERIVED_VALUE}), 0) as total FROM assets a WHERE a.include_in_total = 1 AND a.user_id = ?`,
      args: [req.userId!],
    });
    res.json({ byType: byType.rows, total: total.rows[0]?.total ?? 0 });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/timeline', async (req: Request, res: Response) => {
  try {
    const result = await db.execute({
      sql: `SELECT s.month, s.year, SUM(s.value) as total
            FROM asset_snapshots s
            JOIN assets a ON a.id = s.asset_id
            WHERE a.include_in_total = 1 AND a.user_id = ?
            GROUP BY s.year, s.month
            ORDER BY s.year ASC, s.month ASC`,
      args: [req.userId!],
    });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/timeline/:year/:month', async (req: Request, res: Response) => {
  const { year, month } = req.params;
  const prevMonth = Number(month) === 1 ? 12 : Number(month) - 1;
  const prevYear = Number(month) === 1 ? Number(year) - 1 : Number(year);
  try {
    const curr = await db.execute({
      sql: `SELECT a.id as asset_id, a.name, a.type, a.color, s.value
            FROM asset_snapshots s JOIN assets a ON a.id = s.asset_id
            WHERE s.month = ? AND s.year = ? AND a.user_id = ?
            ORDER BY s.value DESC`,
      args: [Number(month), Number(year), req.userId!],
    });
    const prev = await db.execute({
      sql: `SELECT s.asset_id, s.value FROM asset_snapshots s JOIN assets a ON a.id = s.asset_id
            WHERE s.month = ? AND s.year = ? AND a.user_id = ?`,
      args: [prevMonth, prevYear, req.userId!],
    });
    const prevMap: Record<number, number> = {};
    prev.rows.forEach(r => { prevMap[Number(r.asset_id)] = Number(r.value); });
    const rows = curr.rows.map(r => ({
      ...r,
      value: Number(r.value),
      prev_value: prevMap[Number(r.asset_id)] ?? null,
      delta: prevMap[Number(r.asset_id)] != null ? Number(r.value) - prevMap[Number(r.asset_id)] : null,
    }));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/snapshot-status', async (req: Request, res: Response) => {
  const { month, year } = req.query;
  if (!month || !year) return res.status(400).json({ error: 'month and year required' });
  try {
    const [snap, total] = await Promise.all([
      db.execute({
        sql: `SELECT COUNT(DISTINCT s.asset_id) as count FROM asset_snapshots s JOIN assets a ON a.id = s.asset_id
              WHERE s.month = ? AND s.year = ? AND a.user_id = ?`,
        args: [Number(month), Number(year), req.userId!],
      }),
      db.execute({ sql: 'SELECT COUNT(*) as count FROM assets WHERE include_in_total = 1 AND user_id = ?', args: [req.userId!] }),
    ]);
    const count = Number(snap.rows[0]?.count ?? 0);
    const tot = Number(total.rows[0]?.count ?? 0);
    res.json({ exists: count > 0, count, total: tot, stale: count > 0 && count < tot });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


router.post('/snapshot-all', async (req: Request, res: Response) => {
  const now = new Date();
  const month = Number(req.body?.month ?? now.getMonth() + 1);
  const year = Number(req.body?.year ?? now.getFullYear());
  try {
    const assets = await db.execute({
      sql: `SELECT a.id AS id, ${DERIVED_VALUE} AS current_value FROM assets a WHERE a.include_in_total = 1 AND a.user_id = ?`,
      args: [req.userId!],
    });
    await Promise.all(assets.rows.map(a => snapshotAsset(Number(a.id), Number(a.current_value), month, year)));
    res.json({ ok: true, count: assets.rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/entries', async (req: Request, res: Response) => {
  try {
    if (!(await userAsset(req.params.id, req.userId!))) return res.status(404).json({ error: 'asset not found' });
    const result = await db.execute({
      sql: `SELECT me.*, ab.name AS adhoc_budget_name
            FROM asset_manual_entries me
            LEFT JOIN adhoc_budgets ab ON ab.id = me.adhoc_budget_id
            WHERE me.asset_id = ?
            ORDER BY me.date DESC, me.created_at DESC`,
      args: [req.params.id],
    });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/entries', async (req: Request, res: Response) => {
  const { amount, note, date } = req.body;
  if (amount === undefined || amount === null) return res.status(400).json({ error: 'amount required' });
  const amt = Number(amount);
  if (isNaN(amt) || amt === 0) return res.status(400).json({ error: 'Enter a non-zero amount' });
  const entryDate = date || new Date().toISOString().slice(0, 10);

  const srcAsset = await userAsset(req.params.id, req.userId!);
  if (!srcAsset) return res.status(404).json({ error: 'asset not found' });

  // Positive amount = plain deposit into this asset.
  if (amt > 0) {
    try {
      const result = await db.execute({
        sql: 'INSERT INTO asset_manual_entries (asset_id, amount, note, date) VALUES (?, ?, ?, ?)',
        args: [req.params.id, amt, note || null, entryDate],
      });
      const row = await db.execute({ sql: 'SELECT * FROM asset_manual_entries WHERE id = ?', args: [result.lastInsertRowid!] });
      return res.status(201).json(row.rows[0]);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Negative amount = transfer out — must be mapped to one or more target assets that sum to it.
  const targets: { asset_id: number; amount: number }[] = Array.isArray(req.body.targets) ? req.body.targets : [];
  const clean = targets
    .map((t) => ({ asset_id: Number(t.asset_id), amount: Number(t.amount) }))
    .filter((t) => t.asset_id && !isNaN(t.amount) && t.amount > 0);
  if (clean.length === 0) return res.status(400).json({ error: 'Withdrawals must move money to at least one target asset' });
  if (clean.some((t) => t.asset_id === Number(req.params.id))) return res.status(400).json({ error: 'Target asset must differ from the source asset' });
  for (const t of clean) {
    if (!(await userAsset(t.asset_id, req.userId!))) return res.status(400).json({ error: 'Target asset not found' });
  }
  const sum = clean.reduce((s, t) => s + t.amount, 0);
  if (Math.round(sum * 100) !== Math.round(Math.abs(amt) * 100)) {
    return res.status(400).json({ error: 'Target amounts must add up to the withdrawal amount' });
  }

  const transferGroup = randomUUID();
  const srcName = String(srcAsset.name);
  const tx = await db.transaction('write');
  try {
    const result = await tx.execute({
      sql: 'INSERT INTO asset_manual_entries (asset_id, amount, note, date, transfer_group) VALUES (?, ?, ?, ?, ?)',
      args: [req.params.id, amt, note || null, entryDate, transferGroup],
    });
    for (const t of clean) {
      await tx.execute({
        sql: 'INSERT INTO asset_manual_entries (asset_id, amount, note, date, transfer_group) VALUES (?, ?, ?, ?, ?)',
        args: [t.asset_id, t.amount, note || `Transfer from ${srcName}`, entryDate, transferGroup],
      });
    }
    await tx.commit();
    const row = await db.execute({ sql: 'SELECT * FROM asset_manual_entries WHERE id = ?', args: [result.lastInsertRowid!] });
    res.status(201).json(row.rows[0]);
  } catch (e: any) {
    await tx.rollback();
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/entries/:entryId', async (req: Request, res: Response) => {
  const { amount, note, date } = req.body;
  if (amount === undefined || amount === null) return res.status(400).json({ error: 'amount required' });
  const amt = Number(amount);
  if (isNaN(amt) || amt === 0) return res.status(400).json({ error: 'Enter a non-zero amount' });
  const entryDate = date || new Date().toISOString().slice(0, 10);
  try {
    if (!(await userAsset(req.params.id, req.userId!))) return res.status(404).json({ error: 'asset not found' });
    const existing = await db.execute({ sql: 'SELECT * FROM asset_manual_entries WHERE id = ? AND asset_id = ?', args: [req.params.entryId, req.params.id] });
    const entry = existing.rows[0];
    if (!entry) return res.status(404).json({ error: 'entry not found' });

    // Transfer legs and adhoc-budget totals are managed elsewhere — delete and re-add to change them.
    if (entry.transfer_group != null) return res.status(409).json({ error: 'This is a transfer — delete and re-create it to change it.' });
    if (entry.linked_unplanned_expense_id != null) return res.status(409).json({ error: 'This withdrawal is an adhoc expense — edit it from the Expenses page.' });
    if (entry.adhoc_budget_id != null) return res.status(409).json({ error: 'This total is managed by an adhoc budget — edit its expenses from the Expenses page.' });
    if (amt < 0) return res.status(400).json({ error: 'Withdrawals are created via transfers — delete and re-add as a transfer.' });

    await db.execute({
      sql: 'UPDATE asset_manual_entries SET amount = ?, note = ?, date = ? WHERE id = ?',
      args: [amt, note || null, entryDate, req.params.entryId],
    });
    const row = await db.execute({ sql: 'SELECT * FROM asset_manual_entries WHERE id = ?', args: [req.params.entryId] });
    res.json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id/entries/:entryId', async (req: Request, res: Response) => {
  if (!(await userAsset(req.params.id, req.userId!))) return res.status(404).json({ error: 'asset not found' });
  const existing = await db.execute({ sql: 'SELECT linked_unplanned_expense_id, transfer_group, adhoc_budget_id FROM asset_manual_entries WHERE id = ? AND asset_id = ?', args: [req.params.entryId, req.params.id] });
  const entry = existing.rows[0];
  if (!entry) return res.status(204).end();
  if (entry.adhoc_budget_id != null) {
    return res.status(409).json({ error: 'This total is managed by an adhoc budget — delete its expenses from the Expenses page, or delete the budget to detach it.' });
  }
  const linkedId = entry.linked_unplanned_expense_id;
  const transferGroup = entry.transfer_group;
  const tx = await db.transaction('write');
  try {
    if (transferGroup != null) {
      // Remove every leg of the transfer so net worth stays balanced.
      await tx.execute({ sql: 'DELETE FROM asset_manual_entries WHERE transfer_group = ?', args: [transferGroup] });
    } else if (linkedId != null) {
      // Legacy adhoc expense withdrawal — drop the entry, restore the budget balance, delete the expense.
      const exp = await tx.execute({ sql: 'SELECT amount, adhoc_budget_id FROM unplanned_expenses WHERE id = ?', args: [linkedId] });
      await tx.execute({ sql: 'DELETE FROM asset_manual_entries WHERE id = ? AND asset_id = ?', args: [req.params.entryId, req.params.id] });
      const expRow = exp.rows[0];
      if (expRow?.adhoc_budget_id != null) {
        await tx.execute({ sql: 'UPDATE adhoc_budgets SET balance = balance + ? WHERE id = ?', args: [Number(expRow.amount), expRow.adhoc_budget_id] });
      }
      await tx.execute({ sql: 'DELETE FROM unplanned_expenses WHERE id = ?', args: [linkedId] });
    } else {
      await tx.execute({ sql: 'DELETE FROM asset_manual_entries WHERE id = ? AND asset_id = ?', args: [req.params.entryId, req.params.id] });
    }
    await tx.commit();
    res.status(204).end();
  } catch (e: any) {
    await tx.rollback();
    res.status(500).json({ error: e.message });
  }
});

async function snapshotAsset(assetId: number, value: number, month?: number, year?: number) {
  const now = new Date();
  const m = month ?? now.getMonth() + 1;
  const y = year ?? now.getFullYear();
  await db.execute({
    sql: `INSERT INTO asset_snapshots (asset_id, month, year, value)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(asset_id, month, year) DO UPDATE SET value = excluded.value`,
    args: [assetId, m, y, value],
  });
}

export default router;
