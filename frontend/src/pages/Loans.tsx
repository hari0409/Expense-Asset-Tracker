import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { Loan, EmiPayment, EmiForMonth } from '../api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import MonthPicker from '../components/MonthPicker';
import { Plus, Pencil, Trash2, CreditCard, ChevronDown, ChevronUp, TrendingUp, AlertCircle } from 'lucide-react';

const COLORS = ['#f43f5e', '#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#ef4444'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(n: number) {
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

function monthLabel(m: number, y: number) {
  return `${MONTHS[m - 1]} ${y}`;
}

// ── LoanModal ──────────────────────────────────────────────────────────────
interface LoanModalProps {
  initial: Loan | null;
  onClose: () => void;
  onSave: () => void;
}

function LoanModal({ initial, onClose, onSave }: LoanModalProps) {
  const now = new Date();
  const [name, setName] = useState(initial?.name ?? '');
  const [lender, setLender] = useState(initial?.lender ?? '');
  const [principal, setPrincipal] = useState(initial?.principal != null ? String(initial.principal) : '');
  const [color, setColor] = useState(initial?.color ?? '#f43f5e');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [status, setStatus] = useState<'active' | 'closed'>(initial?.status ?? 'active');
  const [hasEmi, setHasEmi] = useState(initial ? Boolean(initial.has_emi) : true);
  const [emiAmount, setEmiAmount] = useState(initial?.current_emi_amount != null ? String(initial.current_emi_amount) : '');
  const [startMonth, setStartMonth] = useState(initial?.start_month ?? now.getMonth() + 1);
  const [startYear, setStartYear] = useState(initial?.start_year ?? now.getFullYear());
  const [hasEnd, setHasEnd] = useState(initial?.end_month != null);
  const [endMonth, setEndMonth] = useState(initial?.end_month ?? now.getMonth() + 1);
  const [endYear, setEndYear] = useState(initial?.end_year ?? now.getFullYear());
  const [err, setErr] = useState('');

  async function handleSave() {
    if (!name.trim()) return setErr('Name is required');
    try {
      const body: Parameters<typeof api.createLoan>[0] = {
        name: name.trim(),
        lender: lender.trim() || undefined,
        principal: principal ? Number(principal) : undefined,
        has_emi: hasEmi ? 1 : 0,
        color,
        notes: notes.trim() || undefined,
        status,
        start_month: startMonth,
        start_year: startYear,
        end_month: hasEnd ? endMonth : undefined,
        end_year: hasEnd ? endYear : undefined,
        emi_amount: hasEmi && emiAmount ? Number(emiAmount) : undefined,
      };
      if (initial) {
        await api.updateLoan(initial.id, body);
      } else {
        await api.createLoan(body);
      }
      onSave();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <Modal title={initial ? 'Edit Loan' : 'Add Loan'} onClose={onClose}>
      <div className="space-y-4">
        {err && <p className="text-red-500 text-sm">{err}</p>}

        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Home Loan" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Lender</label>
            <input className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" value={lender} onChange={e => setLender(e.target.value)} placeholder="Bank / Person" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Principal (₹)</label>
            <input type="number" className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="Total loan amount" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Has EMI</label>
          <button
            type="button"
            onClick={() => setHasEmi(h => !h)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hasEmi ? 'bg-indigo-600' : 'bg-surface-2'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${hasEmi ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {hasEmi && (
          <div>
            <label className="block text-sm font-medium mb-1">EMI Amount (₹) {initial ? '— current, use Change EMI to update' : ''}</label>
            <input type="number" className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" value={emiAmount} onChange={e => setEmiAmount(e.target.value)} placeholder="Monthly EMI" disabled={Boolean(initial)} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Start</label>
            <MonthPicker month={startMonth} year={startYear} onChange={(m, y) => { setStartMonth(m); setStartYear(y); }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              <span>End</span>
              <button type="button" className="ml-2 text-xs text-indigo-500" onClick={() => setHasEnd(h => !h)}>
                {hasEnd ? 'Remove' : '+ Set end'}
              </button>
            </label>
            {hasEnd && <MonthPicker month={endMonth} year={endYear} onChange={(m, y) => { setEndMonth(m); setEndYear(y); }} />}
            {!hasEnd && <span className="text-sm text-ink-faint">Ongoing</span>}
          </div>
        </div>

        {initial && (
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" value={status} onChange={e => setStatus(e.target.value as 'active' | 'closed')}>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Color</label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)} className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? 'border-ink scale-110' : 'border-transparent'}`} style={{ background: c }} />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-line hover:bg-surface-2 transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 rounded text-sm bg-indigo-600 text-white">Save</button>
        </div>
      </div>
    </Modal>
  );
}

// ── ChangeEmiModal ─────────────────────────────────────────────────────────
interface ChangeEmiModalProps {
  loan: Loan;
  onClose: () => void;
  onSave: () => void;
}

function ChangeEmiModal({ loan, onClose, onSave }: ChangeEmiModalProps) {
  const now = new Date();
  const [amount, setAmount] = useState('');
  const [fromMonth, setFromMonth] = useState(now.getMonth() + 1);
  const [fromYear, setFromYear] = useState(now.getFullYear());
  const [err, setErr] = useState('');

  async function handleSave() {
    if (!amount || Number(amount) <= 0) return setErr('Enter a valid amount');
    try {
      await api.changeLoanEmi(loan.id, { amount: Number(amount), from_month: fromMonth, from_year: fromYear });
      onSave();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <Modal title={`Change EMI — ${loan.name}`} onClose={onClose}>
      <div className="space-y-4">
        {err && <p className="text-red-500 text-sm">{err}</p>}
        <div className="rounded-lg bg-amber-500/10 dark:bg-amber-900/20 border border-amber-500/20 dark:border-amber-700 p-3 text-sm text-amber-300 dark:text-amber-300 flex gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          Past payments before this month are unaffected.
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">New EMI Amount (₹)</label>
          <input type="number" className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Effective from</label>
          <MonthPicker month={fromMonth} year={fromYear} onChange={(m, y) => { setFromMonth(m); setFromYear(y); }} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-line hover:bg-surface-2 transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 rounded text-sm bg-indigo-600 text-white">Update EMI</button>
        </div>
      </div>
    </Modal>
  );
}

// ── PaymentModal ───────────────────────────────────────────────────────────
interface PaymentModalProps {
  initial: EmiPayment | null;
  loans: Loan[];
  defaultLoanId?: number;
  defaultAmount?: number;
  month: number;
  year: number;
  onClose: () => void;
  onSave: () => void;
}

function PaymentModal({ initial, loans, defaultLoanId, defaultAmount, month, year, onClose, onSave }: PaymentModalProps) {
  const [loanId, setLoanId] = useState<number>(initial?.loan_id ?? defaultLoanId ?? loans[0]?.id ?? 0);
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : defaultAmount ? String(defaultAmount) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [err, setErr] = useState('');

  async function handleSave() {
    if (!amount || Number(amount) <= 0) return setErr('Enter a valid amount');
    if (!loanId) return setErr('Select a loan');
    try {
      if (initial) {
        await api.updateEmiPayment(initial.id, { amount: Number(amount), notes: notes || undefined });
      } else {
        await api.createEmiPayment({ loan_id: loanId, amount: Number(amount), month, year, notes: notes || undefined });
      }
      onSave();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  const activeLoans = loans.filter(l => l.has_emi && l.status === 'active');

  return (
    <Modal title={initial ? 'Edit Payment' : 'Record EMI Payment'} onClose={onClose}>
      <div className="space-y-4">
        {err && <p className="text-red-500 text-sm">{err}</p>}
        <div>
          <label className="block text-sm font-medium mb-1">Loan</label>
          <select
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            value={loanId}
            onChange={e => setLoanId(Number(e.target.value))}
            disabled={Boolean(initial)}
          >
            {activeLoans.map(l => <option key={l.id} value={l.id}>{l.name}{l.lender ? ` (${l.lender})` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Amount (₹)</label>
          <input type="number" className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Month</label>
          <span className="text-sm text-ink-muted">{monthLabel(month, year)}</span>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <input className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-line hover:bg-surface-2 transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 rounded text-sm bg-indigo-600 text-white">Save</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Loans() {
  const now = new Date();
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
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<EmiPayment[]>([]);
  const [emiRates, setEmiRates] = useState<EmiForMonth[]>([]);
  const [expandedLoan, setExpandedLoan] = useState<number | null>(null);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [changeEmiLoan, setChangeEmiLoan] = useState<Loan | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<EmiPayment | null>(null);
  const [loanToDelete, setLoanToDelete] = useState<Loan | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<EmiPayment | null>(null);
  const [defaultLoanId, setDefaultLoanId] = useState<number | undefined>();
  const [defaultAmount, setDefaultAmount] = useState<number | undefined>();

  async function load() {
    const [l, p, r] = await Promise.all([
      api.getLoans(),
      api.getEmiPayments({ month, year }),
      api.getEmiForMonth(month, year),
    ]);
    setLoans(l);
    setPayments(p);
    setEmiRates(r);
  }

  useEffect(() => { load(); }, [month, year]);

  function openRecordPayment(loan: Loan) {
    const rate = emiRates.find(r => r.loan_id === loan.id);
    setDefaultLoanId(loan.id);
    setDefaultAmount(rate?.emi_amount);
    setEditingPayment(null);
    setShowPaymentModal(true);
  }

  const totalEmi = payments.reduce((s, p) => s + p.amount, 0);

  // Payment lookup per loan for current month
  const paymentByLoan = Object.fromEntries(payments.map(p => [p.loan_id, p]));
  const activeLoans = loans.filter(l => l.status === 'active');
  const closedLoans = loans.filter(l => l.status === 'closed');

  function LoanCard({ loan }: { loan: Loan }) {
    const expanded = expandedLoan === loan.id;
    const payment = paymentByLoan[loan.id];
    const rate = emiRates.find(r => r.loan_id === loan.id);

    return (
      <div className="bg-surface rounded-2xl border border-line overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <div className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ background: loan.color }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold truncate">{loan.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${loan.status === 'active' ? 'bg-green-500/15 text-green-400 dark:bg-green-900/30 dark:text-green-400' : 'bg-surface-2 text-ink-muted'}`}>
                {loan.status}
              </span>
            </div>
            {loan.lender && <p className="text-xs text-ink-faint mt-0.5">Lender: {loan.lender}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-ink-muted">
              {loan.principal != null && <span>Principal: {fmt(loan.principal)}</span>}
              <span>
                {monthLabel(loan.start_month, loan.start_year)}
                {' → '}
                {loan.end_month ? monthLabel(loan.end_month, loan.end_year!) : 'Ongoing'}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            {loan.has_emi ? (
              <>
                <p className="text-sm font-semibold">{loan.current_emi_amount != null ? fmt(loan.current_emi_amount) : '—'}<span className="text-xs font-normal text-ink-faint">/mo</span></p>
                <p className="text-xs text-ink-faint">Paid total: {fmt(loan.total_paid)}</p>
              </>
            ) : (
              <p className="text-xs text-ink-faint">No EMI</p>
            )}
          </div>
        </div>

        {/* This month's payment status */}
        {loan.has_emi && loan.status === 'active' && (
          <div className="px-4 pb-3 flex items-center gap-2">
            {payment ? (
              <span className="flex-1 text-sm text-green-400 dark:text-green-400">
                ✓ Paid {fmt(payment.amount)} this month
                {rate && rate.emi_amount !== payment.amount && (
                  <span className="text-ink-faint ml-1">(EMI: {fmt(rate.emi_amount)})</span>
                )}
              </span>
            ) : (
              <span className="flex-1 text-sm text-amber-400 dark:text-amber-400">
                EMI due {rate ? fmt(rate.emi_amount) : ''} this month
              </span>
            )}
            <button
              onClick={() => openRecordPayment(loan)}
              className="text-xs px-2 py-1 rounded bg-indigo-500/10 dark:bg-indigo-900/30 text-indigo-400 dark:text-indigo-400 hover:bg-indigo-500/15"
            >
              {payment ? 'Edit' : 'Record'}
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-line px-4 py-2 flex items-center gap-2">
          {loan.has_emi && loan.status === 'active' && (
            <button
              onClick={() => setChangeEmiLoan(loan)}
              className="text-xs px-2 py-1 rounded text-ink-muted hover:text-indigo-400 hover:bg-indigo-500/10 dark:hover:bg-indigo-900/20 flex items-center gap-1"
            >
              <TrendingUp size={12} /> Change EMI
            </button>
          )}
          <button
            onClick={() => { setEditingLoan(loan); setShowLoanModal(true); }}
            className="text-xs px-2 py-1 rounded text-ink-muted hover:text-ink hover:bg-surface-2 flex items-center gap-1"
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            onClick={() => setLoanToDelete(loan)}
            className="text-xs px-2 py-1 rounded text-ink-muted hover:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-900/20 flex items-center gap-1"
          >
            <Trash2 size={12} /> Delete
          </button>
          <button
            onClick={() => setExpandedLoan(expanded ? null : loan.id)}
            className="ml-auto text-xs px-2 py-1 rounded text-ink-faint hover:text-ink flex items-center gap-1"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Hide' : 'History'}
          </button>
        </div>

        {/* Expanded payment history */}
        {expanded && (
          <LoanPaymentHistory loan={loan} month={month} year={year} onEdit={(p) => { setEditingPayment(p); setShowPaymentModal(true); }} onDeleted={load} />
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Loans &amp; EMI</h1>
          {totalEmi > 0 && (
            <p className="text-sm text-ink-muted mt-0.5">Total EMI paid this month: <span className="font-semibold text-ink-muted">{fmt(totalEmi)}</span></p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <MonthPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <button
            onClick={() => { setEditingLoan(null); setShowLoanModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            <Plus size={16} /> Add Loan
          </button>
        </div>
      </div>

      {/* Active loans */}
      {activeLoans.length === 0 && closedLoans.length === 0 ? (
        <div className="text-center py-16 text-ink-faint">
          <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No loans yet</p>
          <p className="text-sm mt-1">Add a loan to start tracking EMI payments</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            {activeLoans.map(loan => <LoanCard key={loan.id} loan={loan} />)}
          </div>

          {closedLoans.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-ink-faint uppercase tracking-wider mb-2">Closed</h2>
              <div className="space-y-3 opacity-70">
                {closedLoans.map(loan => <LoanCard key={loan.id} loan={loan} />)}
              </div>
            </div>
          )}

          {/* Monthly payments summary */}
          <div>
            <h2 className="text-sm font-medium text-ink-faint uppercase tracking-wider mb-2">Payments — {monthLabel(month, year)}</h2>
            {payments.length === 0 ? (
              <p className="text-sm text-ink-faint">No payments recorded for this month.</p>
            ) : (
              <div className="bg-surface rounded-2xl border border-line divide-y divide-line">
                {payments.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.loan_color }} />
                    <span className="flex-1 text-sm">{p.loan_name}</span>
                    {p.notes && <span className="text-xs text-ink-faint">{p.notes}</span>}
                    <span className="font-semibold text-sm">{fmt(p.amount)}</span>
                    <button onClick={() => { setEditingPayment(p); setShowPaymentModal(true); }} className="text-ink-faint hover:text-ink"><Pencil size={14} /></button>
                    <button onClick={() => setPaymentToDelete(p)} className="text-ink-faint hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                ))}
                <div className="flex items-center px-4 py-3 font-semibold text-sm">
                  <span className="flex-1">Total</span>
                  <span>{fmt(totalEmi)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showLoanModal && (
        <LoanModal
          initial={editingLoan}
          onClose={() => { setShowLoanModal(false); setEditingLoan(null); }}
          onSave={() => { setShowLoanModal(false); setEditingLoan(null); load(); }}
        />
      )}
      {changeEmiLoan && (
        <ChangeEmiModal
          loan={changeEmiLoan}
          onClose={() => setChangeEmiLoan(null)}
          onSave={() => { setChangeEmiLoan(null); load(); }}
        />
      )}
      {showPaymentModal && (
        <PaymentModal
          initial={editingPayment}
          loans={loans}
          defaultLoanId={defaultLoanId}
          defaultAmount={defaultAmount}
          month={month}
          year={year}
          onClose={() => { setShowPaymentModal(false); setEditingPayment(null); }}
          onSave={() => { setShowPaymentModal(false); setEditingPayment(null); load(); }}
        />
      )}
      {loanToDelete && (
        <ConfirmModal
          title="Delete Loan"
          message={`Are you sure you want to delete "${loanToDelete.name}"? This will also remove its EMI payments.`}
          confirmText="Delete"
          onConfirm={async () => { await api.deleteLoan(loanToDelete.id); setLoanToDelete(null); load(); }}
          onCancel={() => setLoanToDelete(null)}
        />
      )}
      {paymentToDelete && (
        <ConfirmModal
          title="Delete EMI Payment"
          message={`Are you sure you want to delete the ${fmt(paymentToDelete.amount)} EMI payment for "${paymentToDelete.loan_name}"?`}
          confirmText="Delete"
          onConfirm={async () => { await api.deleteEmiPayment(paymentToDelete.id); setPaymentToDelete(null); load(); }}
          onCancel={() => setPaymentToDelete(null)}
        />
      )}
    </div>
  );
}

// ── LoanPaymentHistory ─────────────────────────────────────────────────────
function LoanPaymentHistory({ loan, month, year, onEdit, onDeleted }: { loan: Loan; month: number; year: number; onEdit: (p: EmiPayment) => void; onDeleted: () => void }) {
  const [history, setHistory] = useState<EmiPayment[]>([]);
  const [paymentToDelete, setPaymentToDelete] = useState<EmiPayment | null>(null);

  useEffect(() => {
    api.getEmiPayments({ loan_id: loan.id }).then(setHistory);
  }, [loan.id, month, year]);

  return (
    <div className="border-t border-line bg-surface-2 px-4 py-3">
      <p className="text-xs font-medium text-ink-faint uppercase tracking-wider mb-2">All payments</p>
      {history.length === 0 ? (
        <p className="text-xs text-ink-faint">No payments recorded.</p>
      ) : (
        <div className="space-y-1">
          {history.map(p => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className="text-ink-muted w-20 shrink-0">{MONTHS[p.month - 1]} {p.year}</span>
              <span className="font-medium">{fmt(p.amount)}</span>
              {p.notes && <span className="text-xs text-ink-faint flex-1 truncate">{p.notes}</span>}
              <button onClick={() => onEdit(p)} className="text-ink-faint hover:text-ink-muted"><Pencil size={12} /></button>
              <button onClick={() => setPaymentToDelete(p)} className="text-ink-faint hover:text-red-500"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
      {paymentToDelete && (
        <ConfirmModal
          title="Delete EMI Payment"
          message={`Are you sure you want to delete the ${fmt(paymentToDelete.amount)} EMI payment from ${MONTHS[paymentToDelete.month - 1]} ${paymentToDelete.year}?`}
          confirmText="Delete"
          onConfirm={async () => { await api.deleteEmiPayment(paymentToDelete.id); setPaymentToDelete(null); onDeleted(); }}
          onCancel={() => setPaymentToDelete(null)}
        />
      )}
    </div>
  );
}
