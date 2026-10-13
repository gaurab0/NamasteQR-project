import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  RotateCcw, 
  FileSpreadsheet, 
  Check, 
  X, 
  Search, 
  ShieldCheck, 
  SlidersHorizontal,
  Info,
  Layers,
  ArrowUpDown,
  BookOpen,
  AlertTriangle
} from 'lucide-react';
import { GLAccountLink, GLAccountCategory } from '../../types/rbac';
import { rbacService } from '../../services/rbac.service';

interface GLAccountsTableProps {
  businessId: string;
  glAccounts: GLAccountLink[];
  onAccountsChange: (updated: GLAccountLink[]) => void;
  isOwner: boolean;
  onOpenExcelPreview: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const DEFAULT_CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  REVENUE: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  TAX_LIABILITY: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  ASSET: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  EXPENSE: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  LIABILITY: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  EQUITY: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
};

const getCategoryBadgeStyle = (category: string) => {
  if (DEFAULT_CATEGORY_STYLES[category]) {
    return DEFAULT_CATEGORY_STYLES[category];
  }
  // Deterministic palette for custom user classifications (e.g. Bank 1, Wallet 1, VAT Account)
  const palettes = [
    { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
    { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
    { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
    { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200' },
    { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
    { bg: 'bg-lime-50', text: 'text-lime-800', border: 'border-lime-200' },
    { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  ];
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % palettes.length;
  return palettes[index];
};

const MAPPING_OPTIONS = [
  { key: 'FOOD_SALES', label: 'Food Sales Revenue (Kitchen Dining & Dishes)' },
  { key: 'BEVERAGE_SALES', label: 'Beverage Sales Revenue (Bar & Drinks)' },
  { key: 'DISCOUNTS_ALLOWED', label: 'Discounts & Rebates (Promotions)' },
  { key: 'VAT_COLLECTED', label: 'Sales Tax / VAT Payable (13% Government)' },
  { key: 'SERVICE_CHARGE', label: 'Hospitality Service Charge Payable (10% Pool)' },
  { key: 'CASH_SETTLEMENT', label: 'POS Cash Till (Cash Received)' },
  { key: 'CARD_SETTLEMENT', label: 'Card Machine Clearing (POS Swipes)' },
  { key: 'QR_SETTLEMENT', label: 'QR Digital Payment Clearing (Mobile & Wallets)' },
  { key: 'ONLINE_SETTLEMENT', label: 'Online Payment Gateway Clearing' },
  { key: 'ROOM_CHARGE', label: 'Hotel Guest Folio / Room Charge' },
  { key: 'CREDIT_SETTLEMENT', label: 'Accounts Receivable (Credit Sales)' },
  { key: 'CUSTOM_MAPPING', label: 'Custom ERP Mapping' },
];

export const GLAccountsTable: React.FC<GLAccountsTableProps> = ({
  businessId,
  glAccounts,
  onAccountsChange,
  isOwner,
  onOpenExcelPreview,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<GLAccountLink | null>(null);

  // Form states
  const [formData, setFormData] = useState<{
    account_number: string;
    account_name: string;
    category: string;
    customCategory: string;
    mapping_key: string;
    description: string;
    customer_name: string;
    customer_address: string;
    customer_phone: string;
    customer_extension: string;
    customer_office_name: string;
    customer_designation: string;
    is_active: boolean;
  }>({
    account_number: '',
    account_name: '',
    category: 'REVENUE',
    customCategory: '',
    mapping_key: 'FOOD_SALES',
    description: '',
    customer_name: '',
    customer_address: '',
    customer_phone: '',
    customer_extension: '',
    customer_office_name: '',
    customer_designation: '',
    is_active: true,
  });

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<{ id: string; number: string; name: string } | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  // Compute all unique categories across existing accounts + defaults
  const allAvailableCategories = useMemo(() => {
    const defaults = ['REVENUE', 'TAX_LIABILITY', 'ASSET', 'EXPENSE', 'LIABILITY', 'EQUITY'];
    const custom = glAccounts
      .map((a) => a.category)
      .filter((c) => c && !defaults.includes(c));
    return Array.from(new Set([...defaults, ...custom]));
  }, [glAccounts]);

  const openAddModal = () => {
    setEditingAccount(null);
    setFormData({
      account_number: '',
      account_name: '',
      category: 'REVENUE',
      customCategory: '',
      mapping_key: 'CUSTOM_MAPPING',
      description: '',
      customer_name: '',
      customer_address: '',
      customer_phone: '',
      customer_extension: '',
      customer_office_name: '',
      customer_designation: '',
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (account: GLAccountLink) => {
    setEditingAccount(account);
    const isStandard = ['REVENUE', 'TAX_LIABILITY', 'ASSET', 'EXPENSE', 'LIABILITY', 'EQUITY'].includes(account.category);
    setFormData({
      account_number: account.account_number,
      account_name: account.account_name,
      category: isStandard ? account.category : '__CUSTOM__',
      customCategory: isStandard ? '' : account.category,
      mapping_key: account.mapping_key || 'CUSTOM_MAPPING',
      description: account.description || '',
      customer_name: account.customer_name || '',
      customer_address: account.customer_address || '',
      customer_phone: account.customer_phone || '',
      customer_extension: account.customer_extension || '',
      customer_office_name: account.customer_office_name || '',
      customer_designation: account.customer_designation || '',
      is_active: account.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.account_number.trim() || !formData.account_name.trim()) {
      showToast('Account Number and Account Name are required', 'error');
      return;
    }

    const finalCategory = formData.category === '__CUSTOM__'
      ? formData.customCategory.trim()
      : formData.category;

    if (!finalCategory) {
      showToast('Please specify a classification category', 'error');
      return;
    }

    try {
      setSaving(true);
      const payload: Partial<GLAccountLink> = {
        account_number: formData.account_number.trim(),
        account_name: formData.account_name.trim(),
        category: finalCategory,
        mapping_key: formData.mapping_key,
        description: formData.description.trim(),
        customer_name: formData.customer_name.trim() || null,
        customer_address: formData.customer_address.trim() || null,
        customer_phone: formData.customer_phone.trim() || null,
        customer_extension: formData.customer_extension.trim() || null,
        customer_office_name: formData.customer_office_name.trim() || null,
        customer_designation: formData.customer_designation.trim() || null,
        is_active: formData.is_active,
      };

      if (editingAccount) {
        const updated = await rbacService.updateGLAccountApi(
          editingAccount.id,
          payload,
          businessId
        );
        onAccountsChange(
          glAccounts.map((a) => (a.id === editingAccount.id ? updated : a))
        );
        showToast(`GL Account ${updated.account_number} updated successfully`, 'success');
      } else {
        const created = await rbacService.createGLAccountApi(payload, businessId);
        onAccountsChange([...glAccounts, created]);
        showToast(`GL Account ${created.account_number} added to General Ledger`, 'success');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to save GL account', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteAccount = async () => {
    if (!accountToDelete) return;
    const { id: accountId, number: accountNum } = accountToDelete;

    try {
      setDeletingId(accountId);
      await rbacService.deleteGLAccountApi(accountId, businessId);
      onAccountsChange(glAccounts.filter((a) => a.id !== accountId));
      showToast(`GL Account ${accountNum} removed`, 'info');
      setAccountToDelete(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete GL account', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const confirmResetDefaults = async () => {
    try {
      setSaving(true);
      const defaults = await rbacService.resetDefaultGLAccountsApi(businessId);
      onAccountsChange(defaults);
      showToast('Restored standard hospitality GL chart of accounts', 'success');
      setShowResetModal(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to restore defaults', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    return glAccounts.filter((acc) => {
      if (categoryFilter !== 'ALL' && acc.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          acc.account_number.toLowerCase().includes(q) ||
          acc.account_name.toLowerCase().includes(q) ||
          (acc.description && acc.description.toLowerCase().includes(q)) ||
          (acc.mapping_key && acc.mapping_key.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [glAccounts, categoryFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800">
                  General Ledger (GL) Accounts & ERP Links
                </h3>
                {isOwner ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <ShieldCheck className="w-3 h-3" /> Owner Configurable
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                    View-Only Access
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure account numbers and account names mapped directly to your POS sales and exported into Excel (.xlsx).
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpenExcelPreview}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
            title="Preview and edit the spreadsheet before downloading"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Preview & Export Excel</span>
          </button>

          {isOwner && (
            <>
              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add GL Account</span>
              </button>

              <button
                onClick={() => setShowResetModal(true)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium border border-slate-300 rounded-lg shadow-xs transition-colors disabled:opacity-50"
                title="Restore default standard hospitality chart of accounts"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Defaults</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter and search bar */}
      <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by account number, account name, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-medium flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Category:
          </span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:bg-white outline-none"
          >
            <option value="ALL">All Categories ({glAccounts.length})</option>
            {allAvailableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table grid */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4 w-28">Account #</th>
                <th className="py-3 px-4">Account Name</th>
                <th className="py-3 px-4 w-32">Classification</th>
                <th className="py-3 px-4">ERP Mapping Function</th>
                <th className="py-3 px-4">Description / Scope</th>
                <th className="py-3 px-4 w-20 text-center">Status</th>
                {isOwner && <th className="py-3 px-4 w-24 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredAccounts.map((acc) => {
                const badge = getCategoryBadgeStyle(acc.category);
                return (
                  <tr key={acc.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Account Number */}
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      <div className="inline-block px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-800 font-semibold">
                        {acc.account_number}
                      </div>
                    </td>

                    {/* Account Name */}
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {acc.account_name}
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        {acc.category}
                      </span>
                    </td>

                    {/* Mapping Key */}
                    <td className="py-3 px-4">
                      <div className="text-slate-600 font-mono text-[11px]">
                        {acc.mapping_key || 'CUSTOM_MAPPING'}
                      </div>
                    </td>

                    {/* Description */}
                    <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={acc.description}>
                      {acc.description || '—'}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center">
                      {acc.is_active ? (
                        <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-medium">
                          Active
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded text-[10px] font-medium">
                          Inactive
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    {isOwner && (
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(acc)}
                            className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                            title="Edit GL account"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setAccountToDelete({ id: acc.id, number: acc.account_number, name: acc.account_name })}
                            disabled={deletingId === acc.id}
                            className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-40"
                            title="Delete GL account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}

              {filteredAccounts.length === 0 && (
                <tr>
                  <td colSpan={isOwner ? 7 : 6} className="py-10 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Layers className="w-6 h-6 text-slate-300" />
                      <p className="font-medium text-slate-600">No GL Accounts Found</p>
                      <p className="text-[11px] text-slate-400">
                        {searchQuery ? 'Try clearing your search query.' : 'Click "Add GL Account" or "Restore Defaults" to populate.'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit GL Account Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded">
                  <BookOpen className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-slate-800 text-sm">
                  {editingAccount ? 'Edit General Ledger Account' : 'Add New General Ledger Account'}
                </h4>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Account Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 4010, 1010"
                    value={formData.account_number}
                    onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Numeric accounting ledger code</p>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Classification Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                  >
                    <option value="REVENUE">Revenue</option>
                    <option value="TAX_LIABILITY">Tax Liability</option>
                    <option value="ASSET">Asset (Cash/Bank Clearing)</option>
                    <option value="EXPENSE">Expense (Discounts)</option>
                    <option value="LIABILITY">Liability (Service Charge)</option>
                    <option value="EQUITY">Equity</option>
                    <option value="__CUSTOM__">+ Add Custom Category / Classification...</option>
                  </select>

                  {formData.category === '__CUSTOM__' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        required
                        placeholder="e.g. Bank 1, Wallet 1, VAT Account, Operating Asset"
                        value={formData.customCategory}
                        onChange={(e) => setFormData({ ...formData, customCategory: e.target.value })}
                        className="w-full px-3 py-2 border border-amber-300 bg-amber-50/50 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                      <p className="text-[10px] text-amber-700 mt-1">Enter your custom classification name for the ERP ledger.</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Account Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Food Sales Revenue, Card Settlement Clearing"
                  value={formData.account_name}
                  onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  POS Register Mapping Function
                </label>
                <select
                  value={formData.mapping_key}
                  onChange={(e) => setFormData({ ...formData, mapping_key: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                >
                  {MAPPING_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Connects this GL code to calculate running register balances in Excel.
                </p>
              </div>

              {formData.mapping_key === 'CREDIT_SETTLEMENT' && (
                <div className="p-3 border border-rose-200 bg-rose-50/40 rounded-lg space-y-3">
                  <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
                    Credit Customer Details (all optional)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Customer Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Ram Sharma"
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Phone Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 98XXXXXXXX"
                      value={formData.customer_phone}
                      onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Address</label>
                    <input
                      type="text"
                      placeholder="e.g. Kathmandu"
                      value={formData.customer_address}
                      onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Extension Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 214"
                      value={formData.customer_extension}
                      onChange={(e) => setFormData({ ...formData, customer_extension: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Office Name</label>
                    <input
                      type="text"
                      placeholder="e.g. ABC Pvt. Ltd."
                      value={formData.customer_office_name}
                      onChange={(e) => setFormData({ ...formData, customer_office_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Designation</label>
                    <input
                      type="text"
                      placeholder="e.g. Manager"
                      value={formData.customer_designation}
                      onChange={(e) => setFormData({ ...formData, customer_designation: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Description / Audit Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional notes regarding the purpose of this accounting link..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="is_active_check"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <label htmlFor="is_active_check" className="text-xs text-slate-700 font-medium">
                  Active in Accounting Reports & Excel Exports
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingAccount ? 'Update GL Account' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {accountToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-800">
                  Delete GL Account {accountToDelete.number}?
                </h3>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                  Are you sure you want to delete <span className="font-semibold text-slate-800">{accountToDelete.number} - {accountToDelete.name}</span>? This will remove the account from your accounting ledger and spreadsheet exports.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAccountToDelete(null)}
                disabled={deletingId !== null}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteAccount}
                disabled={deletingId !== null}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold shadow-xs transition-colors disabled:opacity-50 inline-flex items-center gap-2"
              >
                {deletingId ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Yes, Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Reset Defaults Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-800">
                  Reset Standard Chart of Accounts?
                </h3>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                  This will restore standard hospitality accounting defaults (Food Sales, Bar Sales, VAT, Service Charge, Cash, Card, QR). Any customized mapping keys or accounts will be reset.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                disabled={saving}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmResetDefaults}
                disabled={saving}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold shadow-xs transition-colors disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Restoring...
                  </>
                ) : (
                  'Reset to Defaults'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
