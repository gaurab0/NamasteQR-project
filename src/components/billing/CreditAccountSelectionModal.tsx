import React, { useEffect, useMemo, useState } from 'react';
import { Search, X, AlertCircle, UserPlus, ArrowLeft, Users, Check } from 'lucide-react';
import { rbacService } from '../../services/rbac.service';
import type { GLAccountLink } from '../../types/rbac';

interface CreditAccountSelectionModalProps {
  isOpen: boolean;
  businessId?: string;
  onClose: () => void;
  onSelect: (account: GLAccountLink) => void;
}

const EMPTY_FORM = {
  account_name: '',
  account_number: '',
  customer_name: '',
  customer_address: '',
  customer_phone: '',
  customer_extension: '',
  customer_office_name: '',
  customer_designation: '',
};

// The seeded control account is not a real customer ledger, so never offer it for selection
const isControlAccount = (a: GLAccountLink) => a.id === 'gl-1120';

export function CreditAccountSelectionModal({
  isOpen,
  businessId,
  onClose,
  onSelect,
}: CreditAccountSelectionModalProps) {
  const [allAccounts, setAllAccounts] = useState<GLAccountLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'add'>('list');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const customerAccounts = useMemo(
    () =>
      allAccounts
        .filter((a) => a.mapping_key === 'CREDIT_SETTLEMENT' && a.is_active !== false && !isControlAccount(a))
        .sort((a, b) => (a.account_name || '').localeCompare(b.account_name || '')),
    [allAccounts]
  );

  // Suggest the next free GL number after the seeded 1120 control account
  const suggestNextNumber = (accounts: GLAccountLink[]) => {
    const used = new Set(accounts.map((a) => String(a.account_number).trim()));
    let n = 1121;
    while (used.has(String(n))) n++;
    return String(n);
  };

  const loadAccounts = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const accs = await rbacService.getGLAccountsApi(businessId);
      setAllAccounts(accs);
      return accs;
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load customer accounts');
      return [] as GLAccountLink[];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setView('list');
    setSearch('');
    setFormError(null);
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, businessId]);

  const openAddForm = () => {
    setForm({ ...EMPTY_FORM, account_number: suggestNextNumber(allAccounts) });
    setFormError(null);
    setView('add');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.account_name.trim() || !form.account_number.trim()) {
      setFormError('GL Account Name and GL Account Number are required.');
      return;
    }
    try {
      setSaving(true);
      setFormError(null);
      const created = await rbacService.createGLAccountApi(
        {
          account_name: form.account_name.trim(),
          account_number: form.account_number.trim(),
          category: 'ASSET',
          mapping_key: 'CREDIT_SETTLEMENT',
          description: `Customer credit ledger${form.customer_name.trim() ? ' - ' + form.customer_name.trim() : ''}`,
          is_active: true,
          customer_name: form.customer_name.trim() || null,
          customer_address: form.customer_address.trim() || null,
          customer_phone: form.customer_phone.trim() || null,
          customer_extension: form.customer_extension.trim() || null,
          customer_office_name: form.customer_office_name.trim() || null,
          customer_designation: form.customer_designation.trim() || null,
        },
        businessId
      );
      // Newly created customer is selected immediately
      onSelect(created);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create customer account');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const q = search.trim().toLowerCase();
  const filtered = customerAccounts.filter(
    (a) =>
      !q ||
      (a.account_name || '').toLowerCase().includes(q) ||
      (a.account_number || '').toLowerCase().includes(q) ||
      (a.customer_name || '').toLowerCase().includes(q) ||
      (a.customer_office_name || '').toLowerCase().includes(q)
  );

  const inputCls =
    'w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500';

  const field = (
    key: keyof typeof EMPTY_FORM,
    label: string,
    placeholder: string,
    required = false
  ) => (
    <div>
      <label className="block text-xs font-semibold text-zinc-700 mb-1">
        {label} {required && <span className="text-rose-600">*</span>}
      </label>
      <input
        type="text"
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className={inputCls}
      />
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            {view === 'add' && (
              <button
                type="button"
                onClick={() => setView('list')}
                className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-full"
                title="Back to customer list"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h2 className="text-lg font-bold text-zinc-900">
                {view === 'list' ? 'Select Customer Credit Account' : 'Add New Credit Customer'}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {view === 'list'
                  ? 'Choose the customer GL account this credit sale will be posted to.'
                  : 'Creates a dedicated GL account for this customer.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {view === 'list' ? (
          <>
            <div className="p-5 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full" />
                </div>
              ) : loadError ? (
                <div className="text-center py-8">
                  <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
                  <p className="text-sm text-rose-600">{loadError}</p>
                  <button
                    type="button"
                    onClick={loadAccounts}
                    className="mt-3 px-3 py-1.5 text-sm bg-zinc-100 rounded-lg hover:bg-zinc-200"
                  >
                    Retry
                  </button>
                </div>
              ) : customerAccounts.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Users className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-900">No credit customers yet</h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    Add your first customer to start recording credit sales.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search by account, customer or number..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className={inputCls + ' pl-9'}
                    />
                  </div>
                  <div className="space-y-2">
                    {filtered.map((acc) => (
                      <button
                        type="button"
                        key={acc.id}
                        onClick={() => onSelect(acc)}
                        className="w-full text-left p-3.5 rounded-xl border border-zinc-200 hover:border-rose-500 hover:bg-rose-50 transition-all group"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-zinc-900 group-hover:text-rose-700">
                            {acc.account_name}
                          </div>
                          <span className="text-xs font-mono text-zinc-500 group-hover:text-rose-600">
                            GL {acc.account_number}
                          </span>
                        </div>
                        {(acc.customer_name || acc.customer_office_name || acc.customer_phone) && (
                          <div className="text-xs text-zinc-500 mt-1">
                            {[acc.customer_name, acc.customer_designation, acc.customer_office_name, acc.customer_phone]
                              .filter(Boolean)
                              .join(' • ')}
                          </div>
                        )}
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <p className="text-center text-sm text-zinc-500 py-4">No customers match your search.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-zinc-100">
              <button
                type="button"
                onClick={openAddForm}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Add New Customer
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col min-h-0">
            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {field('account_name', 'GL Account Name', 'e.g. Ram Sharma - Credit A/C', true)}
                {field('account_number', 'GL Account Number', 'e.g. 1121', true)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {field('customer_name', 'Customer Name', 'e.g. Ram Sharma')}
                {field('customer_phone', 'Phone Number', 'e.g. 98XXXXXXXX')}
              </div>
              {field('customer_address', 'Address', 'e.g. Baneshwor, Kathmandu')}
              <div className="grid grid-cols-2 gap-3">
                {field('customer_extension', 'Extension Number', 'e.g. 214')}
                {field('customer_designation', 'Designation', 'e.g. Account Officer')}
              </div>
              {field('customer_office_name', 'Office Name', 'e.g. ABC Pvt. Ltd.')}
              <p className="text-[11px] text-zinc-400">
                Only GL Account Name and Number are required. Empty fields are stored as blank.
              </p>
              {formError && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-zinc-100 flex gap-2">
              <button
                type="button"
                onClick={() => setView('list')}
                className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save & Select Customer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

