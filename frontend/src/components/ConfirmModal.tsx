import { type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  title: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function ConfirmModal({
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  isDangerous = true,
  onConfirm,
  onCancel,
  isLoading = false,
}: Props) {
  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <div className="flex items-center gap-3">
            {isDangerous && (
              <div className="shrink-0 p-2 bg-red-500/10 rounded-lg">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
            )}
            <h2 className="text-base font-semibold text-ink">{title}</h2>
          </div>
          <button onClick={onCancel} className="text-ink-faint hover:text-ink transition-colors" disabled={isLoading}>
            <X size={20} />
          </button>
        </div>
        <div className="p-5">
          <p className="text-sm text-ink-muted">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-line">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-line rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isDangerous
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isLoading ? '...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
