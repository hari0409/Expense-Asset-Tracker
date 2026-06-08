import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, Panel, Handle, Position,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection, type NodeProps, type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from '../api';
import type { SavingsInstrument, Asset } from '../api';
import { Plus, ArrowLeft, LayoutGrid } from 'lucide-react';

const ASSET_TYPES = ['Mutual Fund', 'Stocks', 'PPF', 'FD', 'Real Estate', 'Gold', 'Bank Savings', 'Crypto', 'NPS', 'EPF', 'Cash', 'Other'];
const SAVING_TYPES = ['SIP', 'PPF', 'Bank Savings', 'FD', 'RD', 'NPS', 'Stocks', 'Crypto', 'Cash', 'Other'];
const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316'];

const COL_X_INSTR = 60;
const COL_X_ASSET = 520;
const ROW_H = 96;

const instrNodeId = (id: number) => `i${id}`;
const assetNodeId = (id: number) => `a${id}`;
const parseInstrId = (nodeId: string) => Number(nodeId.slice(1));
const parseAssetId = (nodeId: string) => Number(nodeId.slice(1));

// Two-column layout: instruments left, assets right.
function layoutNodes(instruments: SavingsInstrument[], assets: Asset[], focusId: number | null): Node[] {
  const instrNodes: Node[] = instruments.map((i, idx) => ({
    id: instrNodeId(Number(i.id)),
    type: 'instrument',
    position: { x: COL_X_INSTR, y: 40 + idx * ROW_H },
    data: { label: i.name, type: i.type, color: i.color, mapped: i.asset_id != null, focused: Number(i.id) === focusId } as InstrData,
  }));
  const assetNodes: Node[] = assets.map((a, idx) => ({
    id: assetNodeId(Number(a.id)),
    type: 'asset',
    position: { x: COL_X_ASSET, y: 40 + idx * ROW_H },
    data: { label: a.name, type: a.type, color: a.color, value: a.current_value } as AssetData,
  }));
  return [...instrNodes, ...assetNodes];
}

// ---- custom nodes ----
type InstrData = { label: string; type: string; color: string; mapped: boolean; focused: boolean };
function InstrumentNode({ data }: NodeProps<Node<InstrData>>) {
  return (
    <div
      className={`rounded-2xl border border-l-4 px-3 py-2 shadow-sm w-48 cursor-pointer ${data.focused ? 'border-emerald-500 ring-2 ring-emerald-500/25' : data.mapped ? 'border-line' : 'border-amber-500/25'}`}
      style={{ borderLeftColor: data.color, backgroundColor: `${data.color}14` }}
      title="Double-click to edit"
    >
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: data.color }} />
        <span className="font-semibold text-sm text-ink truncate">{data.label}</span>
      </div>
      <div className="text-[11px] text-ink-faint mt-0.5">
        {data.type}{!data.mapped && <span className="text-amber-400"> · unmapped</span>}
      </div>
      <Handle type="source" position={Position.Right} style={{ width: 10, height: 10, background: '#10b981' }} />
    </div>
  );
}

type AssetData = { label: string; type: string; color: string; value: number };
function AssetNode({ data }: NodeProps<Node<AssetData>>) {
  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 shadow-sm w-52 cursor-pointer" title="Double-click to edit">
      <Handle type="target" position={Position.Left} style={{ width: 10, height: 10, background: '#6366f1' }} />
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: data.color }} />
        <span className="font-semibold text-sm text-ink truncate">{data.label}</span>
      </div>
      <div className="text-[11px] text-ink-faint mt-0.5">{data.type}</div>
      <div className="text-sm font-bold text-indigo-400 mt-1">₹{Number(data.value).toLocaleString('en-IN')}</div>
    </div>
  );
}

const nodeTypes = { instrument: InstrumentNode, asset: AssetNode };

