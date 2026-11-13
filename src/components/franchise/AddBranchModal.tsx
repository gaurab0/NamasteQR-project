import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  X, 
  Store, 
  Sparkles, 
  MapPin, 
  Phone, 
  Clock, 
  Tag, 
  Percent, 
  Copy, 
  CheckCircle2, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import { Button } from '../ui/Button';

interface AddBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newBranchId: string) => void;
}

export const AddBranchModal: React.FC<AddBranchModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, activeBusiness, branches, createBranch, switchBranch } = useAuth();

  const [name, setName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState(user?.phone?.e164 || '');
  const [tagline, setTagline] = useState('');
  const [kitchenHours, setKitchenHours] = useState('08:00 AM – 11:00 PM');
  const [currency, setCurrency] = useState('Rs.');
  const [taxRate, setTaxRate] = useState<number>(5);
  const [cloneMenu, setCloneMenu] = useState(true);
  const [cloneSourceId, setCloneSourceId] = useState(activeBusiness?.id || user?.business?.id || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    branchName: string;
    branchId: string;
    itemsCloned?: number;
  } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please provide a name for the new franchise branch.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createBranch({
        name: name.trim(),
        branch_code: branchCode.trim() || undefined,
        location: location.trim() || undefined,
        phone: phone.trim() || undefined,
        tagline: tagline.trim() || undefined,
        currency: currency.trim() || 'Rs.',
        tax_rate: Number(taxRate) || 0,
        business_type: user?.business?.type || 'RESTAURANT',
        clone_menu_from: cloneMenu ? (cloneSourceId || activeBusiness?.id || user?.business?.id) : undefined,
      });

      setSuccessInfo({
        branchName: res.branch.name,
        branchId: res.branch.id,
        itemsCloned: res.cloneStats?.itemsCloned,
      });

      // Switch to newly created branch
      switchBranch(res.branch.id);

      if (onSuccess) {
        onSuccess(res.branch.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create franchise branch.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setName('');
    setBranchCode('');
    setLocation('');
    setError(null);
    setSuccessInfo(null);
    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-gradient-to-r from-amber-50/50 via-white to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900">Add Franchise Branch</h3>
              <p className="text-xs text-zinc-500">Provision a new isolated branch under your business</p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success State */}
        {successInfo ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-bold text-zinc-900">Franchise Branch Created!</h4>
              <p className="text-xs text-zinc-600 max-w-sm mx-auto">
                <span className="font-semibold text-zinc-900">{successInfo.branchName}</span> has been provisioned with its own isolated tables, KDS, sales, and ordering catalog.
              </p>
              {typeof successInfo.itemsCloned === 'number' && successInfo.itemsCloned > 0 && (
                <p className="text-xs font-semibold text-amber-700 bg-amber-50 py-1.5 px-3 rounded-xl inline-block mt-2">
                  ✨ Cloned {successInfo.itemsCloned} menu items & categories from source branch
                </p>
              )}
            </div>

            <div className="pt-4 flex items-center justify-center gap-3">
              <Button
                variant="primary"
                onClick={resetAndClose}
                className="bg-amber-600 hover:bg-amber-700 text-white shadow-xs px-6"
              >
                Go to New Branch Workspace
              </Button>
            </div>
          </div>
        ) : (
          /* Input Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Branch Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Namaste Bistro - Downtown"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Branch Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. DT-01"
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2 text-xs font-mono rounded-xl border border-zinc-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400" /> Location / Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. 45 Downtown Boulevard"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-zinc-400" /> Contact Phone
                </label>
                <input
                  type="text"
                  placeholder="+91 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-zinc-400" /> Tagline
                </label>
                <input
                  type="text"
                  placeholder="e.g. Downtown Boutique Dining"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Currency Symbol
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1 flex items-center gap-1">
                  <Percent className="w-3.5 h-3.5 text-zinc-400" /> Sales Tax / VAT (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>

            {/* Quick Toggle: Clone Menu Catalog */}
            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Copy className="w-4 h-4 text-amber-700" />
                  <span className="text-xs font-bold text-zinc-900">
                    Clone Menu Catalog
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloneMenu}
                    onChange={(e) => setCloneMenu(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                </label>
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                Copies all existing menu categories & items into this branch so you don't have to re-enter them.
              </p>

              {cloneMenu && branches.length > 1 && (
                <div className="pt-2">
                  <label className="block text-[10px] font-bold text-zinc-700 mb-1 uppercase tracking-wider">
                    Copy from Branch:
                  </label>
                  <select
                    value={cloneSourceId}
                    onChange={(e) => setCloneSourceId(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-amber-300 bg-white focus:outline-hidden"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} {!b.parent_business_id ? '(Flagship)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="pt-3 flex items-center justify-end gap-3 border-t border-zinc-100">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={resetAndClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={isSubmitting}
                className="bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                leftIcon={isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Store className="w-3.5 h-3.5" />}
              >
                {isSubmitting ? 'Provisioning Branch...' : 'Create Franchise Branch'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
