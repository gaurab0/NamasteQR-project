import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { rbacService } from '../../services/rbac.service';
import { canAccessTab } from '../../utils/tabAccess';
import { 
  Building2, 
  ChevronDown, 
  Check, 
  Plus, 
  MapPin, 
  Store,
  Crown
} from 'lucide-react';

interface BranchSwitcherProps {
  onOpenAddBranch?: () => void;
  className?: string;
}

export const BranchSwitcher: React.FC<BranchSwitcherProps> = ({ onOpenAddBranch, className = '' }) => {
  const { user, activeBusiness, branches, activeBranchId, switchBranch, isLoadingBranches } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!user) return null;

  const staffSession = rbacService.getCurrentStaffSession();
  const hasFranchiseAccess = canAccessTab(staffSession ?? user, 'franchise');

  const currentBranch = branches.find((b) => b.id === activeBranchId) || activeBusiness || user.business;
  const isFlagship = !currentBranch?.parent_business_id;

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        id="btn-branch-switcher"
        type="button"
        onClick={() => hasFranchiseAccess && setIsOpen(!isOpen)}
        className={`flex items-center gap-1 sm:gap-2.5 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-medium bg-white/95 border shadow-2xs transition-all group shrink-0 ${hasFranchiseAccess ? 'hover:bg-zinc-50 border-zinc-200/90 hover:border-amber-300 cursor-pointer' : 'border-transparent cursor-default'}`}
        aria-label="Franchise & Branch Switcher"
      >
        <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center shrink-0 border ${
          isFlagship 
            ? 'bg-amber-50 border-amber-200 text-amber-600' 
            : 'bg-indigo-50 border-indigo-200 text-indigo-600'
        }`}>
          {isFlagship ? (
            <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          ) : (
            <Store className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          )}
        </div>

        {/* Mobile View: Compact single-line name with badge */}
        <div className="flex sm:hidden items-center gap-1 min-w-0 max-w-[68px]">
          <span className="font-bold text-[11px] text-zinc-900 truncate leading-tight">
            {currentBranch?.name || 'Venue'}
          </span>
          {isFlagship ? (
            <span className="text-[8px] font-extrabold px-1 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
              HQ
            </span>
          ) : (
            <span className="text-[8px] font-extrabold px-1 py-0.2 rounded bg-indigo-100 text-indigo-900 border border-indigo-300 shrink-0">
              {currentBranch?.branch_code || 'Branch'}
            </span>
          )}
        </div>

        {/* Desktop View: Full rich 2-line details */}
        <div className="hidden sm:flex flex-col text-left max-w-[160px] md:max-w-[190px]">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-zinc-900 truncate leading-tight">
              {currentBranch?.name || 'Active Venue'}
            </span>
            {currentBranch?.branch_code && (
              <span className="text-[10px] font-mono px-1 py-0.2 bg-zinc-100 text-zinc-600 rounded">
                {currentBranch.branch_code}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {isFlagship ? (
              <span className="inline-flex items-center text-[10px] font-semibold text-amber-700">
                HQ / Flagship
              </span>
            ) : (
              <span className="inline-flex items-center text-[10px] font-semibold text-indigo-600">
                Franchise Branch
              </span>
            )}
            {branches.length > 1 && (
              <span className="text-[10px] text-zinc-400">
                • {branches.length} locations
              </span>
            )}
          </div>
        </div>

        {hasFranchiseAccess && (
          <ChevronDown className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400 transition-transform shrink-0 ml-0.5 sm:ml-1 ${isOpen ? 'rotate-180 text-zinc-700' : ''}`} />
        )}
      </button>

      {isOpen && (
        <>
          {/* Mobile backdrop to cleanly dismiss on outside tap */}
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-2xs z-40 sm:hidden" 
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed sm:absolute inset-x-3 sm:inset-x-auto top-16 sm:top-auto sm:right-0 mt-2 w-auto sm:w-80 max-w-sm sm:max-w-[340px] rounded-2xl bg-white border border-zinc-200/90 shadow-2xl z-50 p-2 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-2 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Franchise & Branch Locations
              </span>
            </div>
            <span className="text-[10px] font-bold text-amber-800 bg-amber-100/80 border border-amber-200 px-2 py-0.5 rounded-full">
              {branches.length || 1} Total
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto py-1 space-y-1">
            {isLoadingBranches && branches.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-500">
                Loading franchise branches...
              </div>
            ) : branches.length === 0 ? (
              // Fallback to current business if branches haven't loaded
              <div
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/60 border border-amber-200/60"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <Crown className="w-3.5 h-3.5 text-amber-700" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold text-zinc-900 truncate">
                      {user.business?.name || 'Main Venue'}
                    </p>
                    <p className="text-[10px] text-amber-700 font-semibold">Flagship (Main HQ)</p>
                  </div>
                </div>
                <Check className="w-4 h-4 text-amber-600 shrink-0" />
              </div>
            ) : (
              branches.map((branch) => {
                const selected = branch.id === (activeBranchId || user.business?.id);
                const isMain = !branch.parent_business_id;

                return (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() => {
                      switchBranch(branch.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                      selected
                        ? 'bg-amber-50/80 border border-amber-200/80 text-zinc-900 shadow-2xs'
                        : 'hover:bg-zinc-50 text-zinc-700 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2 flex-1">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        isMain 
                          ? 'bg-amber-100 text-amber-700 border-amber-200/60' 
                          : 'bg-indigo-50 text-indigo-600 border-indigo-200/60'
                      }`}>
                        {isMain ? <Crown className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-bold text-zinc-900 truncate">
                            {branch.name}
                          </p>
                          {branch.branch_code && (
                            <span className="text-[9px] font-mono px-1 py-0.2 bg-zinc-100 text-zinc-600 rounded">
                              {branch.branch_code}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-zinc-500 flex-wrap">
                          {isMain ? (
                            <span className="text-amber-700 font-semibold bg-amber-100/60 px-1.5 py-0.2 rounded border border-amber-200/60">
                              HQ / Flagship
                            </span>
                          ) : (
                            <span className="text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                              Franchise Branch
                            </span>
                          )}

                          {branch.location && (
                            <span className="truncate flex items-center gap-0.5 text-zinc-500 max-w-[150px]">
                              <span className="text-zinc-300">•</span>
                              <MapPin className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
                              {branch.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {selected && (
                      <Check className="w-4 h-4 text-amber-600 shrink-0 ml-1" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {onOpenAddBranch && (
            <div className="pt-2 mt-1 border-t border-zinc-100">
              <button
                id="btn-add-branch-switcher"
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenAddBranch();
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add New Franchise Branch
              </button>
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
};
