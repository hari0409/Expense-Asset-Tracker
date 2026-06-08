import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { SavingsInstrument, SavingsEntry, Asset } from '../api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import MonthPicker from '../components/MonthPicker';
import { Trash2, Pencil, CheckCheck, Camera, RotateCcw, Link2Off } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';

const SAVING_TYPES = ['SIP', 'PPF', 'Bank Savings', 'FD', 'RD', 'NPS', 'Stocks', 'Crypto', 'Cash', 'Other'];
const now = new Date();
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function Savings() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [instruments, setInstruments] = useState<SavingsInstrument[]>([]);
  const [entries, setEntries] = useState<SavingsEntry[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showInstrModal, setShowInstrModal] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingInstr, setEditingInstr] = useState<SavingsInstrument | null>(null);
  const [editingEntry, setEditingEntry] = useState<SavingsEntry | null>(null);
  const [defaultInstrId, setDefaultInstrId] = useState<number | null>(null);
  const [recording, setRecording] = useState<Set<number>>(new Set());
  const [snapshotStatus, setSnapshotStatus] = useState<{ exists: boolean; stale: boolean } | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<SavingsEntry | null>(null);
  const [instrToDelete, setInstrToDelete] = useState<SavingsInstrument | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const loadInstruments = () => api.getInstruments().then(setInstruments);
  const loadEntries = () => api.getSavingsEntries({ month, year }).then(setEntries);
  const loadAssets = () => api.getAssets().then(setAssets);
  const loadSnapshotStatus = (m: number, y: number) => api.getSnapshotStatus(m, y).then(s => setSnapshotStatus({ exists: s.exists, stale: s.stale }));

  const assetName = (id: number | null) => id == null ? null : (assets.find(a => Number(a.id) === Number(id))?.name ?? null);

  useEffect(() => { loadInstruments(); loadAssets(); }, []);
  useEffect(() => { loadEntries(); loadSnapshotStatus(month, year); }, [month, year]);

  const goMap = (instrId?: number) => navigate(`/savings/mapping${instrId ? `?focus=${instrId}` : ''}`);

  // Records are the source of truth; asset values derive on the backend. No client-side sync.
  const doRecord = async (instr: SavingsInstrument, currentEntries?: SavingsEntry[]) => {
    const id = Number(instr.id);
    const amount = Number(instr.monthly_target);
    setRecording(s => new Set(s).add(id));
    try {
      await api.createSavingsEntry({ instrument_id: id, amount, month, year, notes: 'Auto-recorded' });
      const newEntries = await api.getSavingsEntries({ month, year });
      setEntries(newEntries);
      const alreadyRecorded = currentEntries ?? entries;
      const allDone = instruments.every(i =>
        Number(i.id) === id ||
        alreadyRecorded.some(e => Number(e.instrument_id) === Number(i.id))
      );
      if (allDone) { await api.snapshotAllAssets(month, year); loadSnapshotStatus(month, year); }
      loadAssets();
    } catch (e: any) {
      if (String(e.message).includes('not mapped')) goMap(id);
    } finally {
      setRecording(s => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  const quickRecord = (instr: SavingsInstrument) => {
    if (Number(instr.monthly_target) <= 0) return;
    if (instr.asset_id == null) { goMap(Number(instr.id)); return; } // must map before recording
    doRecord(instr);
  };

  const deleteEntry = async (entry: SavingsEntry) => {
    setEntryToDelete(entry);
  };

  const recordAll = async () => {
    const unrecorded = instruments.filter(i => i.asset_id != null && !entries.find(e => Number(e.instrument_id) === Number(i.id)));
    for (const instr of unrecorded) await doRecord(instr);
    await api.snapshotAllAssets(month, year); loadSnapshotStatus(month, year);
    loadAssets();
  };

  const resetAll = async () => {
    setShowResetConfirm(true);
  };

  const totalTarget = instruments.reduce((s, i) => s + Number(i.monthly_target), 0);
  const totalSaved = entries.reduce((s, e) => s + Number(e.amount), 0);
  const unmappedCount = instruments.filter(i => i.asset_id == null).length;

  const entryForInstr = (instrId: number) => entries.find(e => Number(e.instrument_id) === instrId);

  const chartData = instruments.map(i => {
    const entry = entryForInstr(Number(i.id));
    return { name: i.name, target: Number(i.monthly_target), saved: entry ? Number(entry.amount) : 0, color: i.color };
  });

  const mappableUnrecorded = instruments.some(i => i.asset_id != null && !entries.find(e => Number(e.instrument_id) === Number(i.id)));

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Savings</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            Monthly target: ₹{totalTarget.toLocaleString('en-IN')} &nbsp;|&nbsp;
            Saved this month: ₹{totalSaved.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/savings/mapping')}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-line-strong text-ink rounded-lg hover:border-indigo-400/40 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
          >
            Mapping
            {unmappedCount > 0 && <span className="text-[11px] font-semibold bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full">{unmappedCount}</span>}
          </button>
          {snapshotStatus !== null && (
            <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${snapshotStatus.exists && !snapshotStatus.stale ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${snapshotStatus.exists && !snapshotStatus.stale ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              {!snapshotStatus.exists ? 'No snapshot' : snapshotStatus.stale ? 'Snapshot stale' : 'Snapshot saved'}
            </span>
          )}
          {entries.length > 0 && entries.length < instruments.length && (
            <button
              onClick={async () => { await api.snapshotAllAssets(month, year); loadSnapshotStatus(month, year); }}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-line-strong text-ink rounded-lg hover:border-amber-400/40 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
              title="Save current asset values as a snapshot for this month"
            >
              <Camera size={15} /> Save snapshot
            </button>
          )}
          {instruments.length > 0 && (
            mappableUnrecorded ? (
              <button
                onClick={recordAll}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg shadow hover:bg-emerald-700 transition-colors"
              >
                <CheckCheck size={15} /> Record all
              </button>
            ) : entries.length > 0 ? (
              <button
                onClick={resetAll}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-line-strong text-ink-muted rounded-lg hover:bg-red-500/10 hover:border-red-500/25 hover:text-red-400 transition-colors"
              >
                <RotateCcw size={15} /> Reset records
              </button>
            ) : null
          )}
          {(month !== now.getMonth() + 1 || year !== now.getFullYear()) && (
            <button
              onClick={() => { setMonth(now.getMonth() + 1); setYear(now.getFullYear()); }}
              className="text-xs text-ink-muted hover:text-ink border border-line hover:border-line-strong px-2 py-1 rounded-md transition-colors"
              title="Go to current month"
            >
              Today
            </button>
          )}
          <MonthPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
        </div>
      </div>

      {instruments.length > 0 && (
        <div className="bg-surface rounded-2xl border border-line p-5">
          <h2 className="text-sm font-semibold text-ink-muted mb-4">Target vs Saved</h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9b9aa3' }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9b9aa3' }} axisLine={false} tickLine={false} width={55} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`}
                  contentStyle={{ background: '#141418', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: '#f3f1ec' }}
                  labelStyle={{ color: '#9b9aa3' }}
                  itemStyle={{ color: '#f3f1ec' }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#9b9aa3' }} />
                <Bar dataKey="target" name="Target" fill="#2d2d35" radius={[3, 3, 0, 0]} />
                <Bar dataKey="saved" name="Saved" radius={[3, 3, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {instruments.length === 0 && (
        <div className="text-center py-16 text-ink-faint">
          <p className="text-lg mb-1">No savings instruments yet</p>
          <p className="text-sm">Add SIP, PPF, bank savings etc.</p>
        </div>
      )}

      {(() => {
        const withState = instruments.map(instr => {
          const entry = entryForInstr(Number(instr.id));
          const saved = entry ? Number(entry.amount) : 0;
          const target = Number(instr.monthly_target);
          const complete = !!entry && target > 0 && saved >= target;
          return { instr, entry, saved, target, complete };
        });
        const incomplete = withState.filter(s => !s.complete);
        const complete = withState.filter(s => s.complete);

        return (
          <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {incomplete.map(({ instr, entry, saved, target }) => {
          const pct = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
          const unmapped = instr.asset_id == null;
          const mappedTo = assetName(instr.asset_id);
          const pending = !unmapped;

          return (
            <div key={Number(instr.id)} className={`bg-surface rounded-2xl border p-4 ${unmapped ? 'border-amber-500/25 ring-1 ring-amber-500/20' : pending ? 'border-orange-400/50 ring-1 ring-orange-400/25' : 'border-line'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: instr.color }} />
                    <span className="font-semibold text-ink">{instr.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-xs text-ink-muted bg-surface-2 px-2 py-0.5 rounded-full">{instr.type}</span>
                    {unmapped ? (
                      <button
                        onClick={() => goMap(Number(instr.id))}
                        className="flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full hover:bg-amber-500/20 transition-colors"
                        title="This instrument isn't mapped to any asset. Map it to record."
                      >
                        <Link2Off size={11} /> Unmapped — map
                      </button>
                    ) : mappedTo && (
                      <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">→ {mappedTo}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setEditingInstr(instr); setShowInstrModal(true); }}
                    className="p-1.5 text-ink-faint hover:bg-surface-2 rounded-lg transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setInstrToDelete(instr)}
                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">This month</span>
                  <span className="font-medium text-ink">₹{saved.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-xs text-ink-faint">
                  <span>Target: ₹{target.toLocaleString('en-IN')}/mo</span>
                  <span>{pct.toFixed(0)}%</span>
                </div>
                {target > 0 && (
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: instr.color }} />
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-line">
                {entry ? (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-ink-muted">
                      ₹{Number(entry.amount).toLocaleString('en-IN')} recorded
                      {mappedTo && <span className="text-ink-faint"> · {mappedTo}</span>}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditingEntry(entry); setDefaultInstrId(null); setShowEntryModal(true); }}
                        className="p-1 text-ink-faint hover:text-ink"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => deleteEntry(entry)}
                        className="p-1 text-red-400 hover:text-red-300"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ) : unmapped ? (
                  <button
                    onClick={() => goMap(Number(instr.id))}
                    className="w-full text-sm text-amber-400 hover:text-amber-300 font-medium py-1 transition-colors"
                  >
                    Map to an asset to record
                  </button>
                ) : (
                  <button
                    onClick={() => quickRecord(instr)}
                    disabled={recording.has(Number(instr.id)) || Number(instr.monthly_target) <= 0}
                    className="w-full text-sm text-emerald-400 hover:text-emerald-300 font-medium py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {recording.has(Number(instr.id)) ? 'Recording…' : `+ Record ₹${Number(instr.monthly_target).toLocaleString('en-IN')} for ${MONTHS[month-1]}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {complete.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-muted flex items-center gap-1.5">
            <CheckCheck size={15} className="text-emerald-500" /> Completed this month ({complete.length})
          </h2>
          <div className="space-y-1.5">
            {complete.map(({ instr, entry, saved }) => {
              const mappedTo = assetName(instr.asset_id);
              return (
                <div key={Number(instr.id)} className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/15 rounded-lg px-3 py-2 group">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: instr.color }} />
                  <span className="text-sm font-medium text-ink truncate">{instr.name}</span>
                  <span className="text-[11px] text-ink-muted bg-surface-2 px-1.5 py-0.5 rounded-full shrink-0">{instr.type}</span>
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 shrink-0">
                    <CheckCheck size={12} /> Recorded
                  </span>
                  {mappedTo && <span className="text-xs text-indigo-500 truncate">→ {mappedTo}</span>}
                  <span className="ml-auto text-sm font-semibold text-ink shrink-0">₹{saved.toLocaleString('en-IN')}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => { setEditingEntry(entry!); setDefaultInstrId(null); setShowEntryModal(true); }}
                      className="p-1 text-ink-faint hover:text-ink"
                    >
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => deleteEntry(entry!)} className="p-1 text-red-400 hover:text-red-300">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
          </>
        );
      })()}

      {showInstrModal && (
        <InstrumentModal
          initial={editingInstr}
          onClose={() => setShowInstrModal(false)}
          onSaved={(created) => {
            loadInstruments(); loadEntries();
            if (created) goMap(Number(created.id)); // new instrument → mapping canvas
          }}
        />
      )}
      {showEntryModal && (
        <EntryModal
          initial={editingEntry}
          instruments={instruments}
          defaultInstrId={defaultInstrId}
          month={month}
          year={year}
          onClose={() => setShowEntryModal(false)}
          onSave={() => { loadEntries(); loadAssets(); }}
        />
      )}
      {entryToDelete && (
        <ConfirmModal
          title="Delete Entry"
          message={`Are you sure you want to delete ₹${Number(entryToDelete.amount).toLocaleString('en-IN')} from ${entryToDelete.notes || 'Untitled'}?`}
          confirmText="Delete"
          onConfirm={async () => {
            await api.deleteSavingsEntry(Number(entryToDelete.id));
            await api.deleteSnapshot(month, year);
            setSnapshotStatus({ exists: false, stale: false });
            setEntryToDelete(null);
            loadEntries(); loadAssets();
          }}
          onCancel={() => setEntryToDelete(null)}
        />
      )}
      {instrToDelete && (
        <ConfirmModal
          title="Delete Instrument"
          message={`Are you sure you want to delete "${instrToDelete.name}" (${instrToDelete.type})? This will also remove its savings entries.`}
          confirmText="Delete"
          onConfirm={async () => {
            await api.deleteInstrument(Number(instrToDelete.id));
            setInstrToDelete(null);
            loadInstruments(); loadEntries(); loadAssets();
          }}
          onCancel={() => setInstrToDelete(null)}
        />
      )}
      {showResetConfirm && (
        <ConfirmModal
          title="Reset All Records"
          message={`Are you sure you want to delete all ${entries.length} savings record(s) for ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]} ${year}? This will clear the snapshot.`}
          confirmText="Reset"
          onConfirm={async () => {
            for (const entry of entries) await api.deleteSavingsEntry(Number(entry.id));
            await api.deleteSnapshot(month, year);
            setSnapshotStatus({ exists: false, stale: false });
            setShowResetConfirm(false);
            loadEntries(); loadAssets();
          }}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
    </div>
  );
}

function InstrumentModal({ initial, onClose, onSaved }: {
  initial: SavingsInstrument | null; onClose: () => void; onSaved: (created: SavingsInstrument | null) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(initial?.type ?? SAVING_TYPES[0]);
  const [color, setColor] = useState(initial?.color ?? '#10b981');
  const [target, setTarget] = useState(String(initial?.monthly_target ?? ''));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [err, setErr] = useState('');

  const save = async () => {
    if (!name.trim()) return setErr('Name required');
    try {
      const body = { name, type, color, monthly_target: Number(target), notes: notes || null };
      if (initial) { await api.updateInstrument(Number(initial.id), body); onSaved(null); }
      else { const created = await api.createInstrument(body); onSaved(created); }
      onClose();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <Modal title={initial ? 'Edit instrument' : 'Add savings instrument'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g., HDFC SIP, SBI PPF"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Type</label>
          <select value={type} onChange={e => setType(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
            {SAVING_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Monthly target (₹)</label>
          <input type="number" value={target} onChange={e => setTarget(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Color</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="w-10 h-10 rounded border border-line cursor-pointer" />
            <div className="flex gap-2">
              {['#10b981','#6366f1','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316'].map(c => (
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
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        {!initial && <p className="text-xs text-ink-faint">After saving, you'll map this instrument to an asset.</p>}
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2">Cancel</button>
          <button onClick={save} className="flex-1 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Save</button>
        </div>
      </div>
    </Modal>
  );
}

function EntryModal({ initial, instruments, defaultInstrId, month, year, onClose, onSave }: {
  initial: SavingsEntry | null; instruments: SavingsInstrument[];
  defaultInstrId: number | null; month: number; year: number;
  onClose: () => void; onSave: () => void;
}) {
  const [instrId, setInstrId] = useState(String(initial?.instrument_id ?? defaultInstrId ?? instruments[0]?.id ?? ''));
  const [amount, setAmount] = useState(String(initial?.amount ?? ''));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [err, setErr] = useState('');

  const save = async () => {
    if (!amount || !instrId) return setErr('Instrument and amount required');
    try {
      const body = { instrument_id: Number(instrId), amount: Number(amount), month, year, notes: notes || null };
      if (initial) await api.updateSavingsEntry(Number(initial.id), { amount: Number(amount), notes: notes || null });
      else await api.createSavingsEntry(body);
      onSave();
      onClose();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <Modal title={initial ? 'Edit entry' : 'Record savings'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Instrument</label>
          <select value={instrId} onChange={e => setInstrId(e.target.value)} disabled={!!initial}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-surface-2">
            {instruments.map(i => <option key={Number(i.id)} value={Number(i.id)}>{i.name} ({i.type})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Amount (₹)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Notes (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2">Cancel</button>
          <button onClick={save} className="flex-1 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Save</button>
        </div>
      </div>
    </Modal>
  );
}
