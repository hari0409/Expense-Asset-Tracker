import { useEffect, useState, useCallback, useRef, type CSSProperties } from 'react';
import { api } from '../api';
import type { Category, RentOutPerson, SavingsSummary, AssetSummary, MonthlyIncome, EmiPayment, SavingsEntry, UnplannedExpense, ExpenseTimelinePoint } from '../api';
import { Link, useNavigate } from 'react-router-dom';
import {
  Receipt, HandCoins, PiggyBank, Landmark, AlertCircle,
  Eye, EyeOff, CreditCard, Wallet, Zap, TrendingUp, TrendingDown, Minus, RotateCcw,
} from 'lucide-react';
import {
  ReactFlow, Handle, Position, useNodesState, useEdgesState, Panel,
  type Node, type Edge, type NodeProps, type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const now = new Date();
const CUR_MONTH = now.getMonth() + 1;
const CUR_YEAR = now.getFullYear();

const EXPENSE_COMPONENTS: { key: 'planned' | 'emi' | 'unplanned'; label: string; color: string; path: string }[] = [
  { key: 'planned', label: 'Planned', color: '#6366f1', path: '/expenses' },
  { key: 'emi', label: 'EMI', color: '#f43f5e', path: '/loans' },
  { key: 'unplanned', label: 'Unplanned', color: '#f97316', path: '/expenses' },
];

function fmt(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

// ── Money Flow React Flow nodes ────────────────────────────────────────────

type FlowNodeData = {
  label: string;
  amount: number;
  color: string;
  pct?: number;
  isSource?: boolean;
};

function IncomeNode({ data }: NodeProps) {
  const d = data as FlowNodeData;
  return (
    <div className="rounded-2xl border-2 px-4 py-2.5 bg-surface shadow-sm min-w-[130px] text-center cursor-grab active:cursor-grabbing" style={{ borderColor: d.color }}>
      <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">{d.label}</p>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

function BucketNode({ data }: NodeProps) {
  const d = data as FlowNodeData;
  return (
    <div className="rounded-2xl border border-line px-3 py-2 bg-surface shadow-sm min-w-[120px] cursor-grab active:cursor-grabbing" style={{ borderColor: d.color + '66' }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
        <p className="text-xs font-medium text-ink-muted">{d.label}</p>
      </div>
      <p className="text-sm font-bold mt-0.5 ml-[16px]" style={{ color: d.color }}>{fmt(d.amount)}</p>
      {d.pct != null && <p className="text-[10px] text-ink-faint ml-[16px]">{d.pct.toFixed(1)}%</p>}
    </div>
  );
}

const NODE_TYPES = { income: IncomeNode, bucket: BucketNode };

interface MoneyFlowProps {
  income: number;
  expenses: number;
  emi: number;
  unplanned: number;
  savings: number;
}

function MoneyFlow({ income, expenses, emi, unplanned, savings }: MoneyFlowProps) {
  const remaining = Math.max(0, income - expenses - emi - unplanned - savings);

  const buckets = [
    { id: 'expenses', label: 'Expenses', amount: expenses, color: '#6366f1' },
    { id: 'emi', label: 'EMI', amount: emi, color: '#f43f5e' },
    { id: 'unplanned', label: 'Unplanned', amount: unplanned, color: '#f97316' },
    { id: 'savings', label: 'Savings', amount: savings, color: '#10b981' },
    { id: 'remaining', label: 'Remaining', amount: remaining, color: '#22c55e' },
  ].filter(b => b.amount > 0);

  const COL_W = 165;
  const ROW_GAP = 150;
  const incomeX = ((buckets.length - 1) * COL_W) / 2;

  const nodes: Node[] = [
    {
      id: 'income',
      type: 'income',
      position: { x: incomeX, y: 0 },
      data: { label: 'Income', amount: income, color: '#6366f1', isSource: true } as FlowNodeData,
      draggable: true,
      selectable: true,
    },
    ...buckets.map((b, i) => ({
      id: b.id,
      type: 'bucket',
      position: { x: i * COL_W, y: ROW_GAP },
      data: { label: b.label, amount: b.amount, color: b.color, pct: income > 0 ? (b.amount / income) * 100 : 0 } as FlowNodeData,
      draggable: true,
      selectable: true,
    })),
  ];

  const edges: Edge[] = buckets.map(b => ({
    id: `e-${b.id}`,
    source: 'income',
    target: b.id,
    animated: true,
    style: { stroke: b.color, strokeWidth: Math.max(1.5, Math.min(6, income > 0 ? (b.amount / income) * 12 : 1.5)) },
  }));

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(nodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(edges);
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  useEffect(() => {
    setFlowNodes(nodes);
    setFlowEdges(edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [income, expenses, emi, unplanned, savings]);

  const resetLayout = () => {
    setFlowNodes(nodes);
    setFlowEdges(edges);
    rfInstance.current?.fitView({ padding: 0.15 });
  };

  const height = Math.max(300, ROW_GAP + 160);

  if (income <= 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-ink-faint">
        <Wallet size={28} className="mb-2" />
        <p className="text-sm">Set salary to see money flow</p>
      </div>
    );
  }

  return (
    <div style={{ height }} className="w-full">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={instance => { rfInstance.current = instance; }}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        preventScrolling
        proOptions={{ hideAttribution: true }}
        style={{ background: 'transparent', '--xy-background-color': 'transparent', '--xy-edge-stroke-default': 'rgba(255,255,255,0.25)', '--xy-controls-button-background-color': '#1d1d23', '--xy-controls-button-color': '#9b9aa3', '--xy-controls-button-border-color': 'rgba(255,255,255,0.08)' } as CSSProperties}
      >
        <Panel position="top-right">
          <button
            onClick={resetLayout}
            title="Reset layout"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-surface border border-line text-ink-muted rounded-lg hover:bg-surface-2 transition-colors"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [cats, setCats] = useState<Category[]>([]);
  const [persons, setPersons] = useState<RentOutPerson[]>([]);
  const [savings, setSavings] = useState<SavingsSummary[]>([]);
  const [savingsEntries, setSavingsEntries] = useState<SavingsEntry[]>([]);
  const [assets, setAssets] = useState<AssetSummary | null>(null);
  const [income, setIncome] = useState<MonthlyIncome | null>(null);
  const [emiPayments, setEmiPayments] = useState<EmiPayment[]>([]);
  const [unplanned, setUnplanned] = useState<UnplannedExpense[]>([]);
  const [showWealth, setShowWealth] = useState(false);
  const [expenseTimeline, setExpenseTimeline] = useState<ExpenseTimelinePoint[]>([]);
  const [selectedExpenseMonth, setSelectedExpenseMonth] = useState<{ year: number; month: number } | null>(null);

  const selectExpenseMonth = (year: number, month: number) => {
    setSelectedExpenseMonth(sel => (sel?.year === year && sel?.month === month) ? null : { year, month });
  };

  const load = useCallback(() => {
    api.getCategories(CUR_MONTH, CUR_YEAR).then(setCats).catch(() => {});
    api.getRentOutPersons().then(setPersons).catch(() => {});
    api.getSavingsSummary().then(setSavings).catch(() => {});
    api.getSavingsEntries({ month: CUR_MONTH, year: CUR_YEAR }).then(setSavingsEntries).catch(() => {});
    api.getAssetsSummary().then(setAssets).catch(() => {});
    api.getIncome(CUR_MONTH, CUR_YEAR).then(setIncome).catch(() => {});
    api.getEmiPayments({ month: CUR_MONTH, year: CUR_YEAR }).then(setEmiPayments).catch(() => {});
    api.getUnplannedExpenses({ month: CUR_MONTH, year: CUR_YEAR }).then(setUnplanned).catch(() => {});
    api.getExpensesTimeline().then(setExpenseTimeline).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalSpent = cats.reduce((s, c) => s + Number(c.spent), 0);
  const totalEmi = emiPayments.reduce((s, p) => s + Number(p.amount), 0);
  const totalUnplanned = unplanned.reduce((s, u) => s + Number(u.amount), 0);
  const totalOutflow = totalSpent + totalEmi + totalUnplanned;

  const pendingRent = persons.reduce((s, p) => s + Number(p.outstanding), 0);
  const pendingPersonCount = persons.filter(p => Number(p.outstanding) > 0).length;
  const monthlySavings = savingsEntries.reduce((s, e) => s + Number(e.amount), 0);
  const savingsTarget = savings.reduce((s, x) => s + Number(x.monthly_target), 0);
  const overBudgetCats = cats.filter(c => Number(c.spent) > Number(c.budget) && Number(c.budget) > 0);
  const incomeAmount = income ? Number(income.amount) : 0;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-ink">Dashboard</h1>

      {overBudgetCats.length > 0 && (
        <div className="bg-red-500/10 dark:bg-red-900/20 border border-red-500/20 dark:border-red-700 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300 dark:text-red-300">Over budget</p>
            <p className="text-sm text-red-400 dark:text-red-400">{overBudgetCats.map(c => c.name).join(', ')}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Total outflow + Rent outs */}
        <div className="space-y-4">
          <h2 className="font-semibold text-ink-muted">Expenses</h2>

          {/* Total outflow */}
          <div className="bg-surface-2 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-ink-faint uppercase tracking-wider font-medium">Total outflow</p>
                <p className="text-2xl font-bold text-ink mt-0.5">{fmt(totalOutflow)}</p>
              </div>
              {incomeAmount > 0 && (
                <div className="text-right">
                  <p className={`text-lg font-bold ${totalOutflow > incomeAmount ? 'text-red-400' : 'text-emerald-400'}`}>
                    {((totalOutflow / incomeAmount) * 100).toFixed(0)}%
                  </p>
                  <p className="text-xs text-ink-faint">of income</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-line">
              <Link to="/expenses" className="rounded-lg p-2.5 border border-transparent hover:border-line hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-1.5 text-ink-faint mb-1">
                  <Receipt size={14} className="text-indigo-400 shrink-0" />
                  <span className="text-xs">Expenses</span>
                </div>
                <p className="text-sm font-semibold text-ink">{fmt(totalSpent)}</p>
              </Link>
              <Link to="/expenses" className="rounded-lg p-2.5 border border-transparent hover:border-line hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-1.5 text-ink-faint mb-1">
                  <Zap size={14} className="text-orange-400 shrink-0" />
                  <span className="text-xs">Unplanned</span>
                </div>
                <p className="text-sm font-semibold text-ink">{fmt(totalUnplanned)}</p>
              </Link>
              <Link to="/loans" className="rounded-lg p-2.5 border border-transparent hover:border-line hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-1.5 text-ink-faint mb-1">
                  <CreditCard size={14} className="text-rose-400 shrink-0" />
                  <span className="text-xs">EMI</span>
                </div>
                <p className="text-sm font-semibold text-ink">{fmt(totalEmi)}</p>
              </Link>
            </div>
          </div>

          {/* Rent outs */}
          <Link to="/rent-outs" className="bg-surface rounded-2xl border border-line p-4 hover:border-line-strong transition-colors flex items-center gap-4">
            <div className="w-9 h-9 bg-amber-500/10 dark:bg-amber-900/30 rounded-lg flex items-center justify-center shrink-0">
              <HandCoins size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-ink-muted mb-0.5">Pending rent-outs</p>
              <p className="text-xl font-bold text-ink">{fmt(pendingRent)}</p>
            </div>
            <p className="ml-auto text-xs text-ink-muted">{pendingPersonCount} person(s)</p>
          </Link>

          {/* Expense history */}
          {expenseTimeline.length > 0 && (
            <div className="bg-surface rounded-2xl border border-line p-4">
              <h2 className="font-semibold text-ink text-sm mb-1">Expense history</h2>
              <p className="text-xs text-ink-faint mb-3">Planned + EMI + Unplanned — click a point to break down</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={expenseTimeline.map(p => ({ ...p, label: `${new Date(p.year, p.month - 1).toLocaleString('default', { month: 'short' })} ${p.year}`, total: Number(p.total) }))}
                    margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9b9aa3' }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9b9aa3' }} axisLine={false} tickLine={false} width={56} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Total']}
                      contentStyle={{ background: '#141418', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: '#f3f1ec' }}
                      labelStyle={{ color: '#9b9aa3' }}
                      itemStyle={{ color: '#f3f1ec' }}
                      cursor={{ stroke: 'rgba(255,255,255,0.12)' }}
                    />
                    <Area
                      type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2}
                      fill="url(#expGrad)"
                      dot={(props: { cx?: number; cy?: number; payload?: ExpenseTimelinePoint }) => {
                        const p = props.payload!;
                        const sel = selectedExpenseMonth?.year === p.year && selectedExpenseMonth?.month === p.month;
                        return <circle key={`${p.year}-${p.month}`} cx={props.cx} cy={props.cy} r={sel ? 6 : 4} fill={sel ? '#6366f1' : '#0a0a0c'} stroke="#6366f1" strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => selectExpenseMonth(p.year, p.month)} />;
                      }}
                      activeDot={(props: { cx?: number; cy?: number; payload?: ExpenseTimelinePoint }) => {
                        const p = props.payload;
                        return <circle cx={props.cx} cy={props.cy} r={6} fill="#6366f1" stroke="#0a0a0c" strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => { if (p) selectExpenseMonth(p.year, p.month); }} />;
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {selectedExpenseMonth && (() => {
                const idx = expenseTimeline.findIndex(p => p.year === selectedExpenseMonth.year && p.month === selectedExpenseMonth.month);
                if (idx === -1) return null;
                const point = expenseTimeline[idx];
                const prev = idx > 0 ? expenseTimeline[idx - 1] : null;
                return (
                  <div className="mt-4 pt-4 border-t border-line">
                    <h3 className="text-sm font-semibold text-ink-muted mb-3">
                      {new Date(point.year, point.month - 1).toLocaleString('default', { month: 'long' })} {point.year} breakdown
                    </h3>
                    <div className="space-y-2">
                      {EXPENSE_COMPONENTS.map(c => {
                        const value = Number(point[c.key]);
                        const prevValue = prev ? Number(prev[c.key]) : null;
                        const delta = prevValue != null ? value - prevValue : null;
                        return (
                          <button
                            key={c.key}
                            onClick={() => navigate(`${c.path}?month=${point.month}&year=${point.year}`)}
                            className="w-full flex items-center justify-between text-sm rounded-lg px-2 py-1.5 -mx-2 hover:bg-surface-2 transition-colors text-left"
                            title={`View ${c.label.toLowerCase()} for ${new Date(point.year, point.month - 1).toLocaleString('default', { month: 'long' })} ${point.year}`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                              <span className="text-ink-muted">{c.label}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              {delta !== null && (
                                <span className={`flex items-center gap-0.5 text-xs font-medium ${delta > 0 ? 'text-red-500' : delta < 0 ? 'text-emerald-400' : 'text-ink-faint'}`}>
                                  {delta > 0 ? <TrendingUp size={11} /> : delta < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                                  {delta > 0 ? '+' : ''}{fmt(Math.abs(delta))}
                                </span>
                              )}
                              <span className="font-medium text-ink w-28 text-right">{fmt(value)}</span>
                            </div>
                          </button>
                        );
                      })}
                      <div className="pt-2 border-t border-line flex justify-between font-semibold text-ink text-sm">
                        <span>Total</span>
                        <span>{fmt(Number(point.total))}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Right: Savings & Assets + Money Flow */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink-muted">Savings &amp; Assets</h2>
            <button
              onClick={() => setShowWealth(v => !v)}
              className="text-ink-muted hover:text-ink transition-colors p-1"
              title={showWealth ? 'Hide' : 'Show'}
            >
              {showWealth ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {showWealth ? (
            <div className="grid grid-cols-2 gap-4">
              <Link to="/savings" className="bg-surface rounded-2xl border border-line p-4 hover:border-line-strong transition-colors block">
                <div className="w-9 h-9 bg-emerald-500/10 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-3">
                  <PiggyBank size={20} className="text-emerald-400" />
                </div>
                <p className="text-xs text-ink-muted mb-1">Monthly savings</p>
                <p className="text-xl font-bold text-ink">{fmt(monthlySavings)} / {fmt(savingsTarget)}</p>
                <p className="text-xs text-ink-muted mt-0.5">{savings.length} instrument(s)</p>
              </Link>
              <Link to="/assets" className="bg-surface rounded-2xl border border-line p-4 hover:border-line-strong transition-colors block">
                <div className="w-9 h-9 bg-purple-500/10 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-3">
                  <Landmark size={20} className="text-purple-400" />
                </div>
                <p className="text-xs text-ink-muted mb-1">Net assets</p>
                <p className="text-xl font-bold text-ink">{fmt(Number(assets?.total ?? 0))}</p>
                <p className="text-xs text-ink-muted mt-0.5">{assets?.byType.length ?? 0} type(s)</p>
              </Link>
            </div>
          ) : (
            <div className="bg-surface rounded-2xl border border-line border-dashed p-10 flex flex-col items-center justify-center text-ink-faint">
              <Eye size={28} className="mb-2" />
              <p className="text-sm">Click eye to reveal</p>
            </div>
          )}

          {/* Money flow */}
          <div className="bg-surface rounded-2xl border border-line p-4">
            <h2 className="font-semibold text-ink text-sm mb-3">Money Flow — {now.toLocaleString('default', { month: 'long' })}</h2>
            <MoneyFlow
              income={incomeAmount}
              expenses={totalSpent}
              emi={totalEmi}
              unplanned={totalUnplanned}
              savings={monthlySavings}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
