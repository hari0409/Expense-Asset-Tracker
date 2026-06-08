import { type ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  message: string;
  className?: string;
}

export default function EmptyState({ icon, message, className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center text-ink-faint py-16 ${className}`}>
      {icon && <div className="mb-2">{icon}</div>}
      <p className="text-sm">{message}</p>
    </div>
  );
}
