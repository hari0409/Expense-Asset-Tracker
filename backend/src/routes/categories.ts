import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { month, year } = req.query;
  try {
    let result;
    if (month && year) {
      result = await db.execute({
        sql: `SELECT ec.*, COALESCE(SUM(e.amount), 0) as spent
              FROM expense_categories ec
              LEFT JOIN expenses e ON e.category_id = ec.id
              WHERE ec.month = ? AND ec.year = ?
              GROUP BY ec.id ORDER BY ec.sort_order ASC, ec.name`,
        args: [Number(month), Number(year)],
      });
    } else {
      result = await db.execute({
        sql: `SELECT ec.*, COALESCE(SUM(e.amount), 0) as spent
              FROM expense_categories ec
              LEFT JOIN expenses e ON e.category_id = ec.id
              GROUP BY ec.id ORDER BY ec.year DESC, ec.month DESC, ec.sort_order ASC, ec.name`,
        args: [],
      });
    }
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { name, color, budget, month, year } = req.body;
  if (!month || !year) return res.status(400).json({ error: 'month and year required' });
  try {
    const result = await db.execute({
      sql: 'INSERT INTO expense_categories (name, color, budget, month, year) VALUES (?, ?, ?, ?, ?)',
      args: [name, color || '#6366f1', budget || 0, month, year],
    });
    const row = await db.execute({
      sql: 'SELECT * FROM expense_categories WHERE id = ?',
      args: [result.lastInsertRowid!],
    });
    res.status(201).json(row.rows[0]);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'Category already exists for this month/year' });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { name, color, budget } = req.body;
  try {
    await db.execute({
      sql: 'UPDATE expense_categories SET name = ?, color = ?, budget = ? WHERE id = ?',
      args: [name, color, budget, req.params.id],
    });
    const row = await db.execute({
      sql: 'SELECT * FROM expense_categories WHERE id = ?',
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
    await db.execute({
      sql: 'DELETE FROM expense_categories WHERE month = ? AND year = ?',
      args: [Number(month), Number(year)],
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await db.execute({ sql: 'DELETE FROM expense_categories WHERE id = ?', args: [req.params.id] });
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/reorder', async (req: Request, res: Response) => {
  // body: { ids: number[] } — ordered list of category IDs
  const { ids } = req.body as { ids: number[] };
  try {
    await Promise.all(ids.map((id, i) =>
      db.execute({ sql: 'UPDATE expense_categories SET sort_order = ? WHERE id = ?', args: [i, id] })
    ));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/copy', async (req: Request, res: Response) => {
  const { fromMonth, fromYear, toMonth, toYear } = req.body;
  try {
    const cats = await db.execute({
      sql: 'SELECT name, color, budget FROM expense_categories WHERE month = ? AND year = ?',
      args: [fromMonth, fromYear],
    });
    for (const c of cats.rows) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO expense_categories (name, color, budget, month, year) VALUES (?, ?, ?, ?, ?)',
        args: [c.name, c.color, c.budget, toMonth, toYear],
      });
    }
    res.json({ copied: cats.rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
