import { Router } from 'express';
import db from '../db';

const router = Router();

// GET /api/loans — list all loans with current EMI rate and total paid (single query)
router.get('/', async (req, res) => {
  try {
    const loans = await db.execute({
      sql: `SELECT l.*,
              (SELECT er.amount FROM emi_rates er WHERE er.loan_id = l.id
               ORDER BY (er.from_year * 12 + er.from_month) DESC LIMIT 1) AS current_emi_amount,
              COALESCE((SELECT SUM(ep.amount) FROM emi_payments ep WHERE ep.loan_id = l.id), 0) AS total_paid
            FROM loans l
            WHERE l.user_id = ?
            ORDER BY l.created_at DESC`,
      args: [req.userId!],
    });
    res.json(loans.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/loans — create loan
router.post('/', async (req, res) => {
  const { name, lender, principal, has_emi, color, notes, status, start_month, start_year, end_month, end_year, emi_amount } = req.body;
  if (!name || start_month == null || start_year == null) {
    return res.status(400).json({ error: 'name, start_month, start_year required' });
  }
  try {
    const result = await db.execute({
      sql: `INSERT INTO loans (name, lender, principal, has_emi, color, notes, status, start_month, start_year, end_month, end_year, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        name,
        lender ?? null,
        principal ?? null,
        has_emi ? 1 : 0,
        color ?? '#f43f5e',
        notes ?? null,
        status ?? 'active',
        Number(start_month),
        Number(start_year),
        end_month != null ? Number(end_month) : null,
        end_year != null ? Number(end_year) : null,
        req.userId!,
      ],
    });
    const loanId = Number(result.lastInsertRowid);

    if (has_emi && emi_amount != null) {
      await db.execute({
        sql: `INSERT INTO emi_rates (loan_id, amount, from_month, from_year) VALUES (?, ?, ?, ?)`,
        args: [loanId, Number(emi_amount), Number(start_month), Number(start_year)],
      });
    }

    const loan = await db.execute({ sql: 'SELECT * FROM loans WHERE id = ?', args: [loanId] });
    res.status(201).json(loan.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/loans/:id — update loan metadata
router.put('/:id', async (req, res) => {
  const { name, lender, principal, color, notes, status, end_month, end_year } = req.body;
  try {
    await db.execute({
      sql: `UPDATE loans SET name=?, lender=?, principal=?, color=?, notes=?, status=?, end_month=?, end_year=? WHERE id=? AND user_id=?`,
      args: [
        name,
        lender ?? null,
        principal ?? null,
        color,
        notes ?? null,
        status,
        end_month != null ? Number(end_month) : null,
        end_year != null ? Number(end_year) : null,
        Number(req.params.id),
        req.userId!,
      ],
    });
    const loan = await db.execute({ sql: 'SELECT * FROM loans WHERE id = ?', args: [Number(req.params.id)] });
    res.json(loan.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/loans/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM loans WHERE id = ? AND user_id = ?', args: [Number(req.params.id), req.userId!] });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

async function loanBelongsToUser(loanId: number, userId: number): Promise<boolean> {
  const row = await db.execute({ sql: 'SELECT id FROM loans WHERE id = ? AND user_id = ?', args: [loanId, userId] });
  return !!row.rows[0];
}

// POST /api/loans/:id/change-emi — insert new EMI rate from given month onwards
router.post('/:id/change-emi', async (req, res) => {
  const { amount, from_month, from_year } = req.body;
  if (amount == null || from_month == null || from_year == null) {
    return res.status(400).json({ error: 'amount, from_month, from_year required' });
  }
  try {
    if (!(await loanBelongsToUser(Number(req.params.id), req.userId!))) {
      return res.status(404).json({ error: 'loan not found' });
    }
    await db.execute({
      sql: `INSERT INTO emi_rates (loan_id, amount, from_month, from_year) VALUES (?, ?, ?, ?)`,
      args: [Number(req.params.id), Number(amount), Number(from_month), Number(from_year)],
    });
    res.status(201).json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/loans/emi-for-month — effective EMI rate per active loan for a month/year
router.get('/emi-for-month', async (req, res) => {
  if (!req.query.month || !req.query.year) {
    return res.status(400).json({ error: 'month and year required' });
  }
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  const threshold = year * 12 + month;

  try {
    const result = await db.execute({
      sql: `SELECT l.id AS loan_id, l.name AS loan_name, l.color AS loan_color,
              (SELECT er.amount FROM emi_rates er WHERE er.loan_id = l.id
               AND (er.from_year * 12 + er.from_month) <= ?
               ORDER BY (er.from_year * 12 + er.from_month) DESC LIMIT 1) AS emi_amount
            FROM loans l
            WHERE l.has_emi = 1 AND l.status = 'active' AND l.user_id = ?`,
      args: [threshold, req.userId!],
    });
    res.json(result.rows.filter(r => r.emi_amount !== null));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/loans/payments
router.get('/payments', async (req, res) => {
  const { month, year, loan_id } = req.query;
  let sql = `SELECT ep.*, l.name as loan_name, l.color as loan_color
             FROM emi_payments ep JOIN loans l ON l.id = ep.loan_id WHERE l.user_id = ?`;
  const args: (string | number)[] = [req.userId!];
  if (month != null) { sql += ' AND ep.month = ?'; args.push(Number(month)); }
  if (year != null) { sql += ' AND ep.year = ?'; args.push(Number(year)); }
  if (loan_id != null) { sql += ' AND ep.loan_id = ?'; args.push(Number(loan_id)); }
  sql += ' ORDER BY ep.year DESC, ep.month DESC';
  try {
    const rows = await db.execute({ sql, args });
    res.json(rows.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/loans/payments
router.post('/payments', async (req, res) => {
  const { loan_id, amount, month, year, notes } = req.body;
  if (!loan_id || amount == null || month == null || year == null) {
    return res.status(400).json({ error: 'loan_id, amount, month, year required' });
  }
  try {
    if (!(await loanBelongsToUser(Number(loan_id), req.userId!))) {
      return res.status(404).json({ error: 'loan not found' });
    }
    const result = await db.execute({
      sql: `INSERT INTO emi_payments (loan_id, amount, month, year, notes) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(loan_id, month, year) DO UPDATE SET amount=excluded.amount, notes=excluded.notes`,
      args: [Number(loan_id), Number(amount), Number(month), Number(year), notes ?? null],
    });
    const payment = await db.execute({
      sql: `SELECT ep.*, l.name as loan_name, l.color as loan_color
            FROM emi_payments ep JOIN loans l ON l.id = ep.loan_id WHERE ep.id = ?`,
      args: [Number(result.lastInsertRowid)],
    });
    res.status(201).json(payment.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/loans/payments/:id
router.put('/payments/:id', async (req, res) => {
  const { amount, notes } = req.body;
  try {
    await db.execute({
      sql: `UPDATE emi_payments SET amount=?, notes=? WHERE id=?
            AND loan_id IN (SELECT id FROM loans WHERE user_id = ?)`,
      args: [Number(amount), notes ?? null, Number(req.params.id), req.userId!],
    });
    const payment = await db.execute({
      sql: `SELECT ep.*, l.name as loan_name, l.color as loan_color
            FROM emi_payments ep JOIN loans l ON l.id = ep.loan_id WHERE ep.id = ?`,
      args: [Number(req.params.id)],
    });
    res.json(payment.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/loans/payments/:id
router.delete('/payments/:id', async (req, res) => {
  try {
    await db.execute({
      sql: 'DELETE FROM emi_payments WHERE id = ? AND loan_id IN (SELECT id FROM loans WHERE user_id = ?)',
      args: [Number(req.params.id), req.userId!],
    });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
