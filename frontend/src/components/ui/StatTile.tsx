import { type ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  iconClassName?: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}

export default function StatTile({ icon, iconClassName = 'bg-accent/15 text-accent', label, value, hint }: Props) {
  return (
    <>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${iconClassName}`}>
        {icon}
      </div>
      <p className="text-xs text-ink-muted mb-1">{label}</p>
      <p className="text-xl font-bold text-ink">{value}</p>
      {hint && <p className="text-xs text-ink-muted mt-0.5">{hint}</p>}
    </>
  );
}
