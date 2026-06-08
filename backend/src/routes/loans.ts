import { Router } from 'express';
import db from '../db';

const router = Router();

// GET /api/loans — list all loans with current EMI rate and total paid
router.get('/', async (_req, res) => {
  const loans = await db.execute({ sql: 'SELECT * FROM loans ORDER BY created_at DESC', args: [] });

  const enriched = await Promise.all(loans.rows.map(async (loan) => {
    const rateRow = await db.execute({
      sql: `SELECT amount FROM emi_rates WHERE loan_id = ?
            ORDER BY (from_year * 12 + from_month) DESC LIMIT 1`,
      args: [loan.id],
    });
    const totalRow = await db.execute({
      sql: `SELECT COALESCE(SUM(amount), 0) AS total FROM emi_payments WHERE loan_id = ?`,
      args: [loan.id],
    });
    return {
      ...loan,
      current_emi_amount: rateRow.rows[0]?.amount ?? null,
      total_paid: Number(totalRow.rows[0]?.total ?? 0),
    };
  }));

  res.json(enriched);
});

// POST /api/loans — create loan
router.post('/', async (req, res) => {
  const { name, lender, principal, has_emi, color, notes, status, start_month, start_year, end_month, end_year, emi_amount } = req.body;
  if (!name || start_month == null || start_year == null) {
    return res.status(400).json({ error: 'name, start_month, start_year required' });
  }
  const result = await db.execute({
    sql: `INSERT INTO loans (name, lender, principal, has_emi, color, notes, status, start_month, start_year, end_month, end_year)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
});

// PUT /api/loans/:id — update loan metadata
router.put('/:id', async (req, res) => {
  const { name, lender, principal, color, notes, status, end_month, end_year } = req.body;
  await db.execute({
    sql: `UPDATE loans SET name=?, lender=?, principal=?, color=?, notes=?, status=?, end_month=?, end_year=? WHERE id=?`,
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
    ],
  });
  const loan = await db.execute({ sql: 'SELECT * FROM loans WHERE id = ?', args: [Number(req.params.id)] });
  res.json(loan.rows[0]);
});

// DELETE /api/loans/:id
router.delete('/:id', async (req, res) => {
  await db.execute({ sql: 'DELETE FROM loans WHERE id = ?', args: [Number(req.params.id)] });
  res.status(204).send();
});

// POST /api/loans/:id/change-emi — insert new EMI rate from given month onwards
router.post('/:id/change-emi', async (req, res) => {
  const { amount, from_month, from_year } = req.body;
  if (amount == null || from_month == null || from_year == null) {
    return res.status(400).json({ error: 'amount, from_month, from_year required' });
  }
  await db.execute({
    sql: `INSERT INTO emi_rates (loan_id, amount, from_month, from_year) VALUES (?, ?, ?, ?)`,
    args: [Number(req.params.id), Number(amount), Number(from_month), Number(from_year)],
  });
  res.status(201).json({ ok: true });
});

// GET /api/loans/emi-for-month — effective EMI rate per active loan for a month/year
router.get('/emi-for-month', async (req, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  const threshold = year * 12 + month;

  const loans = await db.execute({
    sql: `SELECT id, name, color FROM loans WHERE has_emi = 1 AND status = 'active'`,
    args: [],
  });

  const result = await Promise.all(loans.rows.map(async (loan) => {
    const rate = await db.execute({
      sql: `SELECT amount FROM emi_rates WHERE loan_id = ?
            AND (from_year * 12 + from_month) <= ?
            ORDER BY (from_year * 12 + from_month) DESC LIMIT 1`,
      args: [loan.id, threshold],
    });
    return {
      loan_id: loan.id,
      loan_name: loan.name,
      loan_color: loan.color,
      emi_amount: rate.rows[0]?.amount ?? null,
    };
  }));

  res.json(result.filter(r => r.emi_amount !== null));
});

// GET /api/loans/payments
router.get('/payments', async (req, res) => {
  const { month, year, loan_id } = req.query;
  let sql = `SELECT ep.*, l.name as loan_name, l.color as loan_color
             FROM emi_payments ep JOIN loans l ON l.id = ep.loan_id WHERE 1=1`;
  const args: (string | number)[] = [];
  if (month != null) { sql += ' AND ep.month = ?'; args.push(Number(month)); }
  if (year != null) { sql += ' AND ep.year = ?'; args.push(Number(year)); }
  if (loan_id != null) { sql += ' AND ep.loan_id = ?'; args.push(Number(loan_id)); }
  sql += ' ORDER BY ep.year DESC, ep.month DESC';
  const rows = await db.execute({ sql, args });
  res.json(rows.rows);
});

// POST /api/loans/payments
router.post('/payments', async (req, res) => {
  const { loan_id, amount, month, year, notes } = req.body;
  if (!loan_id || amount == null || month == null || year == null) {
    return res.status(400).json({ error: 'loan_id, amount, month, year required' });
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
});

// PUT /api/loans/payments/:id
router.put('/payments/:id', async (req, res) => {
  const { amount, notes } = req.body;
  await db.execute({
    sql: `UPDATE emi_payments SET amount=?, notes=? WHERE id=?`,
    args: [Number(amount), notes ?? null, Number(req.params.id)],
  });
  const payment = await db.execute({
    sql: `SELECT ep.*, l.name as loan_name, l.color as loan_color
          FROM emi_payments ep JOIN loans l ON l.id = ep.loan_id WHERE ep.id = ?`,
    args: [Number(req.params.id)],
  });
  res.json(payment.rows[0]);
});

// DELETE /api/loans/payments/:id
router.delete('/payments/:id', async (req, res) => {
  await db.execute({ sql: 'DELETE FROM emi_payments WHERE id = ?', args: [Number(req.params.id)] });
  res.status(204).send();
});

export default router;
