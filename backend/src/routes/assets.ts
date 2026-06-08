import { Router, Request, Response } from 'express';
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

router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await db.execute({ sql: `${ASSET_SELECT} ORDER BY current_value DESC`, args: [] });
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
      sql: 'INSERT INTO assets (name, type, base_value, current_value, color, notes, include_in_total) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [name, type, base, base, color || '#f59e0b', notes || null, include_in_total ?? 1],
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
      sql: `UPDATE assets SET name=?, type=?, base_value=COALESCE(?, base_value), color=?, notes=?, include_in_total=?, last_updated=datetime('now') WHERE id=?`,
      args: [name, type, base_value ?? null, color, notes || null, include_in_total ?? 1, req.params.id],
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
      sql: 'DELETE FROM asset_snapshots WHERE month = ? AND year = ?',
      args: [Number(month), Number(year)],
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    // Unmap any instruments pointing here so they revert to "unmapped" (recording blocked).
    await db.execute({ sql: 'UPDATE savings_instruments SET asset_id = NULL WHERE asset_id = ?', args: [req.params.id] });
    await db.execute({ sql: 'DELETE FROM assets WHERE id = ?', args: [req.params.id] });
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const byType = await db.execute({
      sql: `SELECT type, SUM(val) as total, COUNT(*) as count FROM (
              SELECT a.type AS type, ${DERIVED_VALUE} AS val
              FROM assets a WHERE a.include_in_total = 1
            ) GROUP BY type ORDER BY total DESC`,
      args: [],
    });
    const total = await db.execute({ sql: `SELECT COALESCE(SUM(${DERIVED_VALUE}), 0) as total FROM assets a WHERE a.include_in_total = 1`, args: [] });
    res.json({ byType: byType.rows, total: total.rows[0]?.total ?? 0 });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/timeline', async (_req: Request, res: Response) => {
  try {
    const result = await db.execute({
      sql: `SELECT s.month, s.year, SUM(s.value) as total
            FROM asset_snapshots s
            JOIN assets a ON a.id = s.asset_id
            WHERE a.include_in_total = 1
            GROUP BY s.year, s.month
            ORDER BY s.year ASC, s.month ASC`,
      args: [],
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
            WHERE s.month = ? AND s.year = ?
            ORDER BY s.value DESC`,
      args: [Number(month), Number(year)],
    });
    const prev = await db.execute({
      sql: `SELECT asset_id, value FROM asset_snapshots WHERE month = ? AND year = ?`,
      args: [prevMonth, prevYear],
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
      db.execute({ sql: 'SELECT COUNT(DISTINCT asset_id) as count FROM asset_snapshots WHERE month = ? AND year = ?', args: [Number(month), Number(year)] }),
      db.execute({ sql: 'SELECT COUNT(*) as count FROM assets WHERE include_in_total = 1', args: [] }),
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
    const assets = await db.execute({ sql: `SELECT a.id AS id, ${DERIVED_VALUE} AS current_value FROM assets a WHERE a.include_in_total = 1`, args: [] });
    await Promise.all(assets.rows.map(a => snapshotAsset(Number(a.id), Number(a.current_value), month, year)));
    res.json({ ok: true, count: assets.rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/entries', async (req: Request, res: Response) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM asset_manual_entries WHERE asset_id = ? ORDER BY date DESC, created_at DESC',
      args: [req.params.id],
    });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/entries', async (req: Request, res: Response) => {
  const { amount, note, date } = req.body;
  const isExpense = !!req.body.is_expense;
  if (amount === undefined || amount === null) return res.status(400).json({ error: 'amount required' });
  const amt = Number(amount);
  const entryDate = date || new Date().toISOString().slice(0, 10);
  const tx = await db.transaction('write');
  try {
    let linkedExpenseId: number | null = null;
    if (amt < 0 && isExpense) {
      const description = note || `Withdrawal from ${await assetName(req.params.id)}`;
      const [month, year] = monthYearFromDate(entryDate);
      const expResult = await tx.execute({
        sql: 'INSERT INTO unplanned_expenses (amount, description, date, month, year) VALUES (?, ?, ?, ?, ?)',
        args: [Math.abs(amt), description, entryDate, month, year],
      });
      linkedExpenseId = Number(expResult.lastInsertRowid!);
    }
    const result = await tx.execute({
      sql: 'INSERT INTO asset_manual_entries (asset_id, amount, note, date, linked_unplanned_expense_id) VALUES (?, ?, ?, ?, ?)',
      args: [req.params.id, amt, note || null, entryDate, linkedExpenseId],
    });
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
  const isExpense = !!req.body.is_expense;
  if (amount === undefined || amount === null) return res.status(400).json({ error: 'amount required' });
  const amt = Number(amount);
  const entryDate = date || new Date().toISOString().slice(0, 10);
  const [month, year] = monthYearFromDate(entryDate);
  try {
    const existing = await db.execute({ sql: 'SELECT * FROM asset_manual_entries WHERE id = ? AND asset_id = ?', args: [req.params.entryId, req.params.id] });
    const entry = existing.rows[0];
    if (!entry) return res.status(404).json({ error: 'entry not found' });

    const wantsExpense = amt < 0 && isExpense;
    const oldLinkedId: number | null = entry.linked_unplanned_expense_id != null ? Number(entry.linked_unplanned_expense_id) : null;
    let newLinkedId: number | null = oldLinkedId;
    let expenseToDelete: number | null = null;

    if (wantsExpense) {
      const description = note || `Withdrawal from ${await assetName(req.params.id)}`;
      if (oldLinkedId) {
        await db.execute({
          sql: 'UPDATE unplanned_expenses SET amount = ?, description = ?, date = ?, month = ?, year = ? WHERE id = ?',
          args: [Math.abs(amt), description, entryDate, month, year, oldLinkedId],
        });
      } else {
        const expResult = await db.execute({
          sql: 'INSERT INTO unplanned_expenses (amount, description, date, month, year) VALUES (?, ?, ?, ?, ?)',
          args: [Math.abs(amt), description, entryDate, month, year],
        });
        newLinkedId = Number(expResult.lastInsertRowid!);
      }
    } else if (oldLinkedId) {
      newLinkedId = null;
      expenseToDelete = oldLinkedId;
    }

    // Clear/repoint the FK reference before deleting the stale expense row, or SQLite rejects the delete.
    await db.execute({
      sql: 'UPDATE asset_manual_entries SET amount = ?, note = ?, date = ?, linked_unplanned_expense_id = ? WHERE id = ?',
      args: [amt, note || null, entryDate, newLinkedId, req.params.entryId],
    });
    if (expenseToDelete) {
      await db.execute({ sql: 'DELETE FROM unplanned_expenses WHERE id = ?', args: [expenseToDelete] });
    }
    const row = await db.execute({ sql: 'SELECT * FROM asset_manual_entries WHERE id = ?', args: [req.params.entryId] });
    res.json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id/entries/:entryId', async (req: Request, res: Response) => {
  const existing = await db.execute({ sql: 'SELECT linked_unplanned_expense_id FROM asset_manual_entries WHERE id = ? AND asset_id = ?', args: [req.params.entryId, req.params.id] });
  const linkedId = existing.rows[0]?.linked_unplanned_expense_id;
  const tx = await db.transaction('write');
  try {
    // Delete the referencing entry first — SQLite rejects deleting a row still pointed at by a FK.
    await tx.execute({ sql: 'DELETE FROM asset_manual_entries WHERE id = ? AND asset_id = ?', args: [req.params.entryId, req.params.id] });
    if (linkedId != null) {
      await tx.execute({ sql: 'DELETE FROM unplanned_expenses WHERE id = ?', args: [linkedId] });
    }
    await tx.commit();
    res.status(204).end();
  } catch (e: any) {
    await tx.rollback();
    res.status(500).json({ error: e.message });
  }
});

function monthYearFromDate(date: string): [number, number] {
  const [year, month] = date.split('-').map(Number);
  return [month, year];
}

async function assetName(id: string | number): Promise<string> {
  const row = await db.execute({ sql: 'SELECT name FROM assets WHERE id = ?', args: [id] });
  return String(row.rows[0]?.name ?? 'asset');
}

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
