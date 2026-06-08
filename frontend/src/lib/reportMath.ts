// Shared helpers for the Reports page: month-overlap range math + linear-regression forecasting.

export function ymKey(year: number, month: number) {
  return year * 12 + month;
}

export function dateToYM(dateStr: string) {
  const [y, m] = dateStr.split('-').map(Number);
  return ymKey(y, m);
}

// All {year, month} pairs touched by [from, to] (inclusive) — month-overlap semantics
// for tables that only carry month/year (savings, EMI, asset snapshots, income).
export function monthsInRange(from: string, to: string): { year: number; month: number }[] {
  const start = dateToYM(from);
  const end = dateToYM(to);
  const out: { year: number; month: number }[] = [];
  for (let ym = start; ym <= end; ym++) {
    const year = Math.floor((ym - 1) / 12);
    const month = ym - year * 12;
    out.push({ year, month });
  }
  return out;
}

export function periodLabel(period: string) {
  const [y, m] = period.split('-').map(Number);
  return `${new Date(y, m - 1).toLocaleString('default', { month: 'short' })} ${y}`;
}

export function addMonthsToPeriod(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const fy = Math.floor(total / 12);
  const fm = (total % 12) + 1;
  return `${fy}-${String(fm).padStart(2, '0')}`;
}

export function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return fmtDate(d);
}

export function daysBetween(from: string, to: string) {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

// Most recent income entry on or before (year, month) — mirrors the backend's forward-carry logic.
export function incomeForMonth(history: { year: number; month: number; amount: number }[], year: number, month: number): number {
  const target = ymKey(year, month);
  let best: { year: number; month: number; amount: number } | null = null;
  for (const inc of history) {
    const incYm = ymKey(inc.year, inc.month);
    if (incYm <= target && (!best || incYm > ymKey(best.year, best.month))) best = inc;
  }
  return best ? Number(best.amount) : 0;
}

export interface RegressionPoint { x: number; y: number; period: string }

export function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

export interface ForecastRow { label: string; actual: number | null; projected: number | null }

// Builds chart-ready rows: historical "actual" values plus a dashed "projected" continuation,
// bridged at the last historical point so the two lines connect visually.
export function buildForecastData(series: RegressionPoint[], reg: { slope: number; intercept: number } | null, horizon: number): ForecastRow[] {
  const rows: ForecastRow[] = series.map(p => ({ label: periodLabel(p.period), actual: p.y, projected: null }));
  if (!reg || series.length === 0) return rows;
  const last = series[series.length - 1];
  rows[rows.length - 1] = { ...rows[rows.length - 1], projected: last.y };
  for (let i = 1; i <= horizon; i++) {
    const period = addMonthsToPeriod(last.period, i);
    rows.push({ label: periodLabel(period), actual: null, projected: reg.slope * (last.x + i) + reg.intercept });
  }
  return rows;
}
