interface Props {
  from: string; // YYYY-MM-DD
  to: string;
  onChange: (from: string, to: string) => void;
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

const TODAY = new Date();

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Last 30 days', range: () => [fmtDate(new Date(Date.now() - 29 * 86400000)), fmtDate(TODAY)] },
  { label: 'Last 3 months', range: () => [fmtDate(monthsAgo(3)), fmtDate(TODAY)] },
  { label: 'Last 6 months', range: () => [fmtDate(monthsAgo(6)), fmtDate(TODAY)] },
  { label: 'This year', range: () => [fmtDate(new Date(TODAY.getFullYear(), 0, 1)), fmtDate(new Date(TODAY.getFullYear(), 11, 31))] },
  { label: 'Year to date', range: () => [fmtDate(new Date(TODAY.getFullYear(), 0, 1)), fmtDate(TODAY)] },
  { label: 'All time', range: () => ['2000-01-01', fmtDate(TODAY)] },
];

export default function DateRangePicker({ from, to, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <div className="flex items-center gap-2">
        <label className="text-xs text-ink-faint">From</label>
        <input
          type="date" value={from} max={to}
          onChange={e => onChange(e.target.value, to)}
          className="border border-line rounded-lg px-2.5 py-1.5 text-sm bg-surface text-ink outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <label className="text-xs text-ink-faint">To</label>
        <input
          type="date" value={to} min={from}
          onChange={e => onChange(from, e.target.value)}
          className="border border-line rounded-lg px-2.5 py-1.5 text-sm bg-surface text-ink outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => { const [f, t] = p.range(); onChange(f, t); }}
            className="px-2.5 py-1 text-xs rounded-lg border border-line text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
