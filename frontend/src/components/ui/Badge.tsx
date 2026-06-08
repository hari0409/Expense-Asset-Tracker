import { type ReactNode } from 'react';

type Tone = 'accent' | 'success' | 'danger' | 'warning' | 'neutral';

interface Props {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}

const TONE_CLASS: Record<Tone, string> = {
  accent: 'bg-accent/15 text-accent',
  success: 'bg-emerald-500/15 text-emerald-400',
  danger: 'bg-red-500/15 text-red-400',
  warning: 'bg-amber-500/15 text-amber-400',
  neutral: 'bg-surface-2 text-ink-faint',
};

export default function Badge({ children, tone = 'neutral', className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${TONE_CLASS[tone]} ${className}`}>
      {children}
    </span>
  );
}
