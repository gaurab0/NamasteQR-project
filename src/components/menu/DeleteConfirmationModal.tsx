import React from 'react';
import { MenuItem } from '../../types/rbac';
import { Trash2, X, AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  item: MenuItem | null;
  loading?: boolean;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  item,
  loading = false,
}) => {
  if (!isOpen || !item) return null;

  return (
    <div
      id="delete-confirmation-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        id="delete-confirmation-modal-container"
        className="relative bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1 flex-1">
            <h3 id="delete-modal-title" className="text-base font-bold text-zinc-900">
              Delete Menu Item?
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              This action cannot be undone. Are you sure you want to permanently delete{' '}
              <span className="font-semibold text-zinc-800">"{item.name}"</span> from your restaurant menu?
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            id="btn-cancel-delete"
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            id="btn-confirm-delete"
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-xs font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Item</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
