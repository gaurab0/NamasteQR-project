import React, { useState, useEffect } from 'react';
import {
  Sliders,
  X,
  Plus,
  Trash2,
  Tag,
  RefreshCw,
  Check,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { BusinessTaxConfig, TaxRateItem } from '../../types/rbac';
import { rbacService } from '../../services/rbac.service';

export interface TaxConfigurationPanelProps {
  taxConfig: BusinessTaxConfig;
  businessId: string;
  onSaved?: (updated: BusinessTaxConfig) => void;
  onClose?: () => void;
  isInline?: boolean;
}

export const TaxConfigurationPanel: React.FC<TaxConfigurationPanelProps> = ({
  taxConfig,
  businessId,
  onClose,
  onSaved,
  isInline = false,
}) => {
  const [enabled, setEnabled] = useState<boolean>(taxConfig.tax_enabled ?? true);
  const [taxInclusive, setTaxInclusive] = useState<boolean>(
    Boolean(taxConfig.tax_inclusive ?? (taxConfig.rates || []).some((r) => r.is_inclusive))
  );
  const [currency, setCurrency] = useState<string>(taxConfig.currency || 'Rs.');
  const [currencySymbol, setCurrencySymbol] = useState<string>(taxConfig.currency_symbol || 'Rs.');
  const [invoicePrefix, setInvoicePrefix] = useState<string>(taxConfig.invoice_prefix || 'INV-');
  const [orderResetInterval, setOrderResetInterval] = useState<'MANUAL' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>(taxConfig.order_reset_interval || 'MANUAL');
  const [panVatNumber, setPanVatNumber] = useState<string>(taxConfig.pan_vat_number || '');
  const [panVatPrefix, setPanVatPrefix] = useState<string>(taxConfig.pan_vat_prefix || '');
  const [receiptFooterNote, setReceiptFooterNote] = useState<string>(
    taxConfig.receipt_footer_note || 'Thank you for your visit! Please dine with us again.'
  );
  
  // Invoice Header Config
  const [invoiceDisplayName, setInvoiceDisplayName] = useState<string>(taxConfig.invoice_display_name || '');
  const [invoiceSubtitle, setInvoiceSubtitle] = useState<string>(taxConfig.invoice_subtitle || '');
  const [invoiceDocumentTitle, setInvoiceDocumentTitle] = useState<string>(taxConfig.invoice_document_title || '');
  const [invoiceAddress, setInvoiceAddress] = useState<string>(taxConfig.invoice_address || '');
  // Active Promo Code Configuration
  const [promoEnabled, setPromoEnabled] = useState<boolean>(taxConfig.active_promo_enabled ?? true);
  const [promoCode, setPromoCode] = useState<string>(taxConfig.active_promo_code || 'WELCOME10');
  const [promoPercent, setPromoPercent] = useState<number>(taxConfig.active_promo_percent ?? 10);
  const [promoDescription, setPromoDescription] = useState<string>(
    taxConfig.active_promo_description || 'Active Promotional Voucher Discount'
  );
  const [rates, setRates] = useState<TaxRateItem[]>(taxConfig.rates || []);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    setEnabled(taxConfig.tax_enabled ?? true);
    setTaxInclusive(
      Boolean(taxConfig.tax_inclusive ?? (taxConfig.rates || []).some((r) => r.is_inclusive))
    );
    setCurrency(taxConfig.currency || 'Rs.');
    setCurrencySymbol(taxConfig.currency_symbol || 'Rs.');
    setInvoicePrefix(taxConfig.invoice_prefix || 'INV-');
    setOrderResetInterval(taxConfig.order_reset_interval || 'MANUAL');
    setPanVatNumber(taxConfig.pan_vat_number || '');
    setPanVatPrefix(taxConfig.pan_vat_prefix || '');
    setReceiptFooterNote(
      taxConfig.receipt_footer_note || 'Thank you for your visit! Please dine with us again.'
    );
    setInvoiceDisplayName(taxConfig.invoice_display_name || '');
    setInvoiceSubtitle(taxConfig.invoice_subtitle || '');
    setInvoiceDocumentTitle(taxConfig.invoice_document_title || '');
    setInvoiceAddress(taxConfig.invoice_address || '');
    setPromoEnabled(taxConfig.active_promo_enabled ?? true);
    setPromoCode(taxConfig.active_promo_code || 'WELCOME10');
    setPromoPercent(taxConfig.active_promo_percent ?? 10);
    setPromoDescription(
      taxConfig.active_promo_description || 'Active Promotional Voucher Discount'
    );
    setRates(taxConfig.rates || []);
  }, [taxConfig]);

  // New tax rate form
  const [newTaxName, setNewTaxName] = useState<string>('');
  const [newTaxRate, setNewTaxRate] = useState<number>(5);
  const [newTaxDesc, setNewTaxDesc] = useState<string>('');

  const handleToggleTaxInclusive = async (nextInclusive: boolean) => {
    const syncedRates = rates.map((r) => ({ ...r, is_inclusive: nextInclusive }));
    setTaxInclusive(nextInclusive);
    setRates(syncedRates);
    try {
      const result = await rbacService.updateTaxConfigApi(
        {
          tax_enabled: enabled,
          tax_inclusive: nextInclusive,
          rates: syncedRates,
        },
        businessId
      );
      if (onSaved) onSaved(result);
      setFeedbackMsg({
        text: `Switched to ${nextInclusive ? 'Inclusive of VAT%' : 'Exclusive of VAT%'} mode!`,
        type: 'success',
      });
      setTimeout(() => setFeedbackMsg(null), 3500);
    } catch {
      // Fallback: user can still click Save Tax Configuration
    }
  };

  const handleToggleRate = (index: number) => {
    setRates((prev) =>
      prev.map((r, i) => (i === index ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleRatePercentChange = (index: number, val: number) => {
    setRates((prev) =>
      prev.map((r, i) => (i === index ? { ...r, rate_percent: val } : r))
    );
  };

  const handleDeleteRate = (index: number) => {
    setRates((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddCustomRate = () => {
    if (!newTaxName.trim()) return;
    const newRateItem: TaxRateItem = {
      id: `tax-${Date.now()}`,
      name: newTaxName.trim(),
      rate_percent: Number(newTaxRate) || 0,
      enabled: true,
      is_inclusive: taxInclusive,
      description: newTaxDesc.trim() || `${newTaxName} (${newTaxRate}%)`,
    };
    setRates((prev) => [...prev, newRateItem]);
    setNewTaxName('');
    setNewTaxRate(5);
    setNewTaxDesc('');
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setFeedbackMsg(null);
      const syncedRates = rates.map((r) => ({ ...r, is_inclusive: taxInclusive }));
      const updated: Partial<BusinessTaxConfig> = {
        tax_enabled: enabled,
        tax_inclusive: taxInclusive,
        currency,
        currency_symbol: currencySymbol,
        invoice_prefix: invoicePrefix,
        order_reset_interval: orderResetInterval,
        pan_vat_number: panVatNumber,
        pan_vat_prefix: panVatPrefix,
        receipt_footer_note: receiptFooterNote,
        invoice_display_name: invoiceDisplayName,
        invoice_subtitle: invoiceSubtitle,
        invoice_document_title: invoiceDocumentTitle,
        invoice_address: invoiceAddress,
        active_promo_enabled: promoEnabled,
        active_promo_code: promoCode.trim().toUpperCase(),
        active_promo_percent: Number(promoPercent) || 0,
        active_promo_description: promoDescription.trim(),
        rates: syncedRates,
      };

      const result = await rbacService.updateTaxConfigApi(updated, businessId);
      if (onSaved) onSaved(result);
      setFeedbackMsg({ text: 'Tax and billing configuration updated successfully!', type: 'success' });
      setTimeout(() => setFeedbackMsg(null), 4000);
      if (!isInline && onClose) {
        onClose();
      }
    } catch (err: any) {
      setFeedbackMsg({ text: err.message || 'Failed to save tax configuration', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const content = (
    <div className={`space-y-5 ${isInline ? '' : 'p-6 max-h-[90vh] overflow-y-auto'}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
        <div className="flex items-center gap-2.5">
          <span className="p-2 rounded-xl bg-amber-100 text-amber-700">
            <Sliders className="w-5 h-5" />
          </span>
          <div>
            <h3 className="font-bold text-base text-zinc-900">Tax System Configuration</h3>
            <p className="text-xs text-zinc-500">
              Configure taxation rates, service charges, currency, and invoice rules
            </p>
          </div>
        </div>
        {!isInline && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {feedbackMsg && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Global Tax Toggle */}
      <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/80 flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-zinc-900 block">
            Enable Business Tax Calculations
          </span>
          <span className="text-[11px] text-zinc-500">
            When disabled, orders and POS receipts will charge flat subtotal without automatic tax additions.
          </span>
        </div>
        <button
          id="toggle-tax-system"
          type="button"
          onClick={() => setEnabled(!enabled)}
          className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
            enabled ? 'bg-amber-600' : 'bg-zinc-300'
          }`}
        >
          <div
            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Master VAT Pricing Mode Toggle: Exclusive of VAT% vs Inclusive of VAT% */}
      <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/90 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-900">
                VAT Pricing Calculation Mode
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                  taxInclusive
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}
              >
                {taxInclusive ? 'Inclusive of VAT%' : 'Exclusive of VAT%'}
              </span>
            </div>
            <span className="text-[11px] text-zinc-600 block mt-0.5">
              {taxInclusive
                ? 'Inclusive Mode: Menu item prices already include VAT%. Subtotal and VAT amount are reverse-calculated from the total.'
                : 'Exclusive Mode: Menu item prices represent the Subtotal. VAT% is added on top of the Subtotal to form the Grand Total.'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-zinc-200 shrink-0">
            <button
              id="btn-tax-mode-exclusive"
              type="button"
              onClick={() => handleToggleTaxInclusive(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                !taxInclusive
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              Exclusive of VAT%
            </button>
            <button
              id="btn-tax-mode-inclusive"
              type="button"
              onClick={() => handleToggleTaxInclusive(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                taxInclusive
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              Inclusive of VAT%
            </button>
          </div>
        </div>
        <div className="text-[10px] text-zinc-500 border-t border-amber-200/60 pt-2">
          {taxInclusive
            ? 'Example (13% VAT on Rs. 400 bill): Grand Total = Rs. 400.00 → Subtotal = Rs. 353.98, 13% VAT = Rs. 46.02. Discounts are deducted directly from the Grand Total without altering VAT.'
            : 'Example (13% VAT on Rs. 400 subtotal): Subtotal = Rs. 400.00 + 13% VAT (Rs. 52.00) = Grand Total Rs. 452.00. Discounts are deducted directly from the Grand Total without altering VAT.'}
        </div>
      </div>

      {/* Currency & Business Registration */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold text-zinc-700 block mb-1">
            Currency Symbol / Label
          </label>
          <input
            id="input-tax-currency"
            type="text"
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              setCurrencySymbol(e.target.value);
            }}
            placeholder="Rs. or $ or €"
            className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-zinc-700 block mb-1">
            Receipt Slip Footer Note
          </label>
          <input
            id="input-footer-note"
            type="text"
            value={receiptFooterNote}
            onChange={(e) => setReceiptFooterNote(e.target.value)}
            placeholder="Thank you for dining with us!"
            className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-xs font-semibold focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Invoice Header Configuration Section */}
      <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-zinc-600" />
          <div>
            <span className="text-xs font-bold text-zinc-900 block">
              Invoice Header Configuration
            </span>
            <span className="text-[11px] text-zinc-500">
              Customize the header display of the final printed invoice receipt. Leave blank to use business defaults.
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Document Title & Invoice Prefix */}
          <div>
            <label className="text-[11px] font-bold text-zinc-700 block mb-1">
              Document Title (e.g. TAX INVOICE)
            </label>
            <input
              id="input-invoice-document-title"
              type="text"
              value={invoiceDocumentTitle}
              onChange={(e) => setInvoiceDocumentTitle(e.target.value)}
              placeholder="e.g. TAX INVOICE"
              className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-semibold focus:ring-2 focus:ring-amber-500"
            />
            <span className="text-[10px] text-zinc-500 mt-0.5 block">
              Title displayed center-bold on receipt (separate from Invoice Prefix)
            </span>
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-700 block mb-1">
              Invoice Prefix
            </label>
            <input
              id="input-invoice-prefix"
              type="text"
              value={invoicePrefix}
              onChange={(e) => setInvoicePrefix(e.target.value)}
              placeholder="e.g. INV- or BILL-"
              className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-semibold focus:ring-2 focus:ring-amber-500"
            />
            <span className="text-[10px] text-zinc-500 mt-0.5 block">
              Prefix for sequential invoice numbers only (e.g. {invoicePrefix || 'INV-'}01)
            </span>
          </div>

          {/* Display Name */}
          <div className="sm:col-span-2">
            <label className="text-[11px] font-bold text-zinc-700 block mb-1">
              Display Name (e.g. Restaurant Name)
            </label>
            <input
              id="input-invoice-display-name"
              type="text"
              value={invoiceDisplayName}
              onChange={(e) => setInvoiceDisplayName(e.target.value)}
              placeholder="Business Name Override"
              className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-semibold focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Business PAN/VAT Registration Number & Prefix (Free-form format) */}
          <div>
            <label className="text-[11px] font-bold text-zinc-700 block mb-1">
              Business PAN / VAT Prefix / Label
            </label>
            <input
              id="input-tax-pan-prefix"
              type="text"
              value={panVatPrefix}
              onChange={(e) => setPanVatPrefix(e.target.value)}
              placeholder="e.g. PAN / VAT #: or VAT No: or PAN:"
              className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-semibold focus:ring-2 focus:ring-amber-500"
            />
            <span className="text-[10px] text-zinc-500 mt-0.5 block">
              Free-form prefix manually typed (e.g. "VAT No:", "PAN / VAT #:", "Tax ID:")
            </span>
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-700 block mb-1">
              Business PAN / VAT Registration Number
            </label>
            <input
              id="input-tax-pan"
              type="text"
              value={panVatNumber}
              onChange={(e) => setPanVatNumber(e.target.value)}
              placeholder="e.g. 12234883498"
              className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-semibold focus:ring-2 focus:ring-amber-500"
            />
            <span className="text-[10px] text-zinc-500 mt-0.5 block">
              Registration number manually typed
            </span>
          </div>

          {/* Subtitle */}
          <div className="sm:col-span-2">
            <label className="text-[11px] font-bold text-zinc-700 block mb-1">
              Subtitle (Location/Description - Multi-line)
            </label>
            <textarea
              id="input-invoice-subtitle"
              value={invoiceSubtitle}
              onChange={(e) => setInvoiceSubtitle(e.target.value)}
              placeholder="e.g. Branch Name\nPhone: 1234567890"
              rows={2}
              className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs focus:ring-2 focus:ring-amber-500 whitespace-pre-line"
            />
          </div>

          {/* Address */}
          <div className="sm:col-span-2">
            <label className="text-[11px] font-bold text-zinc-700 block mb-1">
              Address (Multi-line)
            </label>
            <textarea
              id="input-invoice-address"
              value={invoiceAddress}
              onChange={(e) => setInvoiceAddress(e.target.value)}
              placeholder="e.g. 123 Main St\nCity, Country"
              rows={2}
              className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs focus:ring-2 focus:ring-amber-500 whitespace-pre-line"
            />
          </div>
        </div>

        {/* Live Header Preview Box */}
        {(invoiceDisplayName || invoiceSubtitle || invoiceAddress || panVatNumber || panVatPrefix || invoiceDocumentTitle || invoicePrefix) && (
          <div className="mt-2 p-3 rounded-lg bg-white border border-zinc-200 text-center space-y-0.5">
            <span className="text-[10px] font-bold text-amber-600 block uppercase tracking-wider mb-1">
              Header Preview on Receipt
            </span>
            <div className="font-bold text-xs text-zinc-900">
              {invoiceDisplayName || 'Business Name Override'}
            </div>
            {invoiceSubtitle && (
              <div className="text-[10px] text-zinc-500 whitespace-pre-line">
                {invoiceSubtitle}
              </div>
            )}
            {invoiceAddress && (
              <div className="text-[10px] text-zinc-500 whitespace-pre-line">
                {invoiceAddress}
              </div>
            )}
            {(panVatPrefix || panVatNumber) && (
              <div className="text-[10px] text-zinc-700 font-bold">
                {panVatPrefix ? `${panVatPrefix} ` : 'PAN / VAT #: '}{panVatNumber || '123456789'}
              </div>
            )}
            <div className="pt-1 border-t border-dashed border-zinc-200 mt-1 font-mono text-[10px] text-zinc-800 font-bold">
              {invoiceDocumentTitle || 'TAX INVOICE'}
              {invoicePrefix ? ` (${invoicePrefix})` : ''}
            </div>
          </div>
        )}
      </div>

      {/* Active Promo Code Configuration Section */}
      <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/90 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-amber-600" />
            <div>
              <span className="text-xs font-bold text-amber-950 block">
                Active Promo Code & Discount
              </span>
              <span className="text-[11px] text-amber-700">
                Configure the single official discount code customers can apply at final bill checkout.
              </span>
            </div>
          </div>
          <button
            id="toggle-promo-system"
            type="button"
            onClick={() => setPromoEnabled(!promoEnabled)}
            className={`w-11 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors ${
              promoEnabled ? 'bg-amber-600' : 'bg-zinc-300'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                promoEnabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {promoEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="text-[11px] font-bold text-zinc-700 block mb-1">
                Promo Code
              </label>
              <input
                id="input-promo-code-config"
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="e.g. FESTIVE20"
                className="w-full px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-zinc-700 block mb-1">
                Discount Percentage (%)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id="input-promo-percent-config"
                  type="number"
                  min="1"
                  max="100"
                  value={promoPercent}
                  onChange={(e) => setPromoPercent(Math.max(1, Math.min(100, parseFloat(e.target.value) || 0)))}
                  placeholder="10"
                  className="w-full px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-bold focus:ring-2 focus:ring-amber-500"
                />
                <span className="text-xs font-bold text-amber-800">%</span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-zinc-700 block mb-1">
                Description / Label
              </label>
              <input
                id="input-promo-desc-config"
                type="text"
                value={promoDescription}
                onChange={(e) => setPromoDescription(e.target.value)}
                placeholder="Special Discount Offer"
                className="w-full px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Configured Tax Rates List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
            Tax Rates & Charges Applied
          </span>
          <span className="text-[11px] text-zinc-400">
            Applied automatically to POS transactions
          </span>
        </div>

        <div className="space-y-2">
          {rates.map((rate, idx) => (
            <div
              key={rate.id}
              className="p-3 rounded-xl border border-zinc-200 bg-white flex items-center justify-between gap-3 shadow-2xs"
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={rate.enabled}
                  onChange={() => handleToggleRate(idx)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-zinc-800 block">
                    {rate.name}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {rate.description || `${rate.rate_percent}% tax`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={rate.rate_percent}
                    onChange={(e) => handleRatePercentChange(idx, parseFloat(e.target.value) || 0)}
                    className="w-16 px-2 py-1 rounded-lg border border-zinc-300 text-xs text-right font-bold focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-xs font-bold text-zinc-500">%</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteRate(idx)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Remove this tax rule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add New Custom Tax Form */}
      <div className="p-3.5 rounded-xl bg-zinc-50 border border-dashed border-zinc-300 space-y-2.5">
        <span className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5 text-amber-600" />
          Add Custom Tax or Surcharge
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="Tax name (e.g. State GST, Luxury Tax)"
            value={newTaxName}
            onChange={(e) => setNewTaxName(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-zinc-300 text-xs bg-white focus:ring-2 focus:ring-amber-500"
          />
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              placeholder="Rate %"
              value={newTaxRate}
              onChange={(e) => setNewTaxRate(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-xs bg-white focus:ring-2 focus:ring-amber-500"
            />
            <span className="text-xs font-bold text-zinc-500">%</span>
          </div>
          <button
            id="btn-add-custom-tax"
            type="button"
            onClick={handleAddCustomRate}
            disabled={!newTaxName.trim()}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              newTaxName.trim()
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
            }`}
          >
            Add Tax Rate
          </button>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-100">
        {!isInline && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        )}
        <button
          id="btn-save-tax-config"
          type="button"
          disabled={isSaving}
          onClick={handleSave}
          className="px-5 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
        >
          {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {isSaving ? 'Saving Changes...' : 'Save Tax Configuration'}
        </button>
      </div>
    </div>
  );

  if (isInline) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm">
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-zinc-200">
        {content}
      </div>
    </div>
  );
};
