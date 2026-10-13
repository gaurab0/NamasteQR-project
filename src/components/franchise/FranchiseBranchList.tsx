import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Building2, 
  Store, 
  Plus, 
  MapPin, 
  Phone, 
  Check, 
  Utensils, 
  LayoutGrid, 
  ExternalLink,
  Crown,
  Tag
} from 'lucide-react';
import { Button } from '../ui/Button';

interface FranchiseBranchListProps {
  onOpenAddBranch: () => void;
}

export const FranchiseBranchList: React.FC<FranchiseBranchListProps> = ({ onOpenAddBranch }) => {
  const { user, branches, activeBranchId, switchBranch, isLoadingBranches } = useAuth();

  if (!user) return null;

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
            Isolated operations, menus, tables, and sales across multiple restaurant & resort locations under your account.
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
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isMain 
                          ? 'bg-amber-100 text-amber-700' 
                          : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                      }`}>
                        {isMain ? <Crown className="w-5 h-5" /> : <Store className="w-5 h-5" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-zinc-900 leading-tight">
                            {branch.name}
                          </h4>
                          {branch.branch_code && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-100 text-zinc-700 rounded font-semibold">
                              {branch.branch_code}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          {isMain ? (
                            <span className="inline-flex items-center text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                              HQ / Flagship
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                              Franchise Branch
                            </span>
                          )}

                          <span className="text-[10px] font-mono text-zinc-400">
                            ID: {branch.id}
                          </span>
                        </div>
                      </div>
                    </div>

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
    </div>
  );
};
