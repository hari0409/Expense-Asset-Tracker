import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { Category, Expense, UnplannedExpense } from '../api';
import MonthPicker from '../components/MonthPicker';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { Plus, Trash2, Pencil, Copy, ChevronDown, ChevronUp, TableProperties, X, LayoutGrid, Table2, GripVertical, MoreHorizontal, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const now = new Date();

function evalFormula(raw: string): { value: number; preview: string } | null {
  const expr = raw.startsWith('=') ? raw.slice(1) : raw;
  if (!expr.trim()) return null;
  if (!/^[\d\s+\-*/().,]+$/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr.replace(/,/g, '')})`)() as number;
    if (typeof result !== 'number' || !isFinite(result) || result < 0) return null;
    return { value: Math.round(result * 100) / 100, preview: `= ₹${result.toLocaleString('en-IN')}` };
  } catch { return null; }
}

function AmountInput({
  value, onChange, placeholder, className,
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const isFormula = value.startsWith('=');
  const evaluated = isFormula ? evalFormula(value) : null;
  const invalid = isFormula && !evaluated;

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '0 or =50+30'}
        className={`${className} ${invalid ? 'border-red-400 ring-red-500/25' : ''}`}
      />
      {isFormula && evaluated && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-emerald-400 font-medium pointer-events-none">
          {evaluated.preview}
        </span>
      )}
      {invalid && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-red-500 pointer-events-none">invalid</span>
      )}
    </div>
  );
}

function resolveAmount(raw: string): number | null {
  if (!raw.trim()) return null;
  if (raw.startsWith('=')) {
    const r = evalFormula(raw);
    return r?.value ?? null;
  }
  const n = Number(raw.replace(/,/g, ''));
  return isFinite(n) && n >= 0 ? n : null;
}

function formulaOf(raw: string): string | null {
  const t = raw.trim();
  return t.startsWith('=') ? t : null;
}

function amountInputValue(expense: Expense): string {
  return expense.formula ?? String(expense.amount);
}

export default function Expenses() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [month, setMonth] = useState(() => Number(searchParams.get('month')) || now.getMonth() + 1);
  const [year, setYear] = useState(() => Number(searchParams.get('year')) || now.getFullYear());

  // Deep link from Dashboard breakdown: "?month=&year=" jumps straight to that month.
  useEffect(() => {
    const m = Number(searchParams.get('month'));
    const y = Number(searchParams.get('year'));
    if (m && y && (m !== month || y !== year)) { setMonth(m); setYear(y); }
    if (m || y) {
      const next = new URLSearchParams(searchParams);
      next.delete('month'); next.delete('year');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [cats, setCats] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expandedCat, setExpandedCat] = useState<number | null>(null);
  const [showCatModal, setShowCatModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showExpModal, setShowExpModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editingExp, setEditingExp] = useState<Expense | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'grid'>('grid');
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [unplanned, setUnplanned] = useState<UnplannedExpense[]>([]);
  const [showAddUnplanned, setShowAddUnplanned] = useState(false);
  const [plannedOpen, setPlannedOpen] = useState(true);
  const [unplannedOpen, setUnplannedOpen] = useState(false);
  const [unplannedToDelete, setUnplannedToDelete] = useState<UnplannedExpense | null>(null);
  const [catToDelete, setCatToDelete] = useState<Category | null>(null);
  const [expToDelete, setExpToDelete] = useState<Expense | null>(null);
  const [showResetCategoriesConfirm, setShowResetCategoriesConfirm] = useState(false);
  const [showClearExpensesConfirm, setShowClearExpensesConfirm] = useState(false);

  const load = () => {
    api.getCategories(month, year).then(setCats);
    api.getExpenses({ month, year }).then(setExpenses);
    api.getUnplannedExpenses({ month, year }).then(setUnplanned);
  };

  const deleteUnplanned = async (id: number) => {
    await api.deleteUnplannedExpense(id);
    load();
  };

  useEffect(() => { load(); }, [month, year]);

  const handleCopyPrevMonth = async () => {
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    await api.copyCategories(pm, py, month, year);
    load();
  };

  const expensesForCat = (catId: number) => expenses.filter(e => Number(e.category_id) === catId);

  const handleDrop = async (targetId: number) => {
    if (dragId === null || dragId === targetId) return;
    const ids = [...cats];
    const from = ids.findIndex(c => Number(c.id) === dragId);
    const to = ids.findIndex(c => Number(c.id) === targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setCats(ids);
    setDragId(null); setDragOverId(null);
    await api.reorderCategories(ids.map(c => Number(c.id)));
  };

  const totalBudget = cats.reduce((s, c) => s + Number(c.budget), 0);
  const totalSpent = cats.reduce((s, c) => s + Number(c.spent), 0);
  const totalUnplanned = unplanned.reduce((s, u) => s + Number(u.amount), 0);
  const totalExpense = totalSpent + totalUnplanned;
  const overallPct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;
  const overBudget = totalBudget > 0 && totalSpent > totalBudget;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-ink">Expenses</h1>
        <div className="flex items-center gap-2">
          <MonthPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <button
            onClick={handleCopyPrevMonth}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-surface-2 text-ink rounded-lg hover:bg-surface-2 transition-colors"
          >
            <Copy size={14} /> Copy prev month
          </button>
          {viewMode === 'cards' && (
            <button
              onClick={() => setShowBatchModal(true)}
              disabled={cats.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <TableProperties size={14} /> Add expenses
            </button>
          )}
          <OverflowMenu
            viewMode={viewMode}
            onSetViewMode={setViewMode}
            onAddCategory={() => { setEditingCat(null); setShowCatModal(true); }}
            onResetCategories={() => setShowResetCategoriesConfirm(true)}
            onClearExpenses={() => { if (totalSpent > 0) setShowClearExpensesConfirm(true); }}
            hasExpenses={totalSpent > 0}
          />
        </div>
      </div>

      {/* Total expense — planned + unplanned */}
      <div className="bg-surface rounded-2xl border border-line p-4">
        <p className="text-xs text-ink-muted mb-0.5">Total expense this month</p>
        <p className="text-2xl font-bold text-ink">₹{totalExpense.toLocaleString('en-IN')}</p>
        <p className="text-xs text-ink-faint mt-1">Planned ₹{totalSpent.toLocaleString('en-IN')} + Unplanned ₹{totalUnplanned.toLocaleString('en-IN')}</p>
      </div>

      {/* Planned (foldable) */}
      <div className="bg-surface rounded-2xl border border-line overflow-hidden">
        <button
          onClick={() => setPlannedOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
        >
          <span className="font-semibold text-ink">Planned</span>
          {plannedOpen ? <ChevronUp size={18} className="text-ink-faint" /> : <ChevronDown size={18} className="text-ink-faint" />}
        </button>

        {plannedOpen && (
          <div className="border-t border-line">
            {cats.length > 0 && (
              <div className="p-4">
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="px-3 py-1.5 rounded-lg bg-surface-2 border border-line">
                      <p className="text-[11px] uppercase tracking-wide text-ink-faint">Budget</p>
                      <p className="text-sm font-bold text-ink">₹{totalBudget.toLocaleString('en-IN')}</p>
                    </div>
                    <div className={`px-3 py-1.5 rounded-lg border ${overBudget ? 'bg-red-500/10 border-red-500/20' : 'bg-indigo-500/10 border-indigo-500/20'}`}>
                      <p className={`text-[11px] uppercase tracking-wide ${overBudget ? 'text-red-400' : 'text-indigo-400'}`}>Spent</p>
                      <p className={`text-sm font-bold ${overBudget ? 'text-red-400' : 'text-indigo-400'}`}>₹{totalSpent.toLocaleString('en-IN')}</p>
                    </div>
                    <div className={`px-3 py-1.5 rounded-lg border ${overBudget ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                      <p className={`text-[11px] uppercase tracking-wide ${overBudget ? 'text-red-400' : 'text-emerald-500'}`}>{overBudget ? 'Over by' : 'Remaining'}</p>
                      <p className={`text-sm font-bold ${overBudget ? 'text-red-400' : 'text-emerald-400'}`}>₹{Math.abs(totalBudget - totalSpent).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${overBudget ? 'bg-red-500/15 text-red-400' : overallPct >= 80 ? 'bg-amber-500/15 text-amber-400' : 'bg-surface-2 text-ink-muted'}`}>{overallPct.toFixed(0)}%</span>
                </div>
                <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : overallPct >= 80 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                    style={{ width: `${Math.min(overallPct, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {cats.length === 0 && (
              <div className="text-center py-16 text-ink-faint">
                <p className="text-lg mb-2">No categories for this month</p>
                <p className="text-sm">Add a category or copy from previous month</p>
              </div>
            )}

            {/* Grid view, embedded */}
            {viewMode === 'grid' && cats.length > 0 && (
              <ExpenseGrid
                cats={cats}
                expenses={expenses}
                month={month}
                year={year}
                onReload={load}
                onEditCat={cat => { setEditingCat(cat); setShowCatModal(true); }}
                dragId={dragId}
                dragOverId={dragOverId}
                onDragStart={id => setDragId(id)}
                onDragOver={id => setDragOverId(id)}
                onDragLeave={() => setDragOverId(null)}
                onDrop={handleDrop}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
              />
            )}

            {/* Card rows */}
            {viewMode === 'cards' && cats.length > 0 && <div className="px-4 pb-4 space-y-3">
              {cats.map(cat => {
                const spent = Number(cat.spent);
                const budget = Number(cat.budget);
                const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
                const isOver = budget > 0 && spent > budget;
                const catExpenses = expensesForCat(Number(cat.id));
                const expanded = expandedCat === Number(cat.id);

                return (
                  <div
                    key={Number(cat.id)}
                    className={`bg-surface rounded-2xl border overflow-hidden transition-all ${
                      dragOverId === Number(cat.id) && dragId !== Number(cat.id)
                        ? 'border-indigo-400 shadow-md'
                        : 'border-line'
                    } ${dragId === Number(cat.id) ? 'opacity-50' : ''}`}
                    draggable
                    onDragStart={() => setDragId(Number(cat.id))}
                    onDragOver={e => { e.preventDefault(); setDragOverId(Number(cat.id)); }}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={() => handleDrop(Number(cat.id))}
                    onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                  >
                    <div
                      className="flex items-center gap-4 p-4 cursor-pointer hover:bg-surface-2 transition-colors"
                      onClick={() => setExpandedCat(expanded ? null : Number(cat.id))}
                    >
                      <div className="text-ink-faint hover:text-ink-muted cursor-grab active:cursor-grabbing shrink-0" onClick={e => e.stopPropagation()}>
                        <GripVertical size={16} />
                      </div>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-medium text-ink">{cat.name}</span>
                          <div className="flex items-center gap-3 text-sm">
                            <span className={isOver ? 'text-red-400 font-semibold' : 'text-ink-muted'}>
                              ₹{spent.toLocaleString('en-IN')}
                            </span>
                            <span className="text-ink-faint">/</span>
                            <span className="text-ink-muted">₹{budget.toLocaleString('en-IN')}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isOver ? 'bg-red-500/15 text-red-400' : 'bg-surface-2 text-ink-muted'}`}>
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: isOver ? '#ef4444' : cat.color }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditingCat(cat); setShowCatModal(true); }}
                          className="p-1.5 text-ink-muted hover:bg-surface-2 rounded-lg transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setCatToDelete(cat)}
                          className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                        {expanded ? <ChevronUp size={16} className="text-ink-faint" /> : <ChevronDown size={16} className="text-ink-faint" />}
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-line p-4 space-y-4">
                        {catExpenses.length > 0 && (
                          <DailyChart expenses={catExpenses} color={cat.color} />
                        )}
                        <div className="space-y-1">
                          {catExpenses.length === 0 && (
                            <p className="text-sm text-ink-faint text-center py-4">No expenses yet</p>
                          )}
                          {catExpenses.map(exp => (
                            <div key={Number(exp.id)} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-2 group">
                              <div>
                                <span className="text-sm text-ink">{exp.description || '—'}</span>
                                <span className="text-xs text-ink-faint ml-2">{exp.date}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-ink">₹{Number(exp.amount).toLocaleString('en-IN')}</span>
                                <button
                                  onClick={() => { setEditingExp(exp); setShowExpModal(true); }}
                                  className="p-1 text-ink-faint hover:text-ink opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => setExpToDelete(exp)}
                                  className="p-1 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>}
          </div>
        )}
      </div>

      {/* Unplanned / sudden expenses (foldable) */}
      <div className="bg-surface rounded-2xl border border-line overflow-hidden">
        <button
          onClick={() => setUnplannedOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">Unplanned</span>
            <span className="text-sm text-ink-muted">₹{totalUnplanned.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); setShowAddUnplanned(true); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setShowAddUnplanned(true); } }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            >
              <Plus size={14} /> Add
            </span>
            {unplannedOpen ? <ChevronUp size={18} className="text-ink-faint" /> : <ChevronDown size={18} className="text-ink-faint" />}
          </div>
        </button>

        {unplannedOpen && (
          <div className="border-t border-line p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-orange-500/10 rounded-lg flex items-center justify-center shrink-0">
                <Zap size={20} className="text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-ink-muted mb-0.5">Unplanned this month</p>
                <p className="text-xl font-bold text-ink">₹{totalUnplanned.toLocaleString('en-IN')}</p>
              </div>
            </div>
            {unplanned.length === 0 && (
              <p className="text-sm text-ink-faint text-center py-4">No unplanned expenses yet</p>
            )}
            {unplanned.length > 0 && <div className="space-y-1.5">
            {unplanned.map(u => (
              <div key={Number(u.id)} className="flex items-center justify-between text-sm pt-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-ink-muted truncate">{u.description || 'Sudden expense'}</span>
                  <span className="text-xs text-ink-faint shrink-0">{new Date(u.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  {u.source_asset_id ? (
                    <button
                      onClick={() => navigate(`/assets?openEntries=${u.source_asset_id}`)}
                      title={`Open the withdrawal record on ${u.source_asset_name ?? 'asset'}`}
                      className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/10 text-amber-400 shrink-0 hover:bg-amber-500/15 transition-colors"
                    >
                      from withdrawal · {u.source_asset_name ?? 'asset'}
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-medium text-ink">₹{Number(u.amount).toLocaleString('en-IN')}</span>
                  {u.source_asset_id ? (
                    <span title="Edit/delete from the asset's manual entries instead" className="text-ink-muted">
                      <Trash2 size={14} />
                    </span>
                  ) : (
                    <button onClick={() => setUnplannedToDelete(u)} className="text-ink-faint hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            </div>}
          </div>
        )}
      </div>

      {showCatModal && (
        <CategoryModal
          initial={editingCat}
          month={month}
          year={year}
          onClose={() => setShowCatModal(false)}
          onSave={load}
        />
      )}
      {showBatchModal && (
        <BatchExpenseModal
          categories={cats}
          onClose={() => setShowBatchModal(false)}
          onSave={load}
        />
      )}
      {showExpModal && editingExp && (
        <EditExpenseModal
          expense={editingExp}
          categories={cats}
          onClose={() => setShowExpModal(false)}
          onSave={load}
        />
      )}
      {showAddUnplanned && (
        <AddUnplannedExpenseModal onClose={() => setShowAddUnplanned(false)} onSaved={load} />
      )}
      {catToDelete && (
        <ConfirmModal
          title="Delete Category"
          message={`Are you sure you want to delete "${catToDelete.name}"? This will also remove its expenses.`}
          confirmText="Delete"
          onConfirm={async () => { await api.deleteCategory(Number(catToDelete.id)); setCatToDelete(null); load(); }}
          onCancel={() => setCatToDelete(null)}
        />
      )}
      {expToDelete && (
        <ConfirmModal
          title="Delete Expense"
          message={`Are you sure you want to delete the ₹${Number(expToDelete.amount).toLocaleString('en-IN')} expense${expToDelete.description ? ` "${expToDelete.description}"` : ''}?`}
          confirmText="Delete"
          onConfirm={async () => { await api.deleteExpense(Number(expToDelete.id)); setExpToDelete(null); load(); }}
          onCancel={() => setExpToDelete(null)}
        />
      )}
      {unplannedToDelete && (
        <ConfirmModal
          title="Delete Unplanned Expense"
          message={`Are you sure you want to delete the ₹${Number(unplannedToDelete.amount).toLocaleString('en-IN')} unplanned expense${unplannedToDelete.description ? ` "${unplannedToDelete.description}"` : ''}?`}
          confirmText="Delete"
          onConfirm={async () => { await deleteUnplanned(Number(unplannedToDelete.id)); setUnplannedToDelete(null); }}
          onCancel={() => setUnplannedToDelete(null)}
        />
      )}
      {showResetCategoriesConfirm && (
        <ConfirmModal
          title="Delete All Categories"
          message={`Are you sure you want to delete ALL categories (and their expenses) for ${MONTHS_SHORT[month - 1]} ${year}?`}
          confirmText="Delete all"
          onConfirm={async () => { await api.deleteMonthCategories(month, year); setShowResetCategoriesConfirm(false); load(); }}
          onCancel={() => setShowResetCategoriesConfirm(false)}
        />
      )}
      {showClearExpensesConfirm && (
        <ConfirmModal
          title="Clear All Expenses"
          message={`Are you sure you want to delete ALL expenses for ${MONTHS_SHORT[month - 1]} ${year}?`}
          confirmText="Delete all"
          onConfirm={async () => { await api.clearMonthExpenses(month, year); setShowClearExpensesConfirm(false); load(); }}
          onCancel={() => setShowClearExpensesConfirm(false)}
        />
      )}
    </div>
  );
}

// ─── Batch entry modal ──────────────────────────────────────────────────────

interface BatchRow {
  id: string;
  catId: string;
  desc: string;
  amount: string;
  date: string;
}

function makRow(defaultCatId: string): BatchRow {
  return {
    id: crypto.randomUUID(),
    catId: defaultCatId,
    desc: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
  };
}

function BatchExpenseModal({ categories, onClose, onSave }: {
  categories: Category[]; onClose: () => void; onSave: () => void;
}) {
  const defaultCat = String(categories[0]?.id ?? '');
  const [rows, setRows] = useState<BatchRow[]>([makRow(defaultCat), makRow(defaultCat), makRow(defaultCat)]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showDescFor, setShowDescFor] = useState<Set<string>>(new Set());
  const tableRef = useRef<HTMLDivElement>(null);

  const toggleDesc = (id: string) => setShowDescFor(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const update = (id: string, field: keyof BatchRow, val: string) =>
    setRows(r => r.map(row => row.id === id ? { ...row, [field]: val } : row));

  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows(r => [...r, makRow(last?.catId ?? defaultCat)]);
    setTimeout(() => {
      tableRef.current?.scrollTo({ top: tableRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  };

  const removeRow = (id: string) => setRows(r => r.filter(row => row.id !== id));

  const handleKeyDown = (e: React.KeyboardEvent, rowId: string, field: keyof BatchRow) => {
    if (e.key === 'Enter' && field === 'amount') {
      e.preventDefault();
      addRow();
    }
    if (e.key === 'Tab' && field === 'amount' && rowId === rows[rows.length - 1]?.id) {
      e.preventDefault();
      addRow();
    }
  };

  const save = async () => {
    setErr('');
    const valid = rows.filter(r => r.amount.trim() && r.catId);
    if (valid.length === 0) return setErr('Add at least one row with an amount');

    const bad = valid.filter(r => resolveAmount(r.amount) === null);
    if (bad.length > 0) return setErr(`Invalid amount in row(s): check formula syntax`);

    setSaving(true);
    try {
      await Promise.all(valid.map(r => api.createExpense({
        category_id: Number(r.catId),
        amount: resolveAmount(r.amount)!,
        formula: formulaOf(r.amount),
        description: r.desc || null,
        date: r.date,
      })));
      onSave();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const validCount = rows.filter(r => r.amount.trim() && resolveAmount(r.amount) !== null).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-line rounded-2xl shadow-2xl shadow-black/50 w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="text-base font-semibold text-ink">Add expenses</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Fill rows, skip empty ones. Amount supports formulas: <code className="bg-surface-2 px-1 rounded text-indigo-400">=45+120*2</code>
            </p>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors"><X size={20} /></button>
        </div>

        {/* Table */}
        <div ref={tableRef} className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-ink-muted uppercase tracking-wide">
                <th className="text-left pb-2 pr-2 font-medium w-[30%]">Category</th>
                <th className="text-left pb-2 pr-2 font-medium w-[26%]">Amount</th>
                <th className="text-left pb-2 pr-2 font-medium w-[18%]">Date</th>
                <th className="text-left pb-2 pr-2 font-medium w-[22%]">Description</th>
                <th className="pb-2 w-[4%]" />
              </tr>
            </thead>
            <tbody className="space-y-1">
              {rows.map((row) => {
                const amtResult = row.amount.startsWith('=') ? evalFormula(row.amount) : null;
                const amtInvalid = row.amount.startsWith('=') && row.amount.length > 1 && !amtResult;
                const hasDesc = showDescFor.has(row.id);
                return (
                  <tr key={row.id} className="group">
                    <td className="pr-2 pb-1.5">
                      <select
                        value={row.catId}
                        onChange={e => update(row.id, 'catId', e.target.value)}
                        className="w-full border border-line rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-surface"
                      >
                        {categories.map(c => (
                          <option key={Number(c.id)} value={Number(c.id)}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="pr-2 pb-1.5">
                      <div className="relative">
                        <input
                          value={row.amount}
                          onChange={e => update(row.id, 'amount', e.target.value)}
                          onKeyDown={e => handleKeyDown(e, row.id, 'amount')}
                          placeholder="450 or =45+30"
                          className={`w-full border rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 ${
                            amtInvalid
                              ? 'border-red-500/25 focus:ring-red-500/25 text-red-400'
                              : 'border-line focus:ring-indigo-400'
                          } ${amtResult ? 'pr-20' : ''}`}
                        />
                        {amtResult && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-emerald-400 font-medium pointer-events-none whitespace-nowrap">
                            ₹{amtResult.value.toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="pr-2 pb-1.5">
                      <input
                        type="date"
                        value={row.date}
                        onChange={e => update(row.id, 'date', e.target.value)}
                        className="w-full border border-line rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </td>
                    <td className="pr-2 pb-1.5">
                      {hasDesc ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={row.desc}
                            onChange={e => update(row.id, 'desc', e.target.value)}
                            placeholder="e.g. Vegetables"
                            className="flex-1 border border-line rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                          <button onClick={() => { update(row.id, 'desc', ''); toggleDesc(row.id); }}
                            className="p-1 text-ink-faint hover:text-ink-muted">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => toggleDesc(row.id)}
                          className="text-xs text-ink-faint hover:text-indigo-400 px-2 py-1.5 rounded-lg hover:bg-indigo-500/10 transition-colors whitespace-nowrap">
                          + Add desc
                        </button>
                      )}
                    </td>
                    <td className="pb-1.5 text-center">
                      <button
                        onClick={() => removeRow(row.id)}
                        className="p-1 text-ink-faint hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button
            onClick={addRow}
            className="mt-2 flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 rounded-lg hover:bg-indigo-500/10 transition-colors"
          >
            <Plus size={14} /> Add row
          </button>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-line shrink-0 flex items-center justify-between gap-4">
          <div className="text-sm text-ink-muted">
            {validCount > 0
              ? <span className="text-indigo-400 font-medium">{validCount} row{validCount > 1 ? 's' : ''} will be saved</span>
              : 'Fill amount to save rows'}
          </div>
          <div className="flex items-center gap-2">
            {err && <span className="text-sm text-red-400">{err}</span>}
            <button onClick={onClose} className="px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2 transition-colors">Cancel</button>
            <button
              onClick={save}
              disabled={saving || validCount === 0}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : `Save ${validCount > 0 ? validCount : ''} expense${validCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit single expense ────────────────────────────────────────────────────

function EditExpenseModal({ expense, categories, onClose, onSave }: {
  expense: Expense; categories: Category[]; onClose: () => void; onSave: () => void;
}) {
  const [catId, setCatId] = useState(String(expense.category_id));
  const [amount, setAmount] = useState(amountInputValue(expense));
  const [desc, setDesc] = useState(expense.description ?? '');
  const [showDesc, setShowDesc] = useState(!!expense.description);
  const [date, setDate] = useState(expense.date);
  const [err, setErr] = useState('');

  const save = async () => {
    const resolved = resolveAmount(amount);
    if (resolved === null) return setErr('Invalid amount or formula');
    try {
      await api.updateExpense(Number(expense.id), {
        category_id: Number(catId), amount: resolved, formula: formulaOf(amount), description: desc || null, date,
      });
      onSave(); onClose();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <Modal title="Edit expense" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Category</label>
          <select value={catId} onChange={e => setCatId(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            {categories.map(c => <option key={Number(c.id)} value={Number(c.id)}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Amount (₹ or formula)</label>
          <AmountInput
            value={amount}
            onChange={setAmount}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        {showDesc ? (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-ink">Description</label>
              <button onClick={() => { setShowDesc(false); setDesc(''); }} className="text-xs text-ink-faint hover:text-ink">Remove</button>
            </div>
            <input autoFocus value={desc} onChange={e => setDesc(e.target.value)}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        ) : (
          <button onClick={() => setShowDesc(true)}
            className="text-sm text-ink-faint hover:text-indigo-400 hover:bg-indigo-500/10 px-3 py-2 rounded-lg transition-colors text-left">
            + Add description
          </button>
        )}
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2 transition-colors">Cancel</button>
          <button onClick={save} className="flex-1 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">Save</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Overflow menu ──────────────────────────────────────────────────────────

function OverflowMenu({ viewMode, onSetViewMode, onAddCategory, onResetCategories, onClearExpenses, hasExpenses }: {
  viewMode: 'grid' | 'cards';
  onSetViewMode: (m: 'grid' | 'cards') => void;
  onAddCategory: () => void;
  onResetCategories: () => void;
  onClearExpenses: () => void;
  hasExpenses: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const item = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <button
      onClick={() => { setOpen(false); onClick(); }}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left ${danger ? 'text-red-400 hover:bg-red-500/10' : 'text-ink hover:bg-surface-2'}`}
    >
      {icon}{label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="p-2 rounded-lg border border-line text-ink-muted hover:bg-surface-2 transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-surface border border-line rounded-2xl shadow-lg z-50 p-1">
          {item(<Plus size={15} />, 'Add category', onAddCategory)}
          {item(<Trash2 size={15} />, 'Delete all categories', onResetCategories, true)}
          <div className="border-t border-line my-1" />
          {viewMode === 'cards'
            ? item(<Table2 size={15} />, 'Switch to Grid view', () => onSetViewMode('grid'))
            : item(<LayoutGrid size={15} />, 'Switch to Cards view', () => onSetViewMode('cards'))}
          {hasExpenses && (
            <>
              <div className="border-t border-line my-1" />
              {item(<Trash2 size={15} />, 'Clear all expenses', onClearExpenses, true)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Expense Grid ───────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface ActiveCell { catId: number; day: number; }

function ExpenseGrid({ cats, expenses, month, year, onReload, onEditCat, dragId, dragOverId, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }: {
  cats: Category[]; expenses: Expense[]; month: number; year: number; onReload: () => void;
  onEditCat: (cat: Category) => void;
  dragId: number | null; dragOverId: number | null;
  onDragStart: (id: number) => void; onDragOver: (id: number) => void;
  onDragLeave: () => void; onDrop: (id: number) => void; onDragEnd: () => void;
}) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const mon = MONTHS_SHORT[month - 1];

  // Build lookup: catId → day → expenses[]
  const lk = useMemo(() => {
    const m: Record<number, Record<number, Expense[]>> = {};
    expenses.forEach(e => {
      const cid = Number(e.category_id);
      const d = Number(e.date.split('-')[2]);
      if (!m[cid]) m[cid] = {};
      if (!m[cid][d]) m[cid][d] = [];
      m[cid][d].push(e);
    });
    return m;
  }, [expenses]);

  const [active, setActive] = useState<ActiveCell | null>(null);
  const [cellVal, setCellVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<ActiveCell | null>(null);
  const cellValRef = useRef('');

  // Keep refs in sync so window focus handler can read latest values
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { cellValRef.current = cellVal; }, [cellVal]);

  useEffect(() => {
    const onWinFocus = () => {
      // Re-focus the active cell input when user comes back to the window
      if (activeRef.current) setTimeout(() => inputRef.current?.focus(), 50);
    };
    window.addEventListener('focus', onWinFocus);
    return () => window.removeEventListener('focus', onWinFocus);
  }, []);

  const lastEntryAt = useMemo(() => {
    return expenses.reduce<string | null>((latest, e) => {
      const t = e.updated_at || e.created_at;
      return !latest || t > latest ? t : latest;
    }, null);
  }, [expenses]);

  const lastEntryLabel = lastEntryAt
    ? new Date(lastEntryAt.replace(' ', 'T') + 'Z').toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
      })
    : null;

  const cellSum = (catId: number, day: number) =>
    (lk[catId]?.[day] ?? []).reduce((s, e) => s + Number(e.amount), 0);

  const activateCell = (catId: number, day: number) => {
    const exps = lk[catId]?.[day] ?? [];
    if (exps.length === 1) {
      setCellVal(amountInputValue(exps[0]));
    } else {
      const sum = exps.reduce((s, e) => s + Number(e.amount), 0);
      setCellVal(sum > 0 ? String(sum) : '');
    }
    setActive({ catId, day });
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const commitCell = async (catId: number, day: number, val: string) => {
    setActive(null);
    const trimmed = val.trim();
    const exps = lk[catId]?.[day] ?? [];
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    if (!trimmed) {
      // Delete all expenses on this cell
      await Promise.all(exps.map(e => api.deleteExpense(Number(e.id))));
      onReload();
      return;
    }
    const amount = resolveAmount(trimmed);
    if (amount === null) return; // invalid formula, leave as is
    const formula = formulaOf(trimmed);

    if (exps.length === 1) {
      await api.updateExpense(Number(exps[0].id), {
        category_id: catId, amount, formula, description: exps[0].description, date: dateStr,
      });
    } else if (exps.length === 0) {
      await api.createExpense({ category_id: catId, amount, formula, date: dateStr });
    } else {
      await Promise.all(exps.map(e => api.deleteExpense(Number(e.id))));
      await api.createExpense({ category_id: catId, amount, formula, date: dateStr });
    }
    onReload();
  };

  const moveCell = (catIdx: number, dayIdx: number, dir: 'up' | 'down' | 'left' | 'right') => {
    if (dir === 'right' && dayIdx + 1 < days.length) activateCell(Number(cats[catIdx].id), days[dayIdx + 1]);
    else if (dir === 'left' && dayIdx - 1 >= 0) activateCell(Number(cats[catIdx].id), days[dayIdx - 1]);
    else if (dir === 'down' && catIdx + 1 < cats.length) activateCell(Number(cats[catIdx + 1].id), days[dayIdx]);
    else if (dir === 'up' && catIdx - 1 >= 0) activateCell(Number(cats[catIdx - 1].id), days[dayIdx]);
    else {
      // At boundary — stay on current cell instead of losing focus
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, catId: number, day: number, catIdx: number, dayIdx: number) => {
    if (e.key === 'Escape') { setActive(null); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 'up' : 'down';
      const atBoundary = (dir === 'up' && catIdx === 0) || (dir === 'down' && catIdx === cats.length - 1);
      if (atBoundary) {
        setTimeout(() => inputRef.current?.focus(), 10);
      } else {
        commitCell(catId, day, cellVal).then(() => moveCell(catIdx, dayIdx, dir));
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      const input = e.currentTarget;
      if (input.selectionStart === 0 && input.selectionEnd === 0) {
        e.preventDefault();
        if (dayIdx === 0) { setTimeout(() => inputRef.current?.focus(), 10); }
        else commitCell(catId, day, cellVal).then(() => moveCell(catIdx, dayIdx, 'left'));
      }
      return;
    }
    if (e.key === 'ArrowRight') {
      const input = e.currentTarget;
      if (input.selectionStart === input.value.length) {
        e.preventDefault();
        if (dayIdx === days.length - 1) { setTimeout(() => inputRef.current?.focus(), 10); }
        else commitCell(catId, day, cellVal).then(() => moveCell(catIdx, dayIdx, 'right'));
      }
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      commitCell(catId, day, cellVal).then(() => {
        if (e.key === 'Tab' && !e.shiftKey) {
          if (dayIdx + 1 < days.length) activateCell(Number(cats[catIdx].id), days[dayIdx + 1]);
          else if (catIdx + 1 < cats.length) activateCell(Number(cats[catIdx + 1].id), days[0]);
        } else if (e.key === 'Tab' && e.shiftKey) {
          if (dayIdx - 1 >= 0) activateCell(Number(cats[catIdx].id), days[dayIdx - 1]);
          else if (catIdx - 1 >= 0) activateCell(Number(cats[catIdx - 1].id), days[days.length - 1]);
        } else {
          // Enter = move down
          if (catIdx + 1 < cats.length) activateCell(Number(cats[catIdx + 1].id), days[dayIdx]);
        }
      });
    }
  };

  // Per-day totals
  const dayTotals = days.map(d =>
    cats.reduce((s, c) => s + cellSum(Number(c.id), d), 0)
  );

  const totalSpent = cats.reduce((s, c) => s + Number(c.spent), 0);

  const CELL_W = 72;
  const NAME_W = 150;
  const STAT_W = 115;

  return (
    <div style={{ minWidth: 0 }}>
      {/* Help row */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-b border-line bg-surface-2 text-xs text-ink-muted shrink-0">
        <span className="text-ink-faint italic text-xs">Click cell to edit · Enter/Tab/arrows = <span className="text-emerald-400 font-medium not-italic">auto-save</span> + move · Esc = cancel · Drag ⠿ to reorder</span>
        {lastEntryLabel && <span className="text-ink-faint shrink-0 whitespace-nowrap">Last entry: <span className="text-ink-muted font-medium">{lastEntryLabel}</span></span>}
      </div>

      <div style={{ overflowX: 'scroll' }}>
        <table className="border-collapse text-xs" style={{ width: NAME_W + STAT_W + days.length * CELL_W, minWidth: NAME_W + STAT_W + days.length * CELL_W }}>
          <thead>
            <tr className="bg-surface-2 border-b border-line">
              <th className="sticky left-0 z-20 bg-surface-2 text-left font-semibold text-ink-muted px-3 py-2 border-r border-line whitespace-nowrap" style={{ width: NAME_W, minWidth: NAME_W }}>
                <span className="ml-5">Category</span>
              </th>
              <th className="sticky bg-surface-2 text-right font-semibold text-ink-muted px-3 py-2 border-r border-line" style={{ left: NAME_W, width: STAT_W, minWidth: STAT_W }}>
                Spent / Budget
              </th>
              {days.map(d => (
                <th key={d} className="font-medium text-ink-muted py-2 border-r border-line last:border-r-0" style={{ width: CELL_W, minWidth: CELL_W }}>
                  {mon} {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cats.map((cat, catIdx) => {
              const spent = Number(cat.spent);
              const budget = Number(cat.budget);
              const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
              const isOver = budget > 0 && spent > budget;
              return (
                <tr
                  key={Number(cat.id)}
                  draggable
                  onDragStart={() => onDragStart(Number(cat.id))}
                  onDragOver={e => { e.preventDefault(); onDragOver(Number(cat.id)); }}
                  onDragLeave={onDragLeave}
                  onDrop={() => onDrop(Number(cat.id))}
                  onDragEnd={onDragEnd}
                  className={`border-b border-line hover:bg-surface-2/50 group/row transition-all
                    ${dragOverId === Number(cat.id) && dragId !== Number(cat.id) ? 'border-t-2 border-t-indigo-400' : ''}
                    ${dragId === Number(cat.id) ? 'opacity-40' : ''}`}
                >
                  <td className="sticky left-0 z-10 bg-surface group-hover/row:bg-surface-2/50 px-2 py-1.5 border-r border-line" style={{ width: NAME_W, minWidth: NAME_W }}>
                    <div className="flex items-center gap-1.5 group/cat">
                      <span className="text-ink-faint hover:text-ink-muted cursor-grab active:cursor-grabbing shrink-0">
                        <GripVertical size={14} />
                      </span>
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="font-medium text-ink truncate flex-1">{cat.name}</span>
                      <button
                        onClick={e => { e.stopPropagation(); onEditCat(cat); }}
                        className="p-0.5 text-ink-faint hover:text-indigo-400 opacity-0 group-hover/cat:opacity-100 transition-opacity shrink-0"
                        title="Edit category"
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                  </td>
                  <td className="sticky bg-surface group-hover/row:bg-surface-2/50 px-3 py-1.5 border-r border-line text-right" style={{ left: NAME_W }}>
                    <div className={`text-xs font-semibold ${isOver ? 'text-red-400' : 'text-ink'}`}>
                      ₹{spent.toLocaleString('en-IN')}
                    </div>
                    <div className="text-ink-faint text-xs">/ ₹{budget.toLocaleString('en-IN')}</div>
                    <div className="mt-1 h-1 bg-surface-2 rounded-full overflow-hidden w-full">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: isOver ? '#ef4444' : cat.color }} />
                    </div>
                  </td>
                  {days.map((d, dayIdx) => {
                    const exps = lk[Number(cat.id)]?.[d] ?? [];
                    const sum = exps.reduce((s, e) => s + Number(e.amount), 0);
                    const isActive = active?.catId === Number(cat.id) && active?.day === d;
                    const hasMultiple = exps.length > 1;
                    const fResult = isActive && cellVal.startsWith('=') ? evalFormula(cellVal) : null;

                    return (
                      <td
                        key={d}
                        onClick={() => !isActive && activateCell(Number(cat.id), d)}
                        className={`border-r border-line last:border-r-0 text-center relative cursor-pointer transition-colors
                          ${isActive ? 'bg-indigo-500/10 ring-1 ring-inset ring-indigo-400' : sum > 0 ? 'bg-surface hover:bg-indigo-500/10' : 'hover:bg-surface-2/70'}`}
                        style={{ width: CELL_W, minWidth: CELL_W, height: 40, padding: 0 }}
                      >
                        {isActive ? (
                          <div className="relative w-full h-full flex items-center">
                            <input
                              ref={inputRef}
                              value={cellVal}
                              onChange={e => setCellVal(e.target.value)}
                              onKeyDown={e => handleKeyDown(e, Number(cat.id), d, catIdx, dayIdx)}
                              onBlur={() => {
                                // rAF lets window.blur fire first so document.hasFocus() is accurate
                                const valAtBlur = cellValRef.current;
                                const cid = Number(cat.id);
                                requestAnimationFrame(() => {
                                  if (!document.hasFocus()) return; // Alt-Tab: keep cell active
                                  commitCell(cid, d, valAtBlur);
                                });
                              }}
                              className="w-full h-full text-center text-xs bg-transparent outline-none px-1 text-ink"
                              style={{ caretColor: '#6366f1' }}
                            />
                            {fResult && (
                              <span className="absolute -bottom-4 left-0 right-0 text-center text-xs text-emerald-400 pointer-events-none whitespace-nowrap z-30 bg-surface shadow rounded px-1">
                                ₹{fResult.value.toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                        ) : sum > 0 ? (
                          <span className={`text-xs font-medium ${isOver ? 'text-red-400' : 'text-ink'}`}>
                            {sum.toLocaleString('en-IN')}
                            {hasMultiple && <span className="ml-0.5 text-ink-faint">·</span>}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Total per day row */}
            <tr className="border-t-2 border-line-strong bg-surface-2">
              <td className="sticky left-0 z-10 bg-surface-2 px-3 py-2 text-xs font-bold text-ink border-r border-line-strong" style={{ width: NAME_W }}>
                Total per day
              </td>
              <td className="sticky bg-surface-2 px-3 py-2 text-right text-xs font-bold text-ink border-r border-line-strong" style={{ left: NAME_W }}>
                ₹{totalSpent.toLocaleString('en-IN')}
              </td>
              {dayTotals.map((total, i) => (
                <td key={i} className="text-center py-2 border-r border-line-strong last:border-r-0">
                  {total > 0 ? (
                    <span className="text-xs font-semibold text-ink">{total.toLocaleString('en-IN')}</span>
                  ) : (
                    <span className="text-ink-muted text-xs">—</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Daily chart ────────────────────────────────────────────────────────────

function DailyChart({ expenses, color }: { expenses: Expense[]; color: string }) {
  const byDay: Record<string, number> = {};
  expenses.forEach(e => {
    const d = e.date.split('-')[2];
    byDay[d] = (byDay[d] || 0) + Number(e.amount);
  });
  const data = Object.entries(byDay).map(([day, total]) => ({ day: String(Number(day)), total }));

  return (
    <div className="h-36">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9b9aa3' }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9b9aa3' }} axisLine={false} tickLine={false} width={50} tickFormatter={v => `₹${v}`} />
          <Tooltip
            formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Spent']}
            contentStyle={{ background: '#141418', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: '#f3f1ec' }}
            labelStyle={{ color: '#9b9aa3' }}
            itemStyle={{ color: '#f3f1ec' }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Bar dataKey="total" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Category modal ─────────────────────────────────────────────────────────

function CategoryModal({ initial, month, year, onClose, onSave }: {
  initial: Category | null; month: number; year: number;
  onClose: () => void; onSave: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [budget, setBudget] = useState(String(initial?.budget ?? ''));
  const [color, setColor] = useState(initial?.color ?? '#6366f1');
  const [err, setErr] = useState('');

  const save = async () => {
    if (!name.trim()) return setErr('Name required');
    try {
      if (initial) {
        await api.updateCategory(Number(initial.id), { name, budget: Number(budget), color });
      } else {
        await api.createCategory({ name, budget: Number(budget), color, month, year });
      }
      onSave(); onClose();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <Modal title={initial ? 'Edit category' : 'Add category'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Budget (₹)</label>
          <input type="number" value={budget} onChange={e => setBudget(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Color</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="w-10 h-10 rounded border border-line cursor-pointer" />
            <div className="flex gap-2">
              {['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316'].map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-ink scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2 transition-colors">Cancel</button>
          <button onClick={save} className="flex-1 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">Save</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Add unplanned expense modal ────────────────────────────────────────────

function AddUnplannedExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState('');

  const save = async () => {
    const n = Number(amount);
    if (!n || n <= 0) return setErr('Enter a valid amount');
    try {
      await api.createUnplannedExpense({ amount: n, description: description || null, date });
      onSaved();
      onClose();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <Modal title="Add unplanned expense" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Amount (₹)</label>
          <input
            type="number" autoFocus value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">What happened?</label>
          <input
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Cab to airport, phone repair"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Date</label>
          <input
            type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2 transition-colors">Cancel</button>
          <button onClick={save} className="flex-1 px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors">Save</button>
        </div>
      </div>
    </Modal>
  );
}
