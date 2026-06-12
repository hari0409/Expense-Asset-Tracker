import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

const BUDGET_SELECT = `SELECT b.id, b.name, b.asset_id, b.original_amount, b.balance, b.color, b.notes, b.archived, b.archived_at, b.created_at,
  a.name AS asset_name
  FROM adhoc_budgets b
  LEFT JOIN assets a ON a.id = b.asset_id`;

async function assetBelongsToUser(assetId: number, userId: number): Promise<boolean> {
  const row = await db.execute({ sql: 'SELECT id FROM assets WHERE id = ? AND user_id = ?', args: [assetId, userId] });
  return !!row.rows[0];
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await db.execute({ sql: `${BUDGET_SELECT} WHERE b.user_id = ? AND b.archived = 0 ORDER BY b.created_at DESC`, args: [req.userId!] });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Closed-cycle budgets — frozen snapshots produced by an archived reset. Read-only history.
router.get('/archived', async (req: Request, res: Response) => {
  try {
    const result = await db.execute({ sql: `${BUDGET_SELECT} WHERE b.user_id = ? AND b.archived = 1 ORDER BY b.archived_at DESC`, args: [req.userId!] });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Expenses booked against a budget (active or archived) — used to show a closed cycle's history.
router.get('/:id/expenses', async (req: Request, res: Response) => {
  try {
    const result = await db.execute({
      sql: `SELECT * FROM unplanned_expenses WHERE adhoc_budget_id = ? AND user_id = ? ORDER BY date DESC, created_at DESC`,
      args: [req.params.id, req.userId!],
    });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { name, asset_id, original_amount, color, notes } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
  const orig = Number(original_amount) || 0;
  try {
    if (asset_id != null && !(await assetBelongsToUser(Number(asset_id), req.userId!))) {
      return res.status(400).json({ error: 'asset not found' });
    }
    const result = await db.execute({
      sql: 'INSERT INTO adhoc_budgets (name, asset_id, original_amount, balance, color, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [String(name).trim(), asset_id ?? null, orig, orig, color || '#a855f7', notes || null, req.userId!],
    });
    const row = await db.execute({ sql: `${BUDGET_SELECT} WHERE b.id = ?`, args: [result.lastInsertRowid!] });
    res.status(201).json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { name, asset_id, original_amount, color, notes } = req.body;
  try {
    if (asset_id != null && !(await assetBelongsToUser(Number(asset_id), req.userId!))) {
      return res.status(400).json({ error: 'asset not found' });
    }
    await db.execute({
      sql: `UPDATE adhoc_budgets SET name = ?, asset_id = ?, original_amount = COALESCE(?, original_amount), color = ?, notes = ?
            WHERE id = ? AND user_id = ?`,
      args: [name, asset_id ?? null, original_amount ?? null, color || '#a855f7', notes || null, req.params.id, req.userId!],
    });
    const row = await db.execute({ sql: `${BUDGET_SELECT} WHERE b.id = ?`, args: [req.params.id] });
    res.json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Reset balance — to a given amount, or back to original_amount when none supplied.
//
// persist=false (plain reset): this cycle never happened. All unplanned_expenses booked
// against this budget and its running-total asset entry are permanently deleted, then the
// balance is set to the new amount.
//
// persist=true (archived reset): this cycle's history is frozen. The budget is cloned into a
// new, archived row that takes over the existing unplanned_expenses + asset entry (so future
// resets can't touch them), then the live budget's balance is set to the new amount.
router.post('/:id/reset', async (req: Request, res: Response) => {
  const hasAmount = req.body?.amount !== undefined && req.body?.amount !== null && req.body?.amount !== '';
  const persist = req.body?.persist === true;
  try {
    const existing = await db.execute({
      sql: 'SELECT name, asset_id, original_amount, balance, color, notes, archived FROM adhoc_budgets WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId!],
    });
    const budget = existing.rows[0];
    if (!budget) return res.status(404).json({ error: 'budget not found' });
    if (Number(budget.archived) === 1) return res.status(400).json({ error: 'cannot reset an archived budget' });
    const liveId = req.params.id;
    const newBalance = hasAmount ? Number(req.body.amount) : Number(budget.original_amount);

    let archivedBudget: { id: number; name: string } | null = null;

    const tx = await db.transaction('write');
    try {
      if (persist) {
        const archiveName = `${budget.name} (closed ${new Date().toISOString().slice(0, 10)})`;
        const archiveResult = await tx.execute({
          sql: `INSERT INTO adhoc_budgets (name, asset_id, original_amount, balance, color, notes, user_id, archived, archived_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
          args: [archiveName, budget.asset_id, budget.original_amount, budget.balance, budget.color, budget.notes, req.userId!],
        });
        const archiveId = Number(archiveResult.lastInsertRowid!);
        await tx.execute({ sql: 'UPDATE unplanned_expenses SET adhoc_budget_id = ? WHERE adhoc_budget_id = ?', args: [archiveId, liveId] });
        await tx.execute({ sql: 'UPDATE asset_manual_entries SET adhoc_budget_id = ? WHERE adhoc_budget_id = ?', args: [archiveId, liveId] });
        archivedBudget = { id: archiveId, name: archiveName };
      } else {
        await tx.execute({ sql: 'DELETE FROM unplanned_expenses WHERE adhoc_budget_id = ?', args: [liveId] });
        await tx.execute({ sql: 'DELETE FROM asset_manual_entries WHERE adhoc_budget_id = ?', args: [liveId] });
      }
      await tx.execute({ sql: 'UPDATE adhoc_budgets SET balance = ? WHERE id = ?', args: [newBalance, liveId] });
      await tx.commit();
    } catch (e: any) {
      await tx.rollback();
      throw e;
    }

    const row = await db.execute({ sql: `${BUDGET_SELECT} WHERE b.id = ?`, args: [liveId] });
    res.json({ ...row.rows[0], archivedBudget });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Permanently deletes the budget along with every unplanned expense booked against it and
// its running-total asset entry — applies to archived (closed-cycle) budgets too.
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await db.execute({ sql: 'SELECT id FROM adhoc_budgets WHERE id = ? AND user_id = ?', args: [req.params.id, req.userId!] });
    if (!existing.rows[0]) return res.status(204).end();
    const tx = await db.transaction('write');
    try {
      await tx.execute({ sql: 'DELETE FROM unplanned_expenses WHERE adhoc_budget_id = ?', args: [req.params.id] });
      await tx.execute({ sql: 'DELETE FROM asset_manual_entries WHERE adhoc_budget_id = ?', args: [req.params.id] });
      await tx.execute({ sql: 'DELETE FROM adhoc_budgets WHERE id = ?', args: [req.params.id] });
      await tx.commit();
    } catch (e: any) {
      await tx.rollback();
      throw e;
    }
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
