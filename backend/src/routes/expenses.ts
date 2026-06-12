import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { category_id, month, year } = req.query;
  let sql = `
    SELECT e.*, ec.name as category_name, ec.color as category_color, ec.budget, ec.kind as category_kind
    FROM expenses e
    JOIN expense_categories ec ON ec.id = e.category_id
    WHERE ec.user_id = ?
  `;
  const args: any[] = [req.userId!];
  if (category_id) { sql += ' AND e.category_id = ?'; args.push(Number(category_id)); }
  if (month && year) { sql += ' AND ec.month = ? AND ec.year = ?'; args.push(Number(month), Number(year)); }
  sql += ' ORDER BY e.date DESC, e.created_at DESC';
  try {
    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/daily', async (req: Request, res: Response) => {
  const { month, year, category_id } = req.query;
  let sql = `
    SELECT strftime('%d', e.date) as day, SUM(e.amount) as total, e.category_id
    FROM expenses e
    JOIN expense_categories ec ON ec.id = e.category_id
    WHERE ec.month = ? AND ec.year = ? AND ec.user_id = ?
  `;
  const args: any[] = [Number(month), Number(year), req.userId!];
  if (category_id) { sql += ' AND e.category_id = ?'; args.push(Number(category_id)); }
  sql += ' GROUP BY day, e.category_id ORDER BY day';
  try {
    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/timeline', async (req: Request, res: Response) => {
  try {
    // "unplanned" = spends in reserved Unplanned categories + adhoc-budget spends.
    const [planned, unplannedCat, emi, adhoc] = await Promise.all([
      db.execute({
        sql: `SELECT ec.month, ec.year, COALESCE(SUM(e.amount), 0) as total
              FROM expense_categories ec LEFT JOIN expenses e ON e.category_id = ec.id
              WHERE ec.user_id = ? AND ec.kind != 'unplanned'
              GROUP BY ec.year, ec.month`,
        args: [req.userId!],
      }),
      db.execute({
        sql: `SELECT ec.month, ec.year, COALESCE(SUM(e.amount), 0) as total
              FROM expense_categories ec JOIN expenses e ON e.category_id = ec.id
              WHERE ec.user_id = ? AND ec.kind = 'unplanned'
              GROUP BY ec.year, ec.month`,
        args: [req.userId!],
      }),
      db.execute({
        sql: `SELECT ep.month, ep.year, COALESCE(SUM(ep.amount), 0) as total
              FROM emi_payments ep JOIN loans l ON l.id = ep.loan_id
              WHERE l.user_id = ?
              GROUP BY ep.year, ep.month`,
        args: [req.userId!],
      }),
      db.execute({
        sql: `SELECT month, year, COALESCE(SUM(amount), 0) as total
              FROM unplanned_expenses WHERE user_id = ?
              GROUP BY year, month`,
        args: [req.userId!],
      }),
    ]);

    const points: Record<string, { month: number; year: number; planned: number; emi: number; unplanned: number }> = {};
    const point = (month: number, year: number) => {
      const key = `${year}-${month}`;
      if (!points[key]) points[key] = { month, year, planned: 0, emi: 0, unplanned: 0 };
      return points[key];
    };
    planned.rows.forEach(r => { point(Number(r.month), Number(r.year)).planned = Number(r.total); });
    unplannedCat.rows.forEach(r => { point(Number(r.month), Number(r.year)).unplanned += Number(r.total); });
    emi.rows.forEach(r => { point(Number(r.month), Number(r.year)).emi = Number(r.total); });
    adhoc.rows.forEach(r => { point(Number(r.month), Number(r.year)).unplanned += Number(r.total); });

    const rows = Object.values(points)
      .map(p => ({ ...p, total: p.planned + p.emi + p.unplanned }))
      .sort((a, b) => a.year - b.year || a.month - b.month);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/category-range-summary', async (req: Request, res: Response) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
  try {
    const result = await db.execute({
      sql: `SELECT strftime('%Y-%m', e.date) AS period,
                   ec.name AS category_name,
                   MAX(ec.color) AS category_color,
                   SUM(e.amount) AS total
            FROM expenses e
            JOIN expense_categories ec ON ec.id = e.category_id
            WHERE e.date BETWEEN ? AND ? AND ec.user_id = ?
            GROUP BY period, ec.name
            ORDER BY period ASC, total DESC`,
      args: [String(from), String(to), req.userId!],
    });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

async function categoryBelongsToUser(categoryId: number, userId: number): Promise<boolean> {
  const row = await db.execute({ sql: 'SELECT id FROM expense_categories WHERE id = ? AND user_id = ?', args: [categoryId, userId] });
  return !!row.rows[0];
}

router.post('/', async (req: Request, res: Response) => {
  const { category_id, amount, formula, description, date } = req.body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  try {
    if (!(await categoryBelongsToUser(Number(category_id), req.userId!))) {
      return res.status(404).json({ error: 'category not found' });
    }
    const result = await db.execute({
      sql: "INSERT INTO expenses (category_id, amount, formula, description, date, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
      args: [category_id, amount, formula || null, description || null, date],
    });
    const row = await db.execute({
      sql: `SELECT e.*, ec.name as category_name, ec.color as category_color, ec.budget
            FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
            WHERE e.id = ?`,
      args: [result.lastInsertRowid!],
    });
    res.status(201).json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { amount, formula, description, date, category_id } = req.body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  try {
    if (!(await categoryBelongsToUser(Number(category_id), req.userId!))) {
      return res.status(404).json({ error: 'category not found' });
    }
    await db.execute({
      sql: `UPDATE expenses SET amount = ?, formula = ?, description = ?, date = ?, category_id = ?, updated_at = datetime('now')
            WHERE id = ? AND category_id IN (SELECT id FROM expense_categories WHERE user_id = ?)`,
      args: [amount, formula || null, description || null, date, category_id, req.params.id, req.userId!],
    });
    const row = await db.execute({
      sql: `SELECT e.*, ec.name as category_name, ec.color as category_color, ec.budget
            FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
            WHERE e.id = ?`,
      args: [req.params.id],
    });
    res.json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/month', async (req: Request, res: Response) => {
  const { month, year } = req.query;
  if (!month || !year) return res.status(400).json({ error: 'month and year required' });
  try {
    const result = await db.execute({
      sql: `DELETE FROM expenses WHERE category_id IN (
              SELECT id FROM expense_categories WHERE month = ? AND year = ? AND user_id = ?
            )`,
      args: [Number(month), Number(year), req.userId!],
    });
    res.json({ deleted: result.rowsAffected });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await db.execute({
      sql: 'DELETE FROM expenses WHERE id = ? AND category_id IN (SELECT id FROM expense_categories WHERE user_id = ?)',
      args: [req.params.id, req.userId!],
    });
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
