import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type {
  CategoryRangePoint, SavingsInstrument, SavingsEntry, EmiPayment, UnplannedExpense,
  AssetTimelinePoint, MonthlyIncome, ExpenseTimelinePoint,
} from '../api';
import DateRangePicker from '../components/DateRangePicker';
import {
  ymKey, dateToYM, monthsInRange, periodLabel, fmtDate, addDays, daysBetween,
  incomeForMonth, linearRegression, buildForecastData, type RegressionPoint,
} from '../lib/reportMath';
import { Download, TrendingUp, TrendingDown, Minus, Wallet, PiggyBank, Receipt, Landmark } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const TODAY = new Date();
const DEFAULT_TO = fmtDate(TODAY);
const DEFAULT_FROM = fmtDate(new Date(TODAY.getFullYear(), TODAY.getMonth() - 5, 1));

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4', '#a855f7', '#f97316', '#84cc16'];
const HORIZONS = [3, 6, 12];

const TOOLTIP_STYLE = {
  contentStyle: { background: '#141418', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: '#f3f1ec' },
  labelStyle: { color: '#9b9aa3' },
  itemStyle: { color: '#f3f1ec' },
};

function fmt(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-surface rounded-2xl border border-line p-4 print:break-inside-avoid ${className}`}>{children}</div>;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${value > 0 ? 'text-red-500' : value < 0 ? 'text-emerald-400' : 'text-ink-faint'}`}>
      {value > 0 ? <TrendingUp size={11} /> : value < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
      {value > 0 ? '+' : ''}{fmt(Math.abs(value))}
    </span>
  );
}

