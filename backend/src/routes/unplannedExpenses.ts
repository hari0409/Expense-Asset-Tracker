import { Router, Request, Response } from 'express';
import db, { getOrCreateUnplannedCategory } from '../db';

const router = Router();

function monthYearFromDate(date: string): [number, number] {
  const [year, month] = date.split('-').map(Number);
  return [month, year];
}

// Lists adhoc-budget spends (and legacy asset-withdrawal rows). Budget-less sudden
// expenses live in the reserved "Unplanned" category and come from /api/expenses.
router.get('/', async (req: Request, res: Response) => {
  const { month, year } = req.query;
  let sql = `SELECT ue.*, me.asset_id AS source_asset_id, a.name AS source_asset_name,
                    b.name AS adhoc_budget_name
             FROM unplanned_expenses ue
             LEFT JOIN asset_manual_entries me ON me.linked_unplanned_expense_id = ue.id
             LEFT JOIN assets a ON a.id = me.asset_id
             LEFT JOIN adhoc_budgets b ON b.id = ue.adhoc_budget_id
             WHERE ue.user_id = ?`;
  const args: any[] = [req.userId!];
  if (month && year) { sql += ' AND ue.month = ? AND ue.year = ?'; args.push(Number(month), Number(year)); }
  sql += ' ORDER BY ue.date DESC, ue.created_at DESC';
  try {
    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { amount, description, date, adhoc_budget_id } = req.body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  if (!date) return res.status(400).json({ error: 'date is required' });
  const amt = Number(amount);
  const [month, year] = monthYearFromDate(date);

  // No adhoc budget — book it as a regular expense under the reserved per-month
  // "Unplanned" category so it counts against a real budget.
  if (adhoc_budget_id == null) {
    try {
      const categoryId = await getOrCreateUnplannedCategory(req.userId!, month, year);
      const result = await db.execute({
        sql: "INSERT INTO expenses (category_id, amount, description, date, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
        args: [categoryId, amt, description || null, date],
      });
      const row = await db.execute({
        sql: `SELECT e.*, ec.name as category_name, ec.color as category_color, ec.budget
              FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
              WHERE e.id = ?`,
        args: [result.lastInsertRowid!],
      });
      return res.status(201).json(row.rows[0]);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Adhoc-budget expense — drains the budget's source asset.
  const budget = await db.execute({
    sql: 'SELECT id, name, asset_id FROM adhoc_budgets WHERE id = ? AND user_id = ?',
    args: [adhoc_budget_id, req.userId!],
  });
  if (!budget.rows[0]) return res.status(400).json({ error: 'adhoc budget not found' });
  const assetId = budget.rows[0].asset_id != null ? Number(budget.rows[0].asset_id) : null;
  const budgetName = String(budget.rows[0].name);

  const tx = await db.transaction('write');
  try {
    const expResult = await tx.execute({
      sql: 'INSERT INTO unplanned_expenses (amount, description, date, month, year, adhoc_budget_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [amt, description || null, date, month, year, adhoc_budget_id, req.userId!],
    });
    const expenseId = Number(expResult.lastInsertRowid!);
    if (assetId != null) {
      // All spends from this budget share one running-total entry on the asset, updated in place.
      const entryRow = await tx.execute({ sql: 'SELECT id FROM asset_manual_entries WHERE adhoc_budget_id = ?', args: [adhoc_budget_id] });
      if (entryRow.rows[0]) {
        await tx.execute({
          sql: `UPDATE asset_manual_entries SET amount = amount - ?, date = CASE WHEN ? > date THEN ? ELSE date END WHERE id = ?`,
          args: [amt, date, date, Number(entryRow.rows[0].id)],
        });
      } else {
        await tx.execute({
          sql: 'INSERT INTO asset_manual_entries (asset_id, amount, note, date, adhoc_budget_id) VALUES (?, ?, ?, ?, ?)',
          args: [assetId, -amt, `${budgetName} — adhoc spends`, date, adhoc_budget_id],
        });
      }
    }
    await tx.execute({ sql: 'UPDATE adhoc_budgets SET balance = balance - ? WHERE id = ?', args: [amt, adhoc_budget_id] });
    await tx.commit();
    const row = await db.execute({ sql: 'SELECT * FROM unplanned_expenses WHERE id = ?', args: [expenseId] });
    res.status(201).json(row.rows[0]);
  } catch (e: any) {
    await tx.rollback();
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { amount, description, date } = req.body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  if (!date) return res.status(400).json({ error: 'date is required' });
  const [month, year] = monthYearFromDate(date);
  try {
    const existing = await db.execute({
      sql: 'SELECT adhoc_budget_id FROM unplanned_expenses WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId!],
    });
    if (!existing.rows[0]) return res.status(404).json({ error: 'expense not found' });
    if (existing.rows[0].adhoc_budget_id != null) {
      return res.status(409).json({ error: 'This expense is from an adhoc budget — delete and re-add to change it.' });
    }
    // Legacy asset-linked withdrawals are still managed from the asset's manual entries.
    const linked = await db.execute({ sql: 'SELECT id FROM asset_manual_entries WHERE linked_unplanned_expense_id = ?', args: [req.params.id] });
    if (linked.rows.length > 0) {
      return res.status(409).json({ error: 'This expense was created from an asset withdrawal — edit it from the asset\'s manual entries instead.' });
    }
    await db.execute({
      sql: 'UPDATE unplanned_expenses SET amount = ?, description = ?, date = ?, month = ?, year = ? WHERE id = ?',
      args: [amount, description || null, date, month, year, req.params.id],
    });
    const row = await db.execute({ sql: 'SELECT * FROM unplanned_expenses WHERE id = ?', args: [req.params.id] });
    res.json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await db.execute({
      sql: 'SELECT amount, adhoc_budget_id FROM unplanned_expenses WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId!],
    });
    const row = existing.rows[0];
    if (!row) return res.status(204).end();

    if (row.adhoc_budget_id != null) {
      // Reverse the adhoc spend: shrink the budget's running-total asset entry, restore the
      // budget balance, delete the expense.
      const entryRow = await db.execute({ sql: 'SELECT id, amount FROM asset_manual_entries WHERE adhoc_budget_id = ?', args: [row.adhoc_budget_id] });
      const tx = await db.transaction('write');
      try {
        if (entryRow.rows[0]) {
          const entryId = Number(entryRow.rows[0].id);
          const newAmount = Number(entryRow.rows[0].amount) + Number(row.amount);
          if (Math.abs(newAmount) < 0.005) {
            await tx.execute({ sql: 'DELETE FROM asset_manual_entries WHERE id = ?', args: [entryId] });
          } else {
            await tx.execute({ sql: 'UPDATE asset_manual_entries SET amount = ? WHERE id = ?', args: [newAmount, entryId] });
          }
        }
        await tx.execute({ sql: 'UPDATE adhoc_budgets SET balance = balance + ? WHERE id = ?', args: [Number(row.amount), row.adhoc_budget_id] });
        await tx.execute({ sql: 'DELETE FROM unplanned_expenses WHERE id = ?', args: [req.params.id] });
        await tx.commit();
      } catch (e: any) {
        await tx.rollback();
        throw e;
      }
      return res.status(204).end();
    }

    // Legacy asset-linked withdrawals must be removed from the asset's manual entries.
    const linked = await db.execute({ sql: 'SELECT id FROM asset_manual_entries WHERE linked_unplanned_expense_id = ?', args: [req.params.id] });
    if (linked.rows.length > 0) {
      return res.status(409).json({ error: 'This expense was created from an asset withdrawal — delete it from the asset\'s manual entries instead.' });
    }
    await db.execute({ sql: 'DELETE FROM unplanned_expenses WHERE id = ?', args: [req.params.id] });
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
