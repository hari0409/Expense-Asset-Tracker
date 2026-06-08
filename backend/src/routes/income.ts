import { Router } from 'express';
import db from '../db';

const router = Router();

// GET /api/income?month=&year= — forward-carry: returns most recent entry on or before given month
router.get('/', async (req, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  if (!month || !year) return res.status(400).json({ error: 'month and year required' });

  const threshold = year * 12 + month;
  try {
    const row = await db.execute({
      sql: `SELECT * FROM monthly_income
            WHERE (year * 12 + month) <= ?
            ORDER BY (year * 12 + month) DESC LIMIT 1`,
      args: [threshold],
    });
    res.json(row.rows[0] ?? null);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/income — set income for a specific month (upsert)
router.post('/', async (req, res) => {
  const { month, year, amount, notes } = req.body;
  if (month == null || year == null || amount == null) {
    return res.status(400).json({ error: 'month, year, amount required' });
  }
  try {
    await db.execute({
      sql: `INSERT INTO monthly_income (month, year, amount, notes) VALUES (?, ?, ?, ?)
            ON CONFLICT(month, year) DO UPDATE SET amount=excluded.amount, notes=excluded.notes`,
      args: [Number(month), Number(year), Number(amount), notes ?? null],
    });
    const row = await db.execute({
      sql: `SELECT * FROM monthly_income WHERE month = ? AND year = ?`,
      args: [Number(month), Number(year)],
    });
    res.status(201).json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/income/history — all entries ordered chronologically
router.get('/history', async (_req, res) => {
  try {
    const rows = await db.execute({
      sql: `SELECT * FROM monthly_income ORDER BY year ASC, month ASC`,
      args: [],
    });
    res.json(rows.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