export default function Reports() {
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [horizon, setHorizon] = useState(6);

  const [categoryPoints, setCategoryPoints] = useState<CategoryRangePoint[]>([]);
  const [prevCategoryPoints, setPrevCategoryPoints] = useState<CategoryRangePoint[]>([]);
  const [instruments, setInstruments] = useState<SavingsInstrument[]>([]);
  const [savingsEntries, setSavingsEntries] = useState<SavingsEntry[]>([]);
  const [emiPayments, setEmiPayments] = useState<EmiPayment[]>([]);
  const [unplanned, setUnplanned] = useState<UnplannedExpense[]>([]);
  const [assetTimeline, setAssetTimeline] = useState<AssetTimelinePoint[]>([]);
  const [incomeHistory, setIncomeHistory] = useState<MonthlyIncome[]>([]);
  const [expenseTimeline, setExpenseTimeline] = useState<ExpenseTimelinePoint[]>([]);

  // Range-dependent: server-aggregated category totals (exact date filter)
  useEffect(() => {
    api.getCategoryRangeSummary(from, to).then(setCategoryPoints).catch(() => setCategoryPoints([]));
    const days = daysBetween(from, to);
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(days - 1));
    api.getCategoryRangeSummary(prevFrom, prevTo).then(setPrevCategoryPoints).catch(() => setPrevCategoryPoints([]));
  }, [from, to]);

  // Full history, fetched once — filtered/grouped client-side per range (same "timeline" pattern as Dashboard)
  useEffect(() => {
    api.getInstruments().then(setInstruments).catch(() => {});
    api.getSavingsEntries({}).then(setSavingsEntries).catch(() => {});
    api.getEmiPayments({}).then(setEmiPayments).catch(() => {});
    api.getUnplannedExpenses({}).then(setUnplanned).catch(() => {});
    api.getAssetsTimeline().then(setAssetTimeline).catch(() => {});
    api.getIncomeHistory().then(setIncomeHistory).catch(() => {});
    api.getExpensesTimeline().then(setExpenseTimeline).catch(() => {});
  }, []);

  const fromYM = useMemo(() => dateToYM(from), [from]);
  const toYM = useMemo(() => dateToYM(to), [to]);
  const monthsTouched = useMemo(() => monthsInRange(from, to), [from, to]);
  const inMonthRange = useCallback((year: number, month: number) => {
    const ym = ymKey(year, month);
    return ym >= fromYM && ym <= toYM;
  }, [fromYM, toYM]);

  // ── Category spend ───────────────────────────────────────────────────────
  const categoryTotals = useMemo(() => {
    const map = new Map<string, { name: string; color: string; total: number; periods: Set<string> }>();
    for (const p of categoryPoints) {
      const e = map.get(p.category_name) ?? { name: p.category_name, color: p.category_color, total: 0, periods: new Set<string>() };
      e.total += Number(p.total);
      e.periods.add(p.period);
      map.set(p.category_name, e);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [categoryPoints]);

  const prevCategoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of prevCategoryPoints) map.set(p.category_name, (map.get(p.category_name) ?? 0) + Number(p.total));
    return map;
  }, [prevCategoryPoints]);

  const categoryChartData = useMemo(() => {
    const periods = [...new Set(categoryPoints.map(p => p.period))].sort();
    const top = categoryTotals.slice(0, 8);
    return periods.map(period => {
      const row: Record<string, string | number> = { period, label: periodLabel(period) };
      for (const c of top) row[c.name] = 0;
      for (const p of categoryPoints.filter(x => x.period === period)) {
        if (top.some(c => c.name === p.category_name)) row[p.category_name] = Number(p.total);
      }
      return row;
    });
  }, [categoryPoints, categoryTotals]);

  const totalCategorySpend = categoryTotals.reduce((s, c) => s + c.total, 0);

  // ── Savings — by instrument → linked asset ───────────────────────────────
  const savingsByInstrument = useMemo(() => {
    const instMap = new Map(instruments.map(i => [i.id, i]));
    const map = new Map<number, { instrument: SavingsInstrument; total: number; months: number }>();
    for (const e of savingsEntries) {
      if (!inMonthRange(e.year, e.month)) continue;
      const inst = instMap.get(e.instrument_id);
      if (!inst) continue;
      const cur = map.get(e.instrument_id) ?? { instrument: inst, total: 0, months: 0 };
      cur.total += Number(e.amount);
      cur.months += 1;
      map.set(e.instrument_id, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [savingsEntries, instruments, inMonthRange]);

  const totalSaved = savingsByInstrument.reduce((s, x) => s + x.total, 0);

  const monthlySavingsSeries: RegressionPoint[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of savingsEntries) {
      if (!inMonthRange(e.year, e.month)) continue;
      const period = `${e.year}-${String(e.month).padStart(2, '0')}`;
      map.set(period, (map.get(period) ?? 0) + Number(e.amount));
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, total], i) => ({ x: i, y: total, period }));
  }, [savingsEntries, inMonthRange]);

  // ── EMI & unplanned ──────────────────────────────────────────────────────
  const emiByLoan = useMemo(() => {
    const map = new Map<number, { loan_name: string; loan_color: string; total: number }>();
    for (const p of emiPayments) {
      if (!inMonthRange(p.year, p.month)) continue;
      const cur = map.get(p.loan_id) ?? { loan_name: p.loan_name, loan_color: p.loan_color, total: 0 };
      cur.total += Number(p.amount);
      map.set(p.loan_id, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [emiPayments, inMonthRange]);
  const totalEmi = emiByLoan.reduce((s, l) => s + l.total, 0);

  const unplannedInRange = useMemo(
    () => unplanned.filter(u => u.date >= from && u.date <= to).sort((a, b) => Number(b.amount) - Number(a.amount)),
    [unplanned, from, to],
  );
  const totalUnplanned = unplannedInRange.reduce((s, u) => s + Number(u.amount), 0);

  const expenseTimelineInRange = useMemo(
    () => expenseTimeline.filter(p => inMonthRange(p.year, p.month))
      .map(p => ({ ...p, label: periodLabel(`${p.year}-${String(p.month).padStart(2, '0')}`) })),
    [expenseTimeline, inMonthRange],
  );

  // ── Cash flow summary ────────────────────────────────────────────────────
  const totalIncome = useMemo(
    () => monthsTouched.reduce((s, m) => s + incomeForMonth(incomeHistory, m.year, m.month), 0),
    [monthsTouched, incomeHistory],
  );
  const totalOutflow = totalCategorySpend + totalEmi + totalUnplanned;
  const savingsRate = totalIncome > 0 ? (totalSaved / totalIncome) * 100 : null;

  const assetTimelineInRange = useMemo(
    () => assetTimeline.filter(p => inMonthRange(p.year, p.month)).sort((a, b) => ymKey(a.year, a.month) - ymKey(b.year, b.month)),
    [assetTimeline, inMonthRange],
  );
  const netWorthChange = assetTimelineInRange.length >= 2
    ? Number(assetTimelineInRange[assetTimelineInRange.length - 1].total) - Number(assetTimelineInRange[0].total)
    : null;

  // ── Forecast ─────────────────────────────────────────────────────────────
  const netWorthSeries: RegressionPoint[] = useMemo(
    () => assetTimelineInRange.map((p, i) => ({ x: i, y: Number(p.total), period: `${p.year}-${String(p.month).padStart(2, '0')}` })),
    [assetTimelineInRange],
  );
  const netWorthReg = netWorthSeries.length >= 3 ? linearRegression(netWorthSeries) : null;
  const savingsReg = monthlySavingsSeries.length >= 3 ? linearRegression(monthlySavingsSeries) : null;

  const netWorthForecast = useMemo(() => buildForecastData(netWorthSeries, netWorthReg, horizon), [netWorthSeries, netWorthReg, horizon]);
  const savingsForecast = useMemo(() => buildForecastData(monthlySavingsSeries, savingsReg, horizon), [monthlySavingsSeries, savingsReg, horizon]);

  const projectedNetWorth = netWorthReg ? netWorthReg.slope * (netWorthSeries[netWorthSeries.length - 1].x + horizon) + netWorthReg.intercept : null;
  const projectedMonthlySavings = savingsReg ? savingsReg.slope * (monthlySavingsSeries[monthlySavingsSeries.length - 1].x + horizon) + savingsReg.intercept : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-ink">Reports</h1>
        <button
          onClick={() => window.print()}
          className="print:hidden flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-line text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
        >
          <Download size={14} /> Export PDF
        </button>
      </div>

      <Card>
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <p className="text-xs text-ink-faint mt-3">
          Expenses are filtered to the exact dates above. Savings, EMI, asset and income data are tracked monthly — any month overlapping your range is included in full.
        </p>
      </Card>

      {/* Cash flow summary */}
      <Card>
        <h2 className="font-semibold text-ink text-sm mb-3">Cash flow — {periodLabel(`${monthsTouched[0]?.year}-${String(monthsTouched[0]?.month).padStart(2, '0')}`)} to {periodLabel(`${monthsTouched[monthsTouched.length - 1]?.year}-${String(monthsTouched[monthsTouched.length - 1]?.month).padStart(2, '0')}`)}</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xs text-ink-faint mb-1">Income</p>
            <p className="text-lg font-bold text-ink">{fmt(totalIncome)}</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xs text-ink-faint mb-1">Outflow</p>
            <p className="text-lg font-bold text-ink">{fmt(totalOutflow)}</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xs text-ink-faint mb-1">Net saved</p>
            <p className="text-lg font-bold text-emerald-400">{fmt(totalSaved)}</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xs text-ink-faint mb-1">Savings rate</p>
            <p className="text-lg font-bold text-ink">{savingsRate === null ? '—' : `${savingsRate.toFixed(1)}%`}</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xs text-ink-faint mb-1">Net worth change</p>
            <p className={`text-lg font-bold ${netWorthChange === null ? 'text-ink' : netWorthChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {netWorthChange === null ? '—' : `${netWorthChange >= 0 ? '+' : ''}${fmt(netWorthChange)}`}
            </p>
          </div>
        </div>
      </Card>

      {/* Category spend */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Receipt size={16} className="text-indigo-400" />
          <h2 className="font-semibold text-ink text-sm">Category spend</h2>
        </div>
        <p className="text-xs text-ink-faint mb-3">Top 8 categories by total spend across the selected range</p>
        {categoryChartData.length > 0 ? (
          <div className="h-64 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryChartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9b9aa3' }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9b9aa3' }} axisLine={false} tickLine={false} width={56} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v, n) => [`₹${Number(v).toLocaleString('en-IN')}`, n]} {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#9b9aa3' }} />
                {categoryTotals.slice(0, 8).map((c, i) => (
                  <Bar key={c.name} dataKey={c.name} stackId="cat" fill={c.color || CHART_COLORS[i % CHART_COLORS.length]} radius={i === Math.min(7, categoryTotals.length - 1) ? [4, 4, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-ink-faint py-8 text-center">No expenses in this range</p>
        )}

        {categoryTotals.length > 0 && (
          <div className="space-y-1.5">
            {categoryTotals.map(c => {
              const prev = prevCategoryTotals.get(c.name);
              const delta = prev !== undefined ? c.total - prev : null;
              return (
                <div key={c.name} className="flex items-center justify-between text-sm rounded-lg px-2 py-1.5 -mx-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="text-ink-muted truncate">{c.name}</span>
                    <span className="text-xs text-ink-faint shrink-0">· {totalCategorySpend > 0 ? ((c.total / totalCategorySpend) * 100).toFixed(0) : 0}% · avg {fmt(c.total / c.periods.size)}/mo</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Delta value={delta} />
                    <span className="font-medium text-ink w-28 text-right">{fmt(c.total)}</span>
                  </div>
                </div>
              );
            })}
            <div className="pt-2 border-t border-line flex justify-between font-semibold text-ink text-sm">
              <span>Total</span>
              <span>{fmt(totalCategorySpend)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* Savings by instrument → asset */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <PiggyBank size={16} className="text-emerald-400" />
          <h2 className="font-semibold text-ink text-sm">Savings — by instrument &amp; linked asset</h2>
        </div>
        <p className="text-xs text-ink-faint mb-3">How much went into each savings instrument, and which asset it builds toward</p>
        {savingsByInstrument.length > 0 ? (
          <div className="space-y-1.5">
            {savingsByInstrument.map(({ instrument, total, months }) => {
              const targetForRange = Number(instrument.monthly_target) * months;
              const achievement = targetForRange > 0 ? (total / targetForRange) * 100 : null;
              return (
                <div key={instrument.id} className="flex items-center justify-between text-sm rounded-lg px-2 py-1.5 -mx-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: instrument.color }} />
                    <span className="text-ink-muted truncate">{instrument.name}</span>
                    <span className="text-xs text-ink-faint shrink-0">
                      → {instrument.asset_name ?? 'unmapped'} · {months} mo{achievement !== null && ` · ${achievement.toFixed(0)}% of target`}
                    </span>
                  </div>
                  <span className="font-medium text-ink shrink-0">{fmt(total)}</span>
                </div>
              );
            })}
            <div className="pt-2 border-t border-line flex justify-between font-semibold text-ink text-sm">
              <span>Total saved</span>
              <span>{fmt(totalSaved)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-faint py-8 text-center">No savings entries in this range</p>
        )}
      </Card>

      {/* EMI & unplanned */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Wallet size={16} className="text-rose-400" />
          <h2 className="font-semibold text-ink text-sm">EMI &amp; unplanned expenses</h2>
        </div>
        <p className="text-xs text-ink-faint mb-3">Planned vs. EMI vs. unplanned outflow per month</p>
        {expenseTimelineInRange.length > 0 && (
          <div className="h-48 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={expenseTimelineInRange} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9b9aa3' }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9b9aa3' }} axisLine={false} tickLine={false} width={56} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v, n) => [`₹${Number(v).toLocaleString('en-IN')}`, n]} {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#9b9aa3' }} />
                <Area type="monotone" dataKey="planned" stackId="exp" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
                <Area type="monotone" dataKey="emi" stackId="exp" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.35} />
                <Area type="monotone" dataKey="unplanned" stackId="exp" stroke="#f97316" fill="#f97316" fillOpacity={0.35} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">EMI by loan — {fmt(totalEmi)}</h3>
            {emiByLoan.length > 0 ? (
              <div className="space-y-1.5">
                {emiByLoan.map(l => (
                  <div key={l.loan_name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.loan_color }} />
                      <span className="text-ink-muted truncate">{l.loan_name}</span>
                      <span className="text-xs text-ink-faint shrink-0">· {totalEmi > 0 ? ((l.total / totalEmi) * 100).toFixed(0) : 0}%</span>
                    </div>
                    <span className="font-medium text-ink shrink-0">{fmt(l.total)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-ink-faint">No EMI payments in this range</p>}
          </div>
          <div>
            <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">Largest unplanned — {fmt(totalUnplanned)} across {unplannedInRange.length}</h3>
            {unplannedInRange.length > 0 ? (
              <div className="space-y-1.5">
                {unplannedInRange.slice(0, 5).map(u => (
                  <div key={u.id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <span className="text-ink-muted truncate block">{u.description || 'Unplanned expense'}</span>
                      <span className="text-xs text-ink-faint">{u.date}</span>
                    </div>
                    <span className="font-medium text-ink shrink-0">{fmt(Number(u.amount))}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-ink-faint">No unplanned expenses in this range</p>}
          </div>
        </div>
      </Card>

      {/* Forecast */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <div className="flex items-center gap-2">
            <Landmark size={16} className="text-purple-400" />
            <h2 className="font-semibold text-ink text-sm">Forecast</h2>
          </div>
          <div className="flex gap-1.5 print:hidden">
            {HORIZONS.map(h => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${horizon === h ? 'bg-accent text-white border-accent' : 'border-line text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
              >
                {h}mo
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-ink-faint mb-4">
          Linear trend projected from your selected period — illustrative only, not financial advice.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Net worth</h3>
              {projectedNetWorth !== null && (
                <span className="text-sm text-ink">in {horizon}mo: <span className="font-semibold">{fmt(projectedNetWorth)}</span></span>
              )}
            </div>
            {netWorthReg ? (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={netWorthForecast} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9b9aa3' }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9b9aa3' }} axisLine={false} tickLine={false} width={56} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => v == null ? ['—'] : [`₹${Number(v).toLocaleString('en-IN')}`]} {...TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="actual" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                    <Line type="monotone" dataKey="projected" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-ink-faint py-10 text-center">Not enough historical data to forecast yet — needs at least 3 months of asset snapshots in this range</p>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Monthly savings</h3>
              {projectedMonthlySavings !== null && (
                <span className="text-sm text-ink">in {horizon}mo: <span className="font-semibold">{fmt(Math.max(0, projectedMonthlySavings))}/mo</span></span>
              )}
            </div>
            {savingsReg ? (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={savingsForecast} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9b9aa3' }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9b9aa3' }} axisLine={false} tickLine={false} width={56} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => v == null ? ['—'] : [`₹${Number(v).toLocaleString('en-IN')}`]} {...TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                    <Line type="monotone" dataKey="projected" stroke="#10b981" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-ink-faint py-10 text-center">Not enough historical data to forecast yet — needs at least 3 months of savings entries in this range</p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
