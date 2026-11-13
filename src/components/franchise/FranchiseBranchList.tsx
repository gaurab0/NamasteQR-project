import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Business } from '../../types/auth';
import { rbacService } from '../../services/rbac.service';
import { 
  Building2, 
  Store, 
  Plus, 
  MapPin, 
  Phone, 
  Check, 
  Utensils, 
  LayoutGrid, 
  Crown,
  Trash2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { Button } from '../ui/Button';

interface FranchiseBranchListProps {
  onOpenAddBranch: () => void;
}

export const FranchiseBranchList: React.FC<FranchiseBranchListProps> = ({ onOpenAddBranch }) => {
  const { user, branches, activeBranchId, switchBranch, refreshBranches, isLoadingBranches } = useAuth();
  const [branchToDelete, setBranchToDelete] = useState<Business | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!user) return null;

  const handleConfirmDelete = async () => {
    if (!branchToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await rbacService.deleteBranchApi(branchToDelete.id);

      // If deleting currently active branch, switch back to parent/HQ
      if (activeBranchId === branchToDelete.id && user.business?.id) {
        switchBranch(user.business.id);
      }

      await refreshBranches();
      setStatusMessage(res.message || `Franchise branch '${branchToDelete.name}' was permanently deleted.`);
      setTimeout(() => setStatusMessage(null), 5000);
      setBranchToDelete(null);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete franchise branch');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xs overflow-hidden">
      <div className="p-6 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-zinc-900">Franchise & Multi-Branch Network</h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              {branches.length || 1} Total
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Isolated operations, menus, tables, and sales across multiple restaurant & dining locations under your account.
          </p>
        </div>

        <Button
          id="btn-add-franchise-branch"
          variant="primary"
          size="sm"
          onClick={onOpenAddBranch}
          className="bg-amber-600 hover:bg-amber-700 text-white shadow-xs shrink-0 self-start sm:self-auto"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
        >
          Add Franchise Branch
        </Button>
      </div>

      {statusMessage && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setStatusMessage(null)} 
            className="text-emerald-600 hover:text-emerald-900 font-bold text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="p-6">
        {isLoadingBranches && branches.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500">
            Loading branches...
          </div>
        ) : branches.length === 0 ? (
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-center text-xs text-zinc-500">
            No franchise branches found. Click "Add Franchise Branch" to provision your first branch location.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {branches.map((branch) => {
              const isActive = branch.id === (activeBranchId || user.business?.id);
              const isMain = !branch.parent_business_id;

              return (
                <div
                  key={branch.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isActive
                      ? 'border-amber-400 bg-amber-50/40 shadow-xs ring-2 ring-amber-500/10'
                      : 'border-zinc-200 hover:border-zinc-300 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isMain 
                          ? 'bg-amber-100 text-amber-700' 
                          : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                      }`}>
                        {isMain ? <Crown className="w-5 h-5" /> : <Store className="w-5 h-5" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-zinc-900 leading-tight truncate">
                            {branch.name}
                          </h4>
                          {branch.branch_code && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-100 text-zinc-700 rounded font-semibold shrink-0">
                              {branch.branch_code}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {isMain ? (
                            <span className="inline-flex items-center text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                              HQ / Flagship
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full shrink-0">
                              Franchise Branch
                            </span>
                          )}

                          <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[150px] sm:max-w-[200px]" title={branch.id}>
                            ID: {branch.id}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100/90 px-2.5 py-1 rounded-full border border-amber-300">
                          <Check className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => switchBranch(branch.id)}
                          className="text-xs font-bold text-zinc-600 hover:text-amber-700 hover:bg-zinc-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer border border-zinc-200"
                        >
                          Switch To
                        </button>
                      )}

                      {!isMain && (
                        <button
                          type="button"
                          onClick={() => {
                            setBranchToDelete(branch);
                            setDeleteError(null);
                          }}
                          className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition border border-transparent hover:border-rose-200 cursor-pointer"
                          title={`Delete ${branch.name}`}
                          aria-label={`Delete ${branch.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Branch metadata */}
                  <div className="space-y-1.5 text-xs text-zinc-600 border-t border-zinc-100 pt-3">
                    {branch.location && (
                      <div className="flex items-center gap-2 text-zinc-600">
                        <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span className="truncate">{branch.location}</span>
                      </div>
                    )}
                    {branch.phone && (
                      <div className="flex items-center gap-2 text-zinc-600">
                        <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span>{branch.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Branch stats */}
                  <div className="mt-3 pt-3 border-t border-zinc-100/80 flex items-center justify-between text-[11px] text-zinc-500">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <LayoutGrid className="w-3 h-3 text-zinc-400" />
                        {branch.tableCount ?? '—'} Tables
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Utensils className="w-3 h-3 text-zinc-400" />
                        {branch.menuCount ?? '—'} Menu Items
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Franchise Branch Confirmation Modal */}
      {branchToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-zinc-200 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-bold text-zinc-900">
                  Delete Franchise Branch?
                </h4>
                <p className="text-xs text-zinc-500 mt-1">
                  Are you sure you want to permanently delete <strong className="text-zinc-800 font-bold">{branchToDelete.name}</strong>?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                This action is permanent:
              </p>
              <ul className="list-disc list-inside text-[11px] text-amber-800 pl-1 space-y-0.5">
                <li>All tables, menu items, orders, and sales history for this location will be purged.</li>
                <li>Staff account permissions linked to this branch will be removed.</li>
              </ul>
            </div>

            {deleteError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setBranchToDelete(null);
                  setDeleteError(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-branch"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Branch</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
