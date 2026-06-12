import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { AdhocBudget, UnplannedExpense } from '../api';
import ConfirmModal from '../components/ConfirmModal';
import PageHeader from '../components/ui/PageHeader';
import { ArrowLeft, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

export default function BudgetHistory() {
  const navigate = useNavigate();
  const [archived, setArchived] = useState<AdhocBudget[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expenses, setExpenses] = useState<Record<number, UnplannedExpense[]>>({});
  const [toDelete, setToDelete] = useState<AdhocBudget | null>(null);

  const load = () => { api.getArchivedAdhocBudgets().then(setArchived); };
  useEffect(() => { load(); }, []);

  const toggle = (b: AdhocBudget) => {
    const id = Number(b.id);
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!expenses[id]) api.getAdhocBudgetExpenses(id).then(rows => setExpenses(prev => ({ ...prev, [id]: rows })));
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Budget history"
        subtitle="Closed cycles from saved resets — their expenses are frozen here and no longer affect the live budget."
        actions={
          <button onClick={() => navigate('/expenses')} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-line rounded-lg text-ink-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={14} /> Back to expenses
          </button>
        }
      />

      {archived.length === 0 && (
        <div className="bg-surface rounded-2xl border border-line p-8 text-center">
          <p className="text-sm text-ink-faint">No closed budget cycles yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {archived.map(b => {
          const id = Number(b.id);
          return (
            <div key={id} className="bg-surface border border-line rounded-2xl overflow-hidden">
              <button onClick={() => toggle(b)} className="w-full flex items-center justify-between gap-2 p-4 text-left hover:bg-surface-2 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                  <span className="font-medium text-ink truncate">{b.name}</span>
                  {b.archived_at && <span className="text-xs text-ink-faint shrink-0">(closed {b.archived_at.slice(0, 10)})</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm text-ink-muted">₹{Number(b.balance).toLocaleString('en-IN')} / ₹{Number(b.original_amount).toLocaleString('en-IN')}</span>
                  {expandedId === id ? <ChevronUp size={14} className="text-ink-faint" /> : <ChevronDown size={14} className="text-ink-faint" />}
                </div>
              </button>
              {expandedId === id && (
                <div className="border-t border-line p-4 space-y-2">
                  {b.asset_name && <p className="text-xs text-ink-faint">Source: {b.asset_name}</p>}
                  {(expenses[id] ?? []).length === 0 ? (
                    <p className="text-sm text-ink-faint">No expenses recorded for this cycle.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(expenses[id] ?? []).map(e => (
                        <div key={Number(e.id)} className="flex items-center justify-between text-sm">
                          <div className="min-w-0">
                            <span className="text-ink">{e.description || 'Unplanned expense'}</span>
                            <span className="text-ink-faint ml-2">{e.date}</span>
                          </div>
                          <span className="font-medium text-ink shrink-0">₹{Number(e.amount).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end pt-2">
                    <button onClick={() => setToDelete(b)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 border border-line rounded-lg hover:bg-red-500/10 transition-colors">
                      <Trash2 size={12} /> Delete this history
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {toDelete && (
        <ConfirmModal
          title="Delete budget history"
          message={`Permanently delete "${toDelete.name}" and all ${expenses[Number(toDelete.id)]?.length ?? 0} expense(s) recorded under it? This cannot be undone.`}
          confirmText="Delete"
          onConfirm={async () => {
            await api.deleteAdhocBudget(Number(toDelete.id));
            setExpandedId(null);
            setToDelete(null);
            load();
          }}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
