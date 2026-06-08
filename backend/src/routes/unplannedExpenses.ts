import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

function monthYearFromDate(date: string): [number, number] {
  const [year, month] = date.split('-').map(Number);
  return [month, year];
}

router.get('/', async (req: Request, res: Response) => {
  const { month, year } = req.query;
  let sql = `SELECT ue.*, me.asset_id AS source_asset_id, a.name AS source_asset_name
             FROM unplanned_expenses ue
             LEFT JOIN asset_manual_entries me ON me.linked_unplanned_expense_id = ue.id
             LEFT JOIN assets a ON a.id = me.asset_id
             WHERE 1=1`;
  const args: any[] = [];
  if (month && year) { sql += ' AND month = ? AND year = ?'; args.push(Number(month), Number(year)); }
  sql += ' ORDER BY date DESC, created_at DESC';
  try {
    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { amount, description, date } = req.body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  if (!date) return res.status(400).json({ error: 'date is required' });
  const [month, year] = monthYearFromDate(date);
  try {
    const result = await db.execute({
      sql: 'INSERT INTO unplanned_expenses (amount, description, date, month, year) VALUES (?, ?, ?, ?, ?)',
      args: [amount, description || null, date, month, year],
    });
    const row = await db.execute({ sql: 'SELECT * FROM unplanned_expenses WHERE id = ?', args: [result.lastInsertRowid!] });
    res.status(201).json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

async function isLinkedToWithdrawal(id: string): Promise<boolean> {
  const r = await db.execute({ sql: 'SELECT id FROM asset_manual_entries WHERE linked_unplanned_expense_id = ?', args: [id] });
  return r.rows.length > 0;
}

router.put('/:id', async (req: Request, res: Response) => {
  const { amount, description, date } = req.body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  if (!date) return res.status(400).json({ error: 'date is required' });
  const [month, year] = monthYearFromDate(date);
  try {
    if (await isLinkedToWithdrawal(req.params.id)) {
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
    if (await isLinkedToWithdrawal(req.params.id)) {
      return res.status(409).json({ error: 'This expense was created from an asset withdrawal — delete it from the asset\'s manual entries instead.' });
    }
    await db.execute({ sql: 'DELETE FROM unplanned_expenses WHERE id = ?', args: [req.params.id] });
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
