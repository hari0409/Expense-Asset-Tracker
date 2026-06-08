import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

// ── Persons (like categories) ──────────────────────────────────────────────

router.get('/persons', async (_req: Request, res: Response) => {
  try {
    const result = await db.execute({
      sql: `SELECT p.*,
              COALESCE(SUM(CASE WHEN e.status != 'paid' THEN e.amount - e.amount_returned ELSE 0 END), 0) as outstanding,
              COALESCE(SUM(e.amount), 0) as total_lent,
              COUNT(e.id) as entry_count
            FROM rent_out_persons p
            LEFT JOIN rent_out_entries e ON e.person_id = p.id
            GROUP BY p.id ORDER BY outstanding DESC, p.name`,
      args: [],
    });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/persons', async (req: Request, res: Response) => {
  const { name, color, notes } = req.body;
  try {
    const result = await db.execute({
      sql: 'INSERT INTO rent_out_persons (name, color, notes) VALUES (?, ?, ?)',
      args: [name, color || '#f59e0b', notes || null],
    });
    const row = await db.execute({ sql: 'SELECT * FROM rent_out_persons WHERE id = ?', args: [result.lastInsertRowid!] });
    res.status(201).json(row.rows[0]);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) res.status(409).json({ error: 'Person already exists' });
    else res.status(500).json({ error: e.message });
  }
});

