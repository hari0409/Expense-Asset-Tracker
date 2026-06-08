import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { category_id, month, year } = req.query;
  let sql = `
    SELECT e.*, ec.name as category_name, ec.color as category_color, ec.budget
    FROM expenses e
    JOIN expense_categories ec ON ec.id = e.category_id
    WHERE 1=1
  `;
  const args: any[] = [];
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
    WHERE ec.month = ? AND ec.year = ?
  `;
  const args: any[] = [Number(month), Number(year)];
  if (category_id) { sql += ' AND e.category_id = ?'; args.push(Number(category_id)); }
  sql += ' GROUP BY day, e.category_id ORDER BY day';
  try {
    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/timeline', async (_req: Request, res: Response) => {
  try {
    const [planned, emi, unplanned] = await Promise.all([
      db.execute({
        sql: `SELECT ec.month, ec.year, COALESCE(SUM(e.amount), 0) as total
              FROM expense_categories ec LEFT JOIN expenses e ON e.category_id = ec.id
              GROUP BY ec.year, ec.month`,
        args: [],
      }),
      db.execute({
        sql: `SELECT month, year, COALESCE(SUM(amount), 0) as total FROM emi_payments GROUP BY year, month`,
        args: [],
      }),
      db.execute({
        sql: `SELECT month, year, COALESCE(SUM(amount), 0) as total FROM unplanned_expenses GROUP BY year, month`,
        args: [],
      }),
    ]);

    const points: Record<string, { month: number; year: number; planned: number; emi: number; unplanned: number }> = {};
    const point = (month: number, year: number) => {
      const key = `${year}-${month}`;
      if (!points[key]) points[key] = { month, year, planned: 0, emi: 0, unplanned: 0 };
      return points[key];
    };
    planned.rows.forEach(r => { point(Number(r.month), Number(r.year)).planned = Number(r.total); });
    emi.rows.forEach(r => { point(Number(r.month), Number(r.year)).emi = Number(r.total); });
    unplanned.rows.forEach(r => { point(Number(r.month), Number(r.year)).unplanned = Number(r.total); });

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
            WHERE e.date BETWEEN ? AND ?
            GROUP BY period, ec.name
            ORDER BY period ASC, total DESC`,
      args: [String(from), String(to)],
    });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { category_id, amount, formula, description, date } = req.body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  try {
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
    await db.execute({
      sql: "UPDATE expenses SET amount = ?, formula = ?, description = ?, date = ?, category_id = ?, updated_at = datetime('now') WHERE id = ?",
      args: [amount, formula || null, description || null, date, category_id, req.params.id],
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
              SELECT id FROM expense_categories WHERE month = ? AND year = ?
            )`,
      args: [Number(month), Number(year)],
    });
    res.json({ deleted: result.rowsAffected });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await db.execute({ sql: 'DELETE FROM expenses WHERE id = ?', args: [req.params.id] });
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