export default function Mapping() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const focusId = params.get('focus') ? Number(params.get('focus')) : null;

  const [instruments, setInstruments] = useState<SavingsInstrument[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddInstr, setShowAddInstr] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [editingInstr, setEditingInstr] = useState<SavingsInstrument | null>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);

  const load = useCallback(async () => {
    const [instr, asset] = await Promise.all([api.getInstruments(), api.getAssets()]);
    setInstruments(instr);
    setAssets(asset);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Rebuild nodes/edges whenever data changes (records/mapping are the source of truth).
  useEffect(() => {
    setNodes(layoutNodes(instruments, assets, focusId));

    const newEdges: Edge[] = instruments
      .filter(i => i.asset_id != null)
      .map(i => ({
        id: `e${i.id}`,
        source: instrNodeId(Number(i.id)),
        target: assetNodeId(Number(i.asset_id)),
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
      }));
    setEdges(newEdges);
  }, [instruments, assets, focusId, setNodes, setEdges]);

  const onConnect = useCallback(async (c: Connection) => {
    if (!c.source || !c.target) return;
    const instrId = parseInstrId(c.source);
    const assetId = parseAssetId(c.target);
    await api.setInstrumentAsset(instrId, assetId); // one asset per instrument; replaces old link
    await load();
  }, [load]);

  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    await Promise.all(deleted.map(e => api.setInstrumentAsset(parseInstrId(e.source), null)));
    await load();
  }, [load]);

  const realign = useCallback(() => {
    setNodes(layoutNodes(instruments, assets, focusId));
    setTimeout(() => rfRef.current?.fitView({ padding: 0.2, duration: 300 }), 0);
  }, [instruments, assets, focusId, setNodes]);

  const onNodeDoubleClick = useCallback((_event: unknown, node: Node) => {
    if (node.type === 'instrument') {
      const instr = instruments.find(i => Number(i.id) === parseInstrId(node.id));
      if (instr) setEditingInstr(instr);
    } else if (node.type === 'asset') {
      const asset = assets.find(a => Number(a.id) === parseAssetId(node.id));
      if (asset) setEditingAsset(asset);
    }
  }, [instruments, assets]);

  const unmappedCount = useMemo(() => instruments.filter(i => i.asset_id == null).length, [instruments]);

  return (
    <div className="h-[calc(100vh-0px)] w-full">
      <div className="absolute z-10 top-4 left-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-surface border border-line rounded-lg shadow-sm hover:bg-surface-2">
          <ArrowLeft size={15} /> Back
        </button>
        <button onClick={realign} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-surface border border-line rounded-lg shadow-sm hover:bg-surface-2" title="Reset layout to two columns">
          <LayoutGrid size={15} /> Re-align
        </button>
        <div>
          <h1 className="text-lg font-bold text-ink">Map instruments to assets</h1>
          <p className="text-xs text-ink-muted">Drag from an instrument to an asset to map it. One instrument → one asset. Double-click a card to edit it.
            {unmappedCount > 0 && <span className="text-amber-400 font-medium"> · {unmappedCount} unmapped</span>}
          </p>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeDoubleClick={onNodeDoubleClick}
        onInit={inst => { rfRef.current = inst; }}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <Panel position="top-right">
          <div className="flex gap-2">
            <button onClick={() => setShowAddInstr(true)} className="flex items-center gap-2 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg shadow hover:bg-emerald-700">
              <Plus size={15} /> Add instrument
            </button>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700">
              <Plus size={15} /> Add asset
            </button>
          </div>
        </Panel>
      </ReactFlow>

      {(showAdd || editingAsset) && (
        <AddAssetPanel
          initial={editingAsset}
          onClose={() => { setShowAdd(false); setEditingAsset(null); }}
          onCreated={async () => { setShowAdd(false); setEditingAsset(null); await load(); }}
        />
      )}
      {(showAddInstr || editingInstr) && (
        <AddInstrumentPanel
          initial={editingInstr}
          onClose={() => { setShowAddInstr(false); setEditingInstr(null); }}
          onCreated={async () => { setShowAddInstr(false); setEditingInstr(null); await load(); }}
        />
      )}
    </div>
  );
}

function AddAssetPanel({ initial, onClose, onCreated }: { initial?: Asset | null; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(initial?.type ?? ASSET_TYPES[0]);
  const [base, setBase] = useState(String(initial?.base_value ?? ''));
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!name.trim()) return setErr('Name required');
    try {
      const body = { name: name.trim(), type, base_value: Number(base) || 0, color, notes: initial?.notes ?? null };
      if (initial) await api.updateAsset(Number(initial.id), body);
      else await api.createAsset(body);
      onCreated();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="absolute inset-0 z-20 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div className="bg-surface border border-line rounded-2xl shadow-xl w-96 p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-ink">{initial ? 'Edit asset' : 'New asset'}</h2>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            placeholder="e.g., HDFC Flexi Cap, Gold ETF"
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
          <input type="number" value={base} onChange={e => setBase(e.target.value)}
            placeholder="0"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          <p className="text-[11px] text-ink-faint mt-1">Contributions from mapped instruments are added on top of this.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Color</label>
          <div className="flex gap-2">
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-ink scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2">Cancel</button>
          <button onClick={save} className="flex-1 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{initial ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}

function AddInstrumentPanel({ initial, onClose, onCreated }: { initial?: SavingsInstrument | null; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(initial?.type ?? SAVING_TYPES[0]);
  const [target, setTarget] = useState(String(initial?.monthly_target ?? ''));
  const [color, setColor] = useState(initial?.color ?? '#10b981');
  const [err, setErr] = useState('');

  const save = async () => {
    if (!name.trim()) return setErr('Name required');
    try {
      const body = { name: name.trim(), type, monthly_target: Number(target) || 0, color, notes: initial?.notes ?? null };
      // New instrument starts unmapped — drag its node to an asset to map it.
      if (initial) await api.updateInstrument(Number(initial.id), body);
      else await api.createInstrument(body);
      onCreated();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="absolute inset-0 z-20 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div className="bg-surface border border-line rounded-2xl shadow-xl w-96 p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-ink">{initial ? 'Edit savings instrument' : 'New savings instrument'}</h2>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
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
            placeholder="0"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Color</label>
          <div className="flex gap-2">
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-ink scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        {!initial && <p className="text-[11px] text-ink-faint">Created unmapped — drag its node to an asset to map it.</p>}
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2">Cancel</button>
          <button onClick={save} className="flex-1 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">{initial ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
