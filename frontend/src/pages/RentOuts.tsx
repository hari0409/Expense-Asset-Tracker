import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { RentOutPerson, RentOutEntry, Settlement } from '../api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { Plus, Trash2, Pencil, ChevronDown, ChevronUp, TableProperties, X, CreditCard, History } from 'lucide-react';

function evalFormula(raw: string): number | null {
  const expr = (raw.startsWith('=') ? raw.slice(1) : raw).replace(/−/g, '-');
  if (!expr.trim()) return null;
  if (!/^[\d\s+\-*/().,]+$/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr.replace(/,/g, '')})`)() as number;
    return typeof result === 'number' && isFinite(result) && result >= 0
      ? Math.round(result * 100) / 100
      : null;
  } catch { return null; }
}

function resolveAmount(raw: string): number | null {
  if (!raw.trim()) return null;
  if (raw.startsWith('=')) return evalFormula(raw);
  const n = Number(raw.replace(/,/g, ''));
  return isFinite(n) && n >= 0 ? n : null;
}

export default function RentOuts() {
  const [persons, setPersons] = useState<RentOutPerson[]>([]);
  const [entries, setEntries] = useState<RentOutEntry[]>([]);
  const [settlements, setSettlements] = useState<Record<number, Settlement[]>>({});
  const [expandedPerson, setExpandedPerson] = useState<number | null>(null);
  const [showPastFor, setShowPastFor] = useState<Set<number>>(new Set());
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState<RentOutPerson | null>(null);
  const [settlingPerson, setSettlingPerson] = useState<RentOutPerson | null>(null);
  const [returningEntry] = useState<RentOutEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<RentOutEntry | null>(null);
  const [personToDelete, setPersonToDelete] = useState<RentOutPerson | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<RentOutEntry | null>(null);
  const [settlementToDelete, setSettlementToDelete] = useState<Settlement | null>(null);

  const loadEntries = () => api.getRentOutEntries().then(setEntries);
  const loadSettlements = (personIds: number[]) =>
    Promise.all(personIds.map(id => api.getSettlements(id).then(s => ({ id, s }))))
      .then(results => setSettlements(Object.fromEntries(results.map(r => [r.id, r.s]))));
  const load = () => {
    api.getRentOutPersons().then(ps => {
      setPersons(ps);
      if (ps.length) loadSettlements(ps.map(p => Number(p.id)));
    });
    loadEntries();
  };

  useEffect(() => { load(); }, []);

  const entriesForPerson = (personId: number) =>
    entries.filter(e => Number(e.person_id) === personId);

  const totalOutstanding = persons.reduce((s, p) => s + Number(p.outstanding), 0);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Rent Outs</h1>
          {totalOutstanding > 0 && (
            <p className="text-sm text-amber-400 mt-0.5 font-medium">
              ₹{totalOutstanding.toLocaleString('en-IN')} total outstanding
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditingPerson(null); setShowPersonModal(true); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-surface-2 text-ink border border-line rounded-lg hover:border-line-strong transition-colors"
          >
            <Plus size={14} /> Add person
          </button>
          <button
            onClick={() => setShowBatchModal(true)}
            disabled={persons.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <TableProperties size={14} /> Add entries
          </button>
        </div>
      </div>

      {persons.length === 0 && (
        <div className="text-center py-16 text-ink-faint">
          <p className="text-lg mb-1">No persons yet</p>
          <p className="text-sm">Add people you lend money to</p>
        </div>
      )}

      {/* Person rows */}
      <div className="space-y-3">
        {persons.map(person => {
          const outstanding = Number(person.outstanding);
          const totalLent = Number(person.total_lent);
          const personEntries = entriesForPerson(Number(person.id));
          const expanded = expandedPerson === Number(person.id);
          const isSettled = outstanding === 0 && Number(person.entry_count) > 0;
          const showPast = showPastFor.has(Number(person.id));
          const togglePast = () => setShowPastFor(prev => {
            const next = new Set(prev);
            if (next.has(Number(person.id))) next.delete(Number(person.id));
            else next.add(Number(person.id));
            return next;
          });

          return (
            <div key={Number(person.id)} className="bg-surface rounded-2xl border border-line overflow-hidden">
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-surface-2 transition-colors"
                onClick={() => setExpandedPerson(expanded ? null : Number(person.id))}
              >
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: person.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink">{person.name}</span>
                    <div className="flex items-center gap-3 text-sm">
                      {outstanding > 0 ? (
                        <span className="font-semibold text-amber-400">₹{outstanding.toLocaleString('en-IN')} owed</span>
                      ) : (
                        <span className="text-emerald-400 font-medium text-xs">All settled</span>
                      )}
                      {isSettled && !showPast ? (
                        <span className="text-ink-faint text-xs">₹0 total · 0 loans</span>
                      ) : (
                        <span className="text-ink-faint text-xs">
                          ₹{totalLent.toLocaleString('en-IN')} total · {Number(person.entry_count)} loan{Number(person.entry_count) !== 1 ? 's' : ''}
                        </span>
                      )}
                      {isSettled && (
                        <button
                          onClick={e => { e.stopPropagation(); togglePast(); }}
                          className="flex items-center gap-1 text-xs text-ink-faint hover:text-indigo-400 transition-colors"
                        >
                          <History size={12} /> {showPast ? 'Hide past' : 'Show past'}
                        </button>
                      )}
                    </div>
                  </div>
                  {person.notes && <p className="text-xs text-ink-faint mt-0.5">{person.notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                  {outstanding > 0 && (
                    <button
                      onClick={() => { setSettlingPerson(person); setShowSettleModal(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      <CreditCard size={13} /> Settle
                    </button>
                  )}
                  <button
                    onClick={() => { setEditingPerson(person); setShowPersonModal(true); }}
                    className="p-1.5 text-ink-faint hover:bg-surface-2 rounded-lg transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setPersonToDelete(person)}
                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <button
                  onClick={() => setExpandedPerson(expanded ? null : Number(person.id))}
                  className="p-1.5 text-ink-faint hover:bg-surface-2 rounded-lg transition-colors shrink-0"
                >
                  {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {expanded && isSettled && !showPast && (
                <div className="border-t border-line text-center py-6">
                  <p className="text-sm text-ink-faint">All loans settled · history hidden</p>
                  <button
                    onClick={togglePast}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300"
                  >
                    <History size={13} /> Show past loans & settlements
                  </button>
                </div>
              )}

              {expanded && (!isSettled || showPast) && (
                <div className="border-t border-line">
                  {personEntries.length === 0 && (
                    <p className="text-sm text-ink-faint text-center py-5">No entries yet</p>
                  )}
                  {[...personEntries]
                    .sort((a, b) => a.date_given.localeCompare(b.date_given))
                    .map(entry => (
                      <div key={Number(entry.id)} className="flex items-center justify-between px-4 py-2 border-b border-line hover:bg-surface-2 group">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs text-ink-faint shrink-0">{entry.date_given}</span>
                          {entry.description && <span className="text-sm text-ink-muted truncate">{entry.description}</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <span className="text-sm font-medium text-ink">₹{Number(entry.amount).toLocaleString('en-IN')}</span>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingEntry(entry); setShowEditModal(true); }}
                              className="p-1 text-ink-faint hover:bg-surface-2 rounded transition-colors">
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => setEntryToDelete(entry)}
                              className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  {(settlements[Number(person.id)] ?? []).map(s => (
                    <div key={Number(s.id)} className="flex items-center justify-between px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/15 group">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full">Settled</span>
                        <span className="text-xs text-ink-faint">{s.date}</span>
                        {s.notes && <span className="text-xs text-ink-muted">{s.notes}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-emerald-400">₹{Number(s.amount).toLocaleString('en-IN')}</span>
                        <button
                          onClick={() => setSettlementToDelete(s)}
                          className="p-1 text-red-400 hover:bg-red-500/10 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete settlement record"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showPersonModal && (
        <PersonModal
          initial={editingPerson}
          onClose={() => setShowPersonModal(false)}
          onSave={load}
        />
      )}
      {showBatchModal && (
        <BatchEntryModal
          persons={persons}
          onClose={() => setShowBatchModal(false)}
          onSave={load}
        />
      )}
      {showSettleModal && settlingPerson && (
        <PersonSettleModal
          person={settlingPerson}
          onClose={() => setShowSettleModal(false)}
          onSave={load}
        />
      )}
      {showReturnModal && returningEntry && (
        <ReturnModal
          entry={returningEntry}
          onClose={() => setShowReturnModal(false)}
          onSave={load}
        />
      )}
      {showEditModal && editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          persons={persons}
          onClose={() => setShowEditModal(false)}
          onSave={load}
        />
      )}
      {personToDelete && (
        <ConfirmModal
          title="Delete Person"
          message={`Are you sure you want to delete all entries for "${personToDelete.name}"?`}
          confirmText="Delete"
          onConfirm={async () => { await api.deleteRentOutPerson(Number(personToDelete.id)); setPersonToDelete(null); load(); }}
          onCancel={() => setPersonToDelete(null)}
        />
      )}
      {entryToDelete && (
        <ConfirmModal
          title="Delete Entry"
          message={`Are you sure you want to delete the ₹${Number(entryToDelete.amount).toLocaleString('en-IN')} entry?`}
          confirmText="Delete"
          onConfirm={async () => { await api.deleteRentOutEntry(Number(entryToDelete.id)); setEntryToDelete(null); load(); }}
          onCancel={() => setEntryToDelete(null)}
        />
      )}
      {settlementToDelete && (
        <ConfirmModal
          title="Delete Settlement"
          message={`Are you sure you want to delete the settlement of ₹${Number(settlementToDelete.amount).toLocaleString('en-IN')}?`}
          confirmText="Delete"
          onConfirm={async () => { await api.deleteSettlement(Number(settlementToDelete.id)); setSettlementToDelete(null); load(); }}
          onCancel={() => setSettlementToDelete(null)}
        />
      )}
    </div>
  );
}

// ── Person modal ─────────────────────────────────────────────────────────────

function PersonModal({ initial, onClose, onSave }: {
  initial: RentOutPerson | null; onClose: () => void; onSave: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? '#f59e0b');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [err, setErr] = useState('');

  const save = async () => {
    if (!name.trim()) return setErr('Name required');
    try {
      if (initial) await api.updateRentOutPerson(Number(initial.id), { name, color, notes: notes || null });
      else await api.createRentOutPerson({ name, color, notes: notes || null });
      onSave(); onClose();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <Modal title={initial ? 'Edit person' : 'Add person'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Ravi, Appa"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Color</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="w-10 h-10 rounded border border-line cursor-pointer" />
            <div className="flex gap-2">
              {['#f59e0b','#6366f1','#10b981','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316'].map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-ink scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Notes (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2">Cancel</button>
          <button onClick={save} className="flex-1 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700">Save</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Batch entry modal ─────────────────────────────────────────────────────────

interface BatchRow {
  id: string;
  personId: string;
  desc: string;
  amount: string;
  date: string;
}

function makRow(defaultPersonId: string): BatchRow {
  return { id: crypto.randomUUID(), personId: defaultPersonId, desc: '', amount: '', date: new Date().toISOString().split('T')[0] };
}

function BatchEntryModal({ persons, onClose, onSave }: {
  persons: RentOutPerson[]; onClose: () => void; onSave: () => void;
}) {
  const defaultPerson = String(persons[0]?.id ?? '');
  const [selectedPerson, setSelectedPerson] = useState(defaultPerson);
  const [rows, setRows] = useState<BatchRow[]>([makRow(defaultPerson)]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showDescFor, setShowDescFor] = useState<Set<string>>(new Set());
  const [showDateFor, setShowDateFor] = useState<Set<string>>(new Set());
  const tableRef = useRef<HTMLDivElement>(null);
  const amountRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const toggleDesc = (id: string) => setShowDescFor(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleDate = (id: string) => setShowDateFor(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const update = (id: string, field: keyof BatchRow, val: string) =>
    setRows(r => r.map(row => row.id === id ? { ...row, [field]: val } : row));

  const addRowAndFocus = () => {
    const newRow = makRow(selectedPerson);
    setRows(r => [...r, newRow]);
    setTimeout(() => {
      amountRefs.current.get(newRow.id)?.focus();
      tableRef.current?.scrollTo({ top: tableRef.current.scrollHeight, behavior: 'smooth' });
    }, 30);
  };

  const handleAmountKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      addRowAndFocus();
    }
  };

  const save = async () => {
    if (!selectedPerson) return setErr('Select a person first');
    setErr('');
    const valid = rows.filter(r => r.amount.trim());
    if (valid.length === 0) return setErr('Add at least one amount');
    if (valid.some(r => resolveAmount(r.amount) === null)) return setErr('Invalid amount or formula');
    setSaving(true);
    try {
      await Promise.all(valid.map(r => api.createRentOutEntry({
        person_id: Number(selectedPerson),
        amount: resolveAmount(r.amount)!,
        description: r.desc || null,
        date_given: r.date,
      })));
      onSave(); onClose();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const validCount = rows.filter(r => r.amount.trim() && resolveAmount(r.amount) !== null).length;
  const selectedPersonName = persons.find(p => String(p.id) === selectedPerson)?.name ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-line rounded-2xl shadow-2xl shadow-black/50 w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header with person picker */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-ink mb-2">Add loan entries for</h2>
            <select
              value={selectedPerson}
              onChange={e => setSelectedPerson(e.target.value)}
              className="w-full border border-amber-500/25 bg-amber-500/10 rounded-lg px-3 py-2 text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-amber-400"
            >
              {persons.map(p => <option key={Number(p.id)} value={Number(p.id)}>{p.name}</option>)}
            </select>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink ml-4 shrink-0"><X size={20} /></button>
        </div>

        <div ref={tableRef} className="flex-1 overflow-y-auto px-5 pt-3 pb-2">
          <p className="text-xs text-ink-faint mb-3">
            Formulas: <code className="bg-surface-2 px-1 rounded text-amber-400">=500+200</code> · Tab / Enter → next row
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-muted uppercase tracking-wide">
                <th className="text-left pb-2 pr-2 font-medium w-[42%]">Amount</th>
                <th className="text-left pb-2 pr-2 font-medium w-[22%]">Date</th>
                <th className="text-left pb-2 pr-2 font-medium w-[32%]">Description</th>
                <th className="pb-2 w-[4%]" />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const fResult = row.amount.startsWith('=') ? evalFormula(row.amount) : null;
                const fInvalid = row.amount.startsWith('=') && row.amount.length > 1 && fResult === null;
                const hasDesc = showDescFor.has(row.id);
                const hasDate = showDateFor.has(row.id);
                return (
                  <tr key={row.id} className="group">
                    <td className="pr-2 pb-1.5">
                      <div className="relative">
                        <input
                          ref={el => { if (el) amountRefs.current.set(row.id, el); else amountRefs.current.delete(row.id); }}
                          value={row.amount}
                          onChange={e => update(row.id, 'amount', e.target.value)}
                          onKeyDown={handleAmountKeyDown}
                          placeholder="1000 or =500+200"
                          className={`w-full border rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 ${fInvalid ? 'border-red-500/25 focus:ring-red-500/25' : 'border-line focus:ring-amber-400'} ${fResult ? 'pr-20' : ''}`}
                        />
                        {fResult !== null && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-emerald-400 font-medium pointer-events-none whitespace-nowrap">
                            ₹{fResult.toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="pr-2 pb-1.5">
                      {hasDate ? (
                        <div className="flex items-center gap-1">
                          <input type="date" value={row.date} onChange={e => update(row.id, 'date', e.target.value)}
                            className="flex-1 border border-line rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400" />
                          <button onClick={() => toggleDate(row.id)} className="p-1 text-ink-faint hover:text-ink-muted"><X size={12} /></button>
                        </div>
                      ) : (
                        <button onClick={() => toggleDate(row.id)}
                          className="text-xs text-ink-faint hover:text-amber-400 px-2 py-1.5 rounded-lg hover:bg-amber-500/10 transition-colors whitespace-nowrap">
                          + date
                        </button>
                      )}
                    </td>
                    <td className="pr-2 pb-1.5">
                      {hasDesc ? (
                        <div className="flex items-center gap-1">
                          <input value={row.desc} onChange={e => update(row.id, 'desc', e.target.value)}
                            placeholder="what for?"
                            className="flex-1 border border-line rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400" />
                          <button onClick={() => { update(row.id, 'desc', ''); toggleDesc(row.id); }}
                            className="p-1 text-ink-faint hover:text-ink-muted"><X size={12} /></button>
                        </div>
                      ) : (
                        <button onClick={() => toggleDesc(row.id)}
                          className="text-xs text-ink-faint hover:text-amber-400 px-2 py-1.5 rounded-lg hover:bg-amber-500/10 transition-colors whitespace-nowrap">
                          + desc
                        </button>
                      )}
                    </td>
                    <td className="pb-1.5 text-center">
                      <button onClick={() => setRows(r => r.filter(x => x.id !== row.id))}
                        className="p-1 text-ink-faint hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button onClick={addRowAndFocus}
            className="mt-1 flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300 font-medium px-2 py-1 rounded-lg hover:bg-amber-500/10 transition-colors">
            <Plus size={14} /> Add row
          </button>
        </div>

        <div className="px-5 py-4 border-t border-line shrink-0 flex items-center justify-between gap-4">
          <div className="text-sm text-ink-muted">
            {validCount > 0
              ? <span className="text-amber-400 font-medium">{validCount} entr{validCount !== 1 ? 'ies' : 'y'} for {selectedPersonName}</span>
              : 'Fill amount to save'}
          </div>
          <div className="flex items-center gap-2">
            {err && <span className="text-sm text-red-400">{err}</span>}
            <button onClick={onClose} className="px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2">Cancel</button>
            <button onClick={save} disabled={saving || validCount === 0}
              className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? 'Saving…' : `Save ${validCount > 0 ? validCount : ''} entr${validCount !== 1 ? 'ies' : 'y'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Person settle modal ───────────────────────────────────────────────────────

function PersonSettleModal({ person, onClose, onSave }: {
  person: RentOutPerson; onClose: () => void; onSave: () => void;
}) {
  const outstanding = Math.round(Number(person.outstanding) * 100) / 100;
  const [amount, setAmount] = useState(String(outstanding));
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ settled: number; leftover: number } | null>(null);
  const [err, setErr] = useState('');

  const save = async () => {
    const n = Number(amount);
    if (!n || n <= 0) return setErr('Enter amount > 0');
    setSaving(true);
    try {
      const res = await api.settlePerson(Number(person.id), n);
      setResult(res);
      onSave();
      if (res.leftover <= 0) onClose();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title={`Settle — ${person.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-amber-500/10 border border-amber-500/15 rounded-lg px-4 py-3">
          <p className="text-sm text-ink-muted">Total outstanding</p>
          <p className="text-2xl font-bold text-amber-400">₹{outstanding.toLocaleString('en-IN')}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Amount received (₹)</label>
          <input
            autoFocus
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="text-xs text-ink-faint mt-1">Applied oldest-first across all pending loans</p>
        </div>
        {result && result.leftover > 0 && (
          <p className="text-sm text-amber-400">₹{result.settled.toLocaleString('en-IN')} settled · ₹{result.leftover.toLocaleString('en-IN')} still outstanding</p>
        )}
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40"
          >
            {saving ? 'Settling…' : 'Settle'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Return modal ──────────────────────────────────────────────────────────────

function ReturnModal({ entry, onClose, onSave }: {
  entry: RentOutEntry; onClose: () => void; onSave: () => void;
}) {
  const outstanding = Number(entry.amount) - Number(entry.amount_returned);
  const [returned, setReturned] = useState('');
  const [err, setErr] = useState('');

  const settle = async (amount: number) => {
    if (amount <= 0) return setErr('Amount must be > 0');
    if (amount > outstanding) return setErr(`Max ₹${outstanding.toLocaleString('en-IN')}`);
    try {
      await api.recordReturn(Number(entry.id), Number(entry.amount_returned) + amount);
      onSave(); onClose();
    } catch (e: any) { setErr(e.message); }
  };

  const customAmount = Number(returned);

  return (
    <Modal title="Settle loan" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-amber-500/10 border border-amber-500/15 rounded-lg px-4 py-3">
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{entry.person_name}</span>
            {entry.description ? <span className="text-ink-muted"> · {entry.description}</span> : null}
          </p>
          <p className="text-lg font-bold text-amber-400 mt-0.5">₹{outstanding.toLocaleString('en-IN')} outstanding</p>
          {Number(entry.amount_returned) > 0 && (
            <p className="text-xs text-ink-muted mt-0.5">₹{Number(entry.amount_returned).toLocaleString('en-IN')} already returned of ₹{Number(entry.amount).toLocaleString('en-IN')} total</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => settle(outstanding)}
            className="flex-1 px-3 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Settle full ₹{outstanding.toLocaleString('en-IN')}
          </button>
        </div>

        <div className="relative flex items-center gap-2">
          <div className="flex-1 border-t border-line" />
          <span className="text-xs text-ink-faint shrink-0">or partial amount</span>
          <div className="flex-1 border-t border-line" />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1">Amount received now (₹)</label>
          <input
            autoFocus
            type="number"
            value={returned}
            onChange={e => setReturned(e.target.value)}
            placeholder={`up to ₹${outstanding.toLocaleString('en-IN')}`}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2">Cancel</button>
          <button
            onClick={() => settle(customAmount)}
            disabled={!returned || customAmount <= 0}
            className="flex-1 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Record ₹{customAmount > 0 ? customAmount.toLocaleString('en-IN') : '—'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Edit entry modal ──────────────────────────────────────────────────────────

function EditEntryModal({ entry, persons, onClose, onSave }: {
  entry: RentOutEntry; persons: RentOutPerson[]; onClose: () => void; onSave: () => void;
}) {
  const [personId, setPersonId] = useState(String(entry.person_id));
  const [amount, setAmount] = useState(String(entry.amount));
  const [desc, setDesc] = useState(entry.description ?? '');
  const [date, setDate] = useState(entry.date_given);
  const [status, setStatus] = useState(entry.status);
  const [amountReturned, setAmountReturned] = useState(String(entry.amount_returned));
  const [err, setErr] = useState('');

  const fResult = amount.startsWith('=') ? evalFormula(amount) : null;

  const save = async () => {
    const resolved = resolveAmount(amount);
    if (resolved === null) return setErr('Invalid amount or formula');
    try {
      await api.updateRentOutEntry(Number(entry.id), {
        person_id: Number(personId), amount: resolved, description: desc || null,
        date_given: date, status, amount_returned: Number(amountReturned),
      });
      onSave(); onClose();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <Modal title="Edit entry" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Person</label>
          <select value={personId} onChange={e => setPersonId(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500">
            {persons.map(p => <option key={Number(p.id)} value={Number(p.id)}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Amount (₹ or formula)</label>
          <div className="relative">
            <input value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="1000 or =500+200"
              className={`w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 ${fResult ? 'pr-24' : ''}`} />
            {fResult !== null && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-emerald-400 font-medium pointer-events-none">
                = ₹{fResult.toLocaleString('en-IN')}
              </span>
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Description</label>
          <input value={desc} onChange={e => setDesc(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as RentOutEntry['status'])}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500">
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Returned (₹)</label>
            <input type="number" value={amountReturned} onChange={e => setAmountReturned(e.target.value)}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
        </div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2">Cancel</button>
          <button onClick={save} className="flex-1 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700">Save</button>
        </div>
      </div>
    </Modal>
  );
}
