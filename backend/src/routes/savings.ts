import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

router.get('/instruments', async (_req: Request, res: Response) => {
  try {
    const result = await db.execute({ sql: 'SELECT * FROM savings_instruments ORDER BY name', args: [] });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/instruments', async (req: Request, res: Response) => {
  const { name, type, color, monthly_target, notes, asset_name, include_in_assets, asset_id } = req.body;
  try {
    const result = await db.execute({
      sql: 'INSERT INTO savings_instruments (name, type, color, monthly_target, notes, asset_name, include_in_assets, asset_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [name, type, color || '#10b981', monthly_target || 0, notes || null, asset_name || null, include_in_assets ?? 1, asset_id ?? null],
    });
    const row = await db.execute({ sql: 'SELECT * FROM savings_instruments WHERE id = ?', args: [result.lastInsertRowid!] });
    res.status(201).json(row.rows[0]);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'Instrument name already exists' });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

router.put('/instruments/:id', async (req: Request, res: Response) => {
  const { name, type, color, monthly_target, notes, asset_name, include_in_assets, asset_id } = req.body;
  try {
    // asset_id preserved when omitted (mapping is managed via the dedicated /asset route).
    await db.execute({
      sql: 'UPDATE savings_instruments SET name=?, type=?, color=?, monthly_target=?, notes=?, asset_name=?, include_in_assets=?, asset_id=COALESCE(?, asset_id) WHERE id=?',
      args: [name, type, color, monthly_target, notes || null, asset_name || null, include_in_assets ?? 1, asset_id ?? null, req.params.id],
    });
    const row = await db.execute({ sql: 'SELECT * FROM savings_instruments WHERE id = ?', args: [req.params.id] });
    res.json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Dedicated mapping endpoint: set or clear the instrument -> asset link.
// asset_id null = unmapped (recording then blocked).
router.put('/instruments/:id/asset', async (req: Request, res: Response) => {
  const { asset_id } = req.body;
  try {
    await db.execute({
      sql: 'UPDATE savings_instruments SET asset_id = ? WHERE id = ?',
      args: [asset_id ?? null, req.params.id],
    });
    const row = await db.execute({ sql: 'SELECT * FROM savings_instruments WHERE id = ?', args: [req.params.id] });
    res.json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/instruments/:id', async (req: Request, res: Response) => {
  try {
    await db.execute({ sql: 'DELETE FROM savings_instruments WHERE id = ?', args: [req.params.id] });
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/entries', async (req: Request, res: Response) => {
  const { month, year, instrument_id } = req.query;
  let sql = `
    SELECT se.*, si.name as instrument_name, si.type, si.color, si.monthly_target
    FROM savings_entries se
    JOIN savings_instruments si ON si.id = se.instrument_id
    WHERE 1=1
  `;
  const args: any[] = [];
  if (month && year) { sql += ' AND se.month = ? AND se.year = ?'; args.push(Number(month), Number(year)); }
  if (instrument_id) { sql += ' AND se.instrument_id = ?'; args.push(Number(instrument_id)); }
  sql += ' ORDER BY se.year DESC, se.month DESC';
  try {
    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/entries', async (req: Request, res: Response) => {
  const { instrument_id, amount, month, year, notes } = req.body;
  try {
    // Records belong to a mapped asset — block recording on an unmapped instrument.
    const instr = await db.execute({ sql: 'SELECT asset_id FROM savings_instruments WHERE id = ?', args: [instrument_id] });
    if (instr.rows[0]?.asset_id == null) {
      return res.status(400).json({ error: 'Instrument not mapped to an asset' });
    }
    const result = await db.execute({
      sql: 'INSERT INTO savings_entries (instrument_id, amount, month, year, notes) VALUES (?, ?, ?, ?, ?)',
      args: [instrument_id, amount, month, year, notes || null],
    });
    const row = await db.execute({
      sql: `SELECT se.*, si.name as instrument_name, si.type, si.color, si.monthly_target
            FROM savings_entries se JOIN savings_instruments si ON si.id = se.instrument_id
            WHERE se.id = ?`,
      args: [result.lastInsertRowid!],
    });
    res.status(201).json(row.rows[0]);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'Entry already exists for this instrument/month/year' });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

router.put('/entries/:id', async (req: Request, res: Response) => {
  const { amount, notes } = req.body;
  try {
    await db.execute({
      sql: 'UPDATE savings_entries SET amount = ?, notes = ? WHERE id = ?',
      args: [amount, notes || null, req.params.id],
    });
    const row = await db.execute({
      sql: `SELECT se.*, si.name as instrument_name, si.type, si.color, si.monthly_target
            FROM savings_entries se JOIN savings_instruments si ON si.id = se.instrument_id
            WHERE se.id = ?`,
      args: [req.params.id],
    });
    res.json(row.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/entries/:id', async (req: Request, res: Response) => {
  try {
    await db.execute({ sql: 'DELETE FROM savings_entries WHERE id = ?', args: [req.params.id] });
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const result = await db.execute({
      sql: `SELECT si.id, si.name, si.type, si.color, si.monthly_target,
              COALESCE(SUM(se.amount), 0) as total_saved, COUNT(se.id) as months_count
            FROM savings_instruments si
            LEFT JOIN savings_entries se ON se.instrument_id = si.id
            GROUP BY si.id ORDER BY total_saved DESC`,
      args: [],
    });
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