router.put('/persons/:id', async (req: Request, res: Response) => {
  const { name, color, notes } = req.body;
  try {
    await db.execute({
      sql: 'UPDATE rent_out_persons SET name=?, color=?, notes=? WHERE id=?',
      args: [name, color, notes || null, req.params.id],
    });
    const row = await db.execute({ sql: 'SELECT * FROM rent_out_persons WHERE id = ?', args: [req.params.id] });
    res.json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/persons/:id', async (req: Request, res: Response) => {
  try {
    await db.execute({ sql: 'DELETE FROM rent_out_persons WHERE id = ?', args: [req.params.id] });
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Bulk settle for a person (FIFO) ───────────────────────────────────────

router.post('/persons/:id/settle', async (req: Request, res: Response) => {
  const { amount, date, notes } = req.body as { amount: number; date?: string; notes?: string };
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be > 0' });

  const tx = await db.transaction('write');
  try {
    const pending = await tx.execute({
      sql: `SELECT * FROM rent_out_entries
            WHERE person_id = ? AND status != 'paid'
            ORDER BY date_given ASC, created_at ASC`,
      args: [req.params.id],
    });

    let remaining = amount;
    for (const entry of pending.rows as any[]) {
      if (remaining <= 0) break;
      const owed = Number(entry.amount) - Number(entry.amount_returned);
      if (owed <= 0) continue;
      const pay = Math.min(owed, remaining);
      const newReturned = Number(entry.amount_returned) + pay;
      const status = newReturned >= Number(entry.amount) ? 'paid' : 'partial';
      await tx.execute({
        sql: 'UPDATE rent_out_entries SET amount_returned=?, status=? WHERE id=?',
        args: [newReturned, status, entry.id],
      });
      remaining -= pay;
    }

    const settled = amount - remaining;
    await tx.execute({
      sql: 'INSERT INTO rent_out_settlements (person_id, amount, date, notes) VALUES (?, ?, ?, ?)',
      args: [req.params.id, settled, date ?? new Date().toISOString().split('T')[0], notes ?? null],
    });

    await tx.commit();
    res.json({ settled, leftover: remaining });
  } catch (e: any) {
    await tx.rollback();
    res.status(500).json({ error: e.message });
  }
});

router.post('/persons/:id/log-settlement', async (req: Request, res: Response) => {
  const { amount, date, notes } = req.body as { amount: number; date?: string; notes?: string };
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be > 0' });
  try {
    const result = await db.execute({
      sql: 'INSERT INTO rent_out_settlements (person_id, amount, date, notes) VALUES (?, ?, ?, ?)',
      args: [req.params.id, amount, date ?? new Date().toISOString().split('T')[0], notes ?? null],
    });
    const row = await db.execute({ sql: 'SELECT * FROM rent_out_settlements WHERE id = ?', args: [result.lastInsertRowid!] });
    res.status(201).json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/persons/:id/settlements', async (req: Request, res: Response) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM rent_out_settlements WHERE person_id = ? ORDER BY date DESC, created_at DESC',
      args: [req.params.id],
    });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/settlements/:id', async (req: Request, res: Response) => {
  try {
    await db.execute({ sql: 'DELETE FROM rent_out_settlements WHERE id = ?', args: [req.params.id] });
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Entries ────────────────────────────────────────────────────────────────

router.get('/entries', async (req: Request, res: Response) => {
  const { person_id, status } = req.query;
  let sql = `SELECT e.*, p.name as person_name, p.color as person_color
             FROM rent_out_entries e JOIN rent_out_persons p ON p.id = e.person_id
             WHERE 1=1`;
  const args: any[] = [];
  if (person_id) { sql += ' AND e.person_id = ?'; args.push(Number(person_id)); }
  if (status) { sql += ' AND e.status = ?'; args.push(status); }
  sql += ' ORDER BY e.date_given DESC, e.created_at DESC';
  try {
    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/entries', async (req: Request, res: Response) => {
  const { person_id, amount, description, date_given, notes } = req.body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  try {
    const result = await db.execute({
      sql: 'INSERT INTO rent_out_entries (person_id, amount, description, date_given, notes) VALUES (?, ?, ?, ?, ?)',
      args: [person_id, amount, description || null, date_given, notes || null],
    });
    const row = await db.execute({
      sql: `SELECT e.*, p.name as person_name, p.color as person_color
            FROM rent_out_entries e JOIN rent_out_persons p ON p.id = e.person_id
            WHERE e.id = ?`,
      args: [result.lastInsertRowid!],
    });
    res.status(201).json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/entries/:id', async (req: Request, res: Response) => {
  const { person_id, amount, description, date_given, amount_returned, notes } = req.body;
  try {
    const returned = Number(amount_returned) || 0;
    const newStatus = returned >= Number(amount) ? 'paid' : returned > 0 ? 'partial' : 'pending';
    await db.execute({
      sql: `UPDATE rent_out_entries SET person_id=?, amount=?, description=?, date_given=?,
            status=?, amount_returned=?, notes=? WHERE id=?`,
      args: [person_id, amount, description || null, date_given, newStatus, returned, notes || null, req.params.id],
    });
    const row = await db.execute({
      sql: `SELECT e.*, p.name as person_name, p.color as person_color
            FROM rent_out_entries e JOIN rent_out_persons p ON p.id = e.person_id
            WHERE e.id = ?`,
      args: [req.params.id],
    });
    res.json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/entries/:id/return', async (req: Request, res: Response) => {
  const { amount_returned } = req.body;
  try {
    const existing = await db.execute({ sql: 'SELECT * FROM rent_out_entries WHERE id = ?', args: [req.params.id] });
    if (!existing.rows[0]) return res.status(404).json({ error: 'Not found' });
    const row = existing.rows[0] as any;
    const newReturned = Math.min(Number(row.amount), Number(amount_returned));
    const status = newReturned >= Number(row.amount) ? 'paid' : newReturned > 0 ? 'partial' : 'pending';
    await db.execute({
      sql: 'UPDATE rent_out_entries SET amount_returned=?, status=? WHERE id=?',
      args: [newReturned, status, req.params.id],
    });
    const updated = await db.execute({
      sql: `SELECT e.*, p.name as person_name, p.color as person_color
            FROM rent_out_entries e JOIN rent_out_persons p ON p.id = e.person_id
            WHERE e.id = ?`,
      args: [req.params.id],
    });
    res.json(updated.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/entries/:id', async (req: Request, res: Response) => {
  try {
    await db.execute({ sql: 'DELETE FROM rent_out_entries WHERE id = ?', args: [req.params.id] });
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
