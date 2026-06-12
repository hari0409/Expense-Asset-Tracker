import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { Asset, AssetTimelinePoint, AssetSnapshotRow, AssetManualEntry } from '../api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { Plus, Trash2, Pencil, TrendingUp, Eye, EyeOff, TrendingDown, Minus, Share2, ListPlus } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';

const ASSET_TYPES = ['Mutual Fund', 'Stocks', 'PPF', 'FD', 'Real Estate', 'Gold', 'Bank Savings', 'Crypto', 'NPS', 'EPF', 'Cash', 'Other'];
const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316','#84cc16','#14b8a6'];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function Assets() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [entriesAsset, setEntriesAsset] = useState<Asset | null>(null);
  const [filterType, setFilterType] = useState('');
  const [hidden, setHidden] = useState(false);
  const [timeline, setTimeline] = useState<AssetTimelinePoint[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);
  const [breakdown, setBreakdown] = useState<AssetSnapshotRow[]>([]);
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);
  const load = () => { api.getAssets().then(setAssets); api.getAssetsTimeline().then(setTimeline); };
  useEffect(() => { load(); }, []);

  // Deep link from Expenses page: "from withdrawal" badge opens that asset's manual entries.
  useEffect(() => {
    const id = searchParams.get('openEntries');
    if (!id || assets.length === 0) return;
    const asset = assets.find(a => Number(a.id) === Number(id));
    if (asset) setEntriesAsset(asset);
    const next = new URLSearchParams(searchParams);
    next.delete('openEntries');
    setSearchParams(next, { replace: true });
  }, [assets, searchParams]);

  const selectMonth = async (year: number, month: number) => {
    if (selectedMonth?.year === year && selectedMonth?.month === month) {
      setSelectedMonth(null); return;
    }
    setSelectedMonth({ year, month });
    const rows = await api.getAssetsTimelineMonth(year, month);
    setBreakdown(rows);
  };

  const filtered = filterType ? assets.filter(a => a.type === filterType) : assets;
  const includedAssets = assets.filter(a => a.include_in_total !== 0);
  const total = includedAssets.reduce((s, a) => s + Number(a.current_value), 0);
  const fmt = (n: number) => hidden ? '₹••••••' : `₹${n.toLocaleString('en-IN')}`;

  const byType: Record<string, number> = {};
  includedAssets.forEach(a => { byType[a.type] = (byType[a.type] || 0) + Number(a.current_value); });
  const pieData = Object.entries(byType).map(([name, value]) => ({ name, value }));

  const toggleInclude = async (asset: Asset) => {
    const updated = { name: asset.name, type: asset.type, base_value: asset.base_value, color: asset.color, notes: asset.notes, include_in_total: asset.include_in_total ? 0 : 1 };
    await api.updateAsset(Number(asset.id), updated);
    load();
  };

  const allIncluded = assets.length > 0 && assets.every(a => a.include_in_total !== 0);
  const toggleAll = async () => {
    const newVal = allIncluded ? 0 : 1;
    await Promise.all(assets.map(a => api.updateAsset(Number(a.id), { name: a.name, type: a.type, base_value: a.base_value, color: a.color, notes: a.notes, include_in_total: newVal })));
    load();
  };

  const types = [...new Set(assets.map(a => a.type))];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Net Assets</h1>
          <p className="text-lg font-bold text-indigo-400 mt-0.5">{fmt(total)}</p>
        </div>
        <div className="flex items-center gap-3">
          {assets.length > 0 && (
            <button
              onClick={toggleAll}
              className="text-xs text-ink-muted hover:text-ink border border-line hover:border-line-strong px-2 py-1.5 rounded-md transition-colors"
            >
              {allIncluded ? 'Deselect all' : 'Select all'}
            </button>
          )}
          <button
            onClick={() => setHidden(h => !h)}
            className="p-2 text-ink-faint hover:text-ink hover:bg-surface-2 rounded-lg transition-colors"
            title={hidden ? 'Show values' : 'Hide values'}
          >
            {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          {types.length > 0 && (
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All types</option>
              {types.map(t => <option key={t}>{t}</option>)}
            </select>
          )}
          <button
            onClick={() => navigate('/savings/mapping')}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-line-strong text-ink-muted rounded-lg hover:bg-surface-2 transition-colors"
            title="Map savings instruments to assets"
          >
            <Share2 size={15} /> Mapping config
          </button>
        </div>
      </div>

      {assets.length > 0 && (
        <div className="bg-surface rounded-2xl border border-line p-5">
          <div className="flex items-center gap-8">
            <div className="shrink-0">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={50}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`}
                    contentStyle={{ background: '#141418', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: '#f3f1ec' }}
                    labelStyle={{ color: '#9b9aa3' }}
                    itemStyle={{ color: '#f3f1ec' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2">
              {pieData.sort((a, b) => b.value - a.value).map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-ink-muted">{d.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium text-ink">{fmt(d.value)}</span>
                    <span className="text-xs text-ink-faint ml-2">({hidden ? '••%' : `${total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%`})</span>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-line flex justify-between font-semibold text-ink text-sm">
                <span>Total</span>
                <span>{fmt(total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {assets.length === 0 && (
        <div className="text-center py-16 text-ink-faint">
          <TrendingUp size={40} className="mx-auto mb-3" />
          <p className="text-lg mb-1">No assets tracked yet</p>
          <p className="text-sm">Add mutual funds, stocks, PPF, real estate etc.</p>
        </div>
      )}

      {timeline.length > 0 && (
        <div className="bg-surface rounded-2xl border border-line p-5">
          <h2 className="text-sm font-semibold text-ink-muted mb-4">Net worth over time <span className="font-normal text-ink-faint text-xs">— click a point to expand</span></h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={timeline.map(p => ({ ...p, label: `${MONTHS[p.month - 1]} ${p.year}`, total: Number(p.total) }))}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9b9aa3' }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9b9aa3' }} axisLine={false} tickLine={false} width={65} tickFormatter={v => `₹${(v / 100000).toFixed(1)}L`} domain={[(v: number) => Math.floor(v * 0.97), (v: number) => Math.ceil(v * 1.02)]} />
                <Tooltip
                  formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Net worth']}
                  contentStyle={{ background: '#141418', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: '#f3f1ec' }}
                  labelStyle={{ color: '#9b9aa3' }}
                  itemStyle={{ color: '#f3f1ec' }}
                  cursor={{ stroke: 'rgba(255,255,255,0.12)' }}
                />
                <Area
                  type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2}
                  fill="url(#netGrad)"
                  dot={(props) => {
                    const p = props.payload as AssetTimelinePoint;
                    const sel = selectedMonth?.year === p.year && selectedMonth?.month === p.month;
                    return <circle key={`${p.year}-${p.month}`} cx={props.cx} cy={props.cy} r={sel ? 6 : 4} fill={sel ? '#6366f1' : '#0a0a0c'} stroke="#6366f1" strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => selectMonth(p.year, p.month)} />;
                  }}
                  activeDot={(props: { cx?: number; cy?: number; payload?: AssetTimelinePoint }) => {
                    const p = props.payload;
                    return <circle cx={props.cx} cy={props.cy} r={6} fill="#6366f1" stroke="#0a0a0c" strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => { if (p) selectMonth(p.year, p.month); }} />;
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {selectedMonth && breakdown.length > 0 && (
            <div className="mt-5 pt-4 border-t border-line">
              <h3 className="text-sm font-semibold text-ink mb-3">
                {MONTHS[selectedMonth.month - 1]} {selectedMonth.year} breakdown
              </h3>
              <div className="space-y-2">
                {breakdown.map(row => (
                  <div key={row.asset_id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                      <span className="text-ink">{row.name}</span>
                      <span className="text-xs text-ink-faint bg-surface-2 px-1.5 py-0.5 rounded">{row.type}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {row.delta !== null && (
                        <span className={`flex items-center gap-0.5 text-xs font-medium ${row.delta > 0 ? 'text-emerald-400' : row.delta < 0 ? 'text-red-500' : 'text-ink-faint'}`}>
                          {row.delta > 0 ? <TrendingUp size={11} /> : row.delta < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                          {row.delta > 0 ? '+' : ''}{hidden ? '••••' : `₹${Math.abs(row.delta).toLocaleString('en-IN')}`}
                        </span>
                      )}
                      <span className="font-medium text-ink w-32 text-right">{hidden ? '₹••••••' : `₹${row.value.toLocaleString('en-IN')}`}</span>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-line flex justify-between font-semibold text-ink text-sm">
                  <span>Total</span>
                  <span>{hidden ? '₹••••••' : `₹${breakdown.reduce((s, r) => s + r.value, 0).toLocaleString('en-IN')}`}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(asset => (
          <div key={Number(asset.id)} className="bg-surface rounded-2xl border border-line p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: asset.color }} />
                  <span className="font-semibold text-ink">{asset.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs bg-surface-2 text-ink-muted px-2 py-0.5 rounded-full">{asset.type}</span>
                  <label className="flex items-center gap-1 text-xs text-ink-faint cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={asset.include_in_total !== 0}
                      onChange={() => toggleInclude(asset)}
                      className="accent-indigo-600"
                    />
                    In net total
                  </label>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEntriesAsset(asset)}
                  className="p-1.5 text-ink-faint hover:bg-surface-2 rounded-lg transition-colors" title="Manual entries">
                  <ListPlus size={14} />
                </button>
                <button onClick={() => { setEditing(asset); setShowModal(true); }}
                  className="p-1.5 text-ink-faint hover:bg-surface-2 rounded-lg transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={async () => { setAssetToDelete(asset); }}
                  className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <p className="text-2xl font-bold text-ink mt-3">{fmt(Number(asset.current_value))}</p>
            {Number(asset.current_value) !== Number(asset.base_value) && (
              <p className="text-[11px] text-ink-faint mt-0.5">
                base {fmt(Number(asset.base_value))} + contributions {fmt(Number(asset.current_value) - Number(asset.base_value))}
              </p>
            )}
            {total > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-ink-faint mb-1">
                  <span>{hidden ? '••%' : `${((Number(asset.current_value) / total) * 100).toFixed(1)}%`} of portfolio</span>
                  <span>Updated {asset.last_updated?.split('T')[0] ?? asset.last_updated}</span>
                </div>
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{
                    width: `${(Number(asset.current_value) / total) * 100}%`,
                    backgroundColor: asset.color,
                  }} />
                </div>
              </div>
            )}
            {asset.notes && <p className="text-xs text-ink-faint mt-2">{asset.notes}</p>}
          </div>
        ))}
      </div>

      {showModal && (
        <AssetModal initial={editing} onClose={() => setShowModal(false)} onSave={load} />
      )}
      {entriesAsset && (
        <AssetEntriesModal asset={entriesAsset} assets={assets} onClose={() => { setEntriesAsset(null); load(); }} />
      )}
      {assetToDelete && (
        <ConfirmModal
          title="Delete Asset"
          message={`Are you sure you want to delete "${assetToDelete.name}" (${assetToDelete.type})? This will remove all its entries and history.`}
          confirmText="Delete"
          onConfirm={async () => {
            await api.deleteAsset(Number(assetToDelete.id));
            setAssetToDelete(null);
            load();
          }}
          onCancel={() => setAssetToDelete(null)}
        />
      )}
    </div>
  );
}

function AssetEntriesModal({ asset, assets, onClose }: { asset: Asset; assets: Asset[]; onClose: () => void }) {
  const [entries, setEntries] = useState<AssetManualEntry[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [targets, setTargets] = useState<{ asset_id: string; amount: string; note: string }[]>([{ asset_id: '', amount: '', note: '' }]);
  const [err, setErr] = useState('');
  const [entryToDelete, setEntryToDelete] = useState<AssetManualEntry | null>(null);

  const loadEntries = () => api.getAssetEntries(Number(asset.id)).then(setEntries);
  useEffect(() => { loadEntries(); }, []);

  const resetForm = () => {
    setEditingId(null); setAmount(''); setNote('');
    setTargets([{ asset_id: '', amount: '', note: '' }]);
    setDate(new Date().toISOString().slice(0, 10));
  };

  // Only plain deposits (positive, not part of a transfer, not an adhoc-expense leg) can be edited inline.
  const isEditable = (e: AssetManualEntry) => Number(e.amount) > 0 && e.transfer_group == null && e.linked_unplanned_expense_id == null;

  const startEdit = (e: AssetManualEntry) => {
    setEditingId(e.id);
    setAmount(String(e.amount));
    setNote(e.note ?? '');
    setDate(e.date);
    setErr('');
  };

  const targetAssets = assets.filter(a => Number(a.id) !== Number(asset.id));
  const amountNum = Number(amount);
  const isWithdrawal = amount !== '' && !isNaN(amountNum) && amountNum < 0;
  const targetSum = targets.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const remainder = Math.round((Math.abs(amountNum) - targetSum) * 100) / 100;
  const transferReady = isWithdrawal && targets.some(t => t.asset_id && Number(t.amount) > 0) && remainder === 0;

  const setTarget = (i: number, patch: Partial<{ asset_id: string; amount: string; note: string }>) =>
    setTargets(ts => ts.map((t, idx) => idx === i ? { ...t, ...patch } : t));

  const save = async () => {
    const n = Number(amount);
    if (!amount || isNaN(n) || n === 0) return setErr('Enter a non-zero amount');
    setErr('');
    if (editingId) {
      // Inline edits are limited to plain positive deposits.
      if (n < 0) return setErr('Withdrawals are transfers — delete and re-add.');
      await api.updateAssetEntry(Number(asset.id), editingId, { amount: n, note: note || undefined, date });
    } else if (n < 0) {
      const clean = targets
        .filter(t => t.asset_id && Number(t.amount) > 0)
        .map(t => ({ asset_id: Number(t.asset_id), amount: Number(t.amount), note: t.note || undefined }));
      if (clean.length === 0) return setErr('Map the withdrawal to at least one target asset');
      if (remainder !== 0) return setErr('Target amounts must add up to the withdrawal');
      await api.createAssetEntry(Number(asset.id), { amount: n, note: note || undefined, date, targets: clean });
    } else {
      await api.createAssetEntry(Number(asset.id), { amount: n, note: note || undefined, date });
    }
    resetForm();
    loadEntries();
  };

  const remove = async (entryId: number) => {
    const entry = entries.find(e => e.id === entryId);
    if (entry) setEntryToDelete(entry);
  };

  const total = entries.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <Modal title={`Manual entries — ${asset.name}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <label className="block text-xs font-medium text-ink-muted mb-1">Amount (₹)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="e.g. 50000 or -10000"
              className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[10px] text-ink-faint mt-0.5">Positive = invest, negative = transfer out</p>
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-medium text-ink-muted mb-1">Note (optional)</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. SIP top-up"
              className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-medium text-ink-muted mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        {isWithdrawal && !editingId && (
          <div className="border border-line rounded-lg p-3 space-y-2 bg-surface-2/40">
            <p className="text-xs text-ink-muted">
              Withdrawals move money between assets — map the target(s). To spend money out of net worth, add it from the Expenses page instead.
            </p>
            {targets.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={t.asset_id} onChange={e => setTarget(i, { asset_id: e.target.value })}
                  className="flex-1 border border-line rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-surface"
                >
                  <option value="">Target asset…</option>
                  {targetAssets.map(a => <option key={Number(a.id)} value={String(a.id)}>{a.name}</option>)}
                </select>
                <input
                  type="number" value={t.amount} onChange={e => setTarget(i, { amount: e.target.value })}
                  placeholder="₹" className="w-28 border border-line rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  value={t.note} onChange={e => setTarget(i, { note: e.target.value })}
                  placeholder="Description (optional)" className="flex-1 border border-line rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {targets.length > 1 && (
                  <button onClick={() => setTargets(ts => ts.filter((_, idx) => idx !== i))} className="p-1 text-ink-faint hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button onClick={() => setTargets(ts => [...ts, { asset_id: '', amount: '', note: '' }])} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                <Plus size={12} /> Add target
              </button>
              <span className={`text-xs ${remainder === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {remainder === 0 ? 'Balanced' : `₹${Math.abs(remainder).toLocaleString('en-IN')} ${remainder > 0 ? 'left to map' : 'over'}`}
              </span>
            </div>
          </div>
        )}
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={isWithdrawal && !editingId && !transferReady}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} /> {editingId ? 'Save entry' : isWithdrawal ? 'Add transfer' : 'Add entry'}
          </button>
          {editingId && (
            <button onClick={resetForm} className="px-3 py-2 text-sm border border-line rounded-lg hover:bg-surface-2">Cancel</button>
          )}
        </div>

        {entries.length > 0 ? (
          <div className="border border-line rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-ink-muted">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Note</th>
                  <th className="text-right px-3 py-2">Amount</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map(e => (
                  <tr key={e.id} className={`hover:bg-surface-2 ${editingId === e.id ? 'bg-indigo-500/10' : ''}`}>
                    <td className="px-3 py-2 text-ink-muted whitespace-nowrap">{e.date}</td>
                    <td className="px-3 py-2 text-ink-muted">
                      {e.note ?? <span className="text-ink-faint">—</span>}
                      {e.linked_unplanned_expense_id != null && (
                        <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] rounded bg-red-500/10 text-red-500 align-middle">expense</span>
                      )}
                      {e.transfer_group != null && (
                        <span className="relative inline-block group ml-1.5 align-middle">
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-sky-500/10 text-sky-400">transfer</span>
                          {e.transfer_counterparty && (
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block whitespace-nowrap px-2 py-1 text-[11px] rounded bg-surface-2 border border-line text-ink shadow-lg z-10">
                              {Number(e.amount) >= 0 ? 'From' : 'To'} {e.transfer_counterparty}
                            </span>
                          )}
                        </span>
                      )}
                      {e.adhoc_budget_id != null && (
                        <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] rounded bg-purple-500/10 text-purple-400 align-middle">{e.adhoc_budget_name} spends</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${Number(e.amount) >= 0 ? 'text-emerald-400' : 'text-red-500'}`}>
                      {Number(e.amount) >= 0 ? '+' : ''}₹{Math.abs(Number(e.amount)).toLocaleString('en-IN')}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {isEditable(e) && (
                          <button onClick={() => startEdit(e)} className="p-1 text-ink-faint hover:bg-surface-2 rounded transition-colors">
                            <Pencil size={12} />
                          </button>
                        )}
                        {e.adhoc_budget_id != null ? (
                          <span title={`Total spent from the "${e.adhoc_budget_name}" budget — manage its expenses on the Expenses page`} className="p-1 text-ink-faint">
                            <Trash2 size={12} />
                          </span>
                        ) : (
                          <button onClick={() => remove(e.id)} className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-colors">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-2 text-xs font-semibold">
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-ink-muted">Total adjustment</td>
                  <td className={`px-3 py-2 text-right ${total >= 0 ? 'text-emerald-400' : 'text-red-500'}`}>
                    {total >= 0 ? '+' : ''}₹{Math.abs(total).toLocaleString('en-IN')}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-faint text-center py-4">No manual entries yet</p>
        )}

        <div className="flex justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2">Done</button>
        </div>
      </div>
      {entryToDelete && (
        <ConfirmModal
          title="Delete Entry"
          message={
            entryToDelete.transfer_group != null
              ? `This is a transfer — deleting it removes both legs (the withdrawal and the matching deposit). Continue?`
              : entryToDelete.linked_unplanned_expense_id != null
              ? `This withdrawal is an adhoc expense — deleting it also removes the expense and refunds the budget. Continue?`
              : `Are you sure you want to delete the entry from ${entryToDelete.date}? (₹${Math.abs(Number(entryToDelete.amount)).toLocaleString('en-IN')})`
          }
          confirmText="Delete"
          onConfirm={async () => {
            await api.deleteAssetEntry(Number(asset.id), entryToDelete.id);
            if (editingId === entryToDelete.id) resetForm();
            setEntryToDelete(null);
            loadEntries();
          }}
          onCancel={() => setEntryToDelete(null)}
        />
      )}
    </Modal>
  );
}

function AssetModal({ initial, onClose, onSave }: {
  initial: Asset | null; onClose: () => void; onSave: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(initial?.type ?? ASSET_TYPES[0]);
  const [value, setValue] = useState(String(initial?.base_value ?? ''));
  const [color, setColor] = useState(initial?.color ?? '#6366f1');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [err, setErr] = useState('');

  const save = async () => {
    if (!name.trim()) return setErr('Name required');
    try {
      const body = { name, type, base_value: Number(value) || 0, color, notes: notes || null };
      if (initial) await api.updateAsset(Number(initial.id), body);
      else await api.createAsset(body);
      onSave(); onClose();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <Modal title={initial ? 'Edit asset' : 'Add asset'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g., HDFC Flexi Cap Fund, SBI PPF Account"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Type</label>
          <select value={type} onChange={e => setType(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            {ASSET_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Base / market value (₹)</label>
          <input type="number" value={value} onChange={e => setValue(e.target.value)}
            placeholder="0"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          <p className="text-[11px] text-ink-faint mt-1">Contributions from mapped savings instruments are added on top of this.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Color</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="w-10 h-10 rounded border border-line cursor-pointer" />
            <div className="flex gap-2">
              {COLORS.slice(0, 8).map(c => (
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
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2">Cancel</button>
          <button onClick={save} className="flex-1 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Save</button>
        </div>
      </div>
    </Modal>
  );
}
