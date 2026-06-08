import { type ButtonHTMLAttributes } from 'react';

type Tone = 'default' | 'danger' | 'accent';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
}

const TONE_CLASS: Record<Tone, string> = {
  default: 'text-ink-faint hover:text-ink hover:bg-surface-2',
  danger: 'text-ink-faint hover:text-red-400 hover:bg-red-500/10',
  accent: 'text-ink-faint hover:text-accent hover:bg-accent/10',
};

export default function IconButton({ tone = 'default', className = '', ...rest }: Props) {
  return (
    <button
      className={`p-1.5 rounded-lg transition-colors ${TONE_CLASS[tone]} ${className}`}
      {...rest}
    />
  );
}
