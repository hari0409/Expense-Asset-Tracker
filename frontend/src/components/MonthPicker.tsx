import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface Props {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
}

export default function MonthPicker({ month, year, onChange }: Props) {
  const prev = () => {
    if (month === 1) onChange(12, year - 1);
    else onChange(month - 1, year);
  };
  const next = () => {
    if (month === 12) onChange(1, year + 1);
    else onChange(month + 1, year);
  };

  return (
    <div className="flex items-center gap-2">
      <button onClick={prev} className="p-1.5 rounded-lg hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors">
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-semibold text-ink min-w-[90px] text-center">
        {MONTHS[month - 1]} {year}
      </span>
      <button onClick={next} className="p-1.5 rounded-lg hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
