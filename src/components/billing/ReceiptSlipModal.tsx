import React from 'react';
import { Printer, X } from 'lucide-react';
import { usePrinter } from '../../contexts/PrinterContext';
import { SaleRecord, BusinessTaxConfig } from '../../types/rbac';
import { Business } from '../../types/auth';
import { renderFormattedDate } from '../../utils/dateFormatter';
import { computeOrderBillableAmounts } from '../../utils/taxCalculations';

export const formatPanVatDisplay = (cfg?: BusinessTaxConfig | null) => {
  if (!cfg) return null;
  const pfx = cfg.pan_vat_prefix?.trim();
  const num = cfg.pan_vat_number?.trim();
  if (pfx && num) return `${pfx} ${num}`;
  if (pfx && !num) return pfx;
  if (!pfx && num) {
    if (/^[A-Za-z]/.test(num)) return num;
    return `PAN / VAT #: ${num}`;
  }
  return null;
};

export const formatDocumentTitleWithPrefix = (cfg?: BusinessTaxConfig | null, defaultTitle = 'TAX INVOICE') => {
  return cfg?.invoice_document_title?.trim() || defaultTitle;
};

export const getInvoicePrefix = (cfg?: BusinessTaxConfig | null) => {
  return cfg?.invoice_prefix?.trim() || '';
};

export interface ReceiptSlipModalProps {
  sale: SaleRecord;
  business: Business;
  taxConfig: BusinessTaxConfig | null;
  onClose: () => void;
}

export const ReceiptSlipModal: React.FC<ReceiptSlipModalProps> = ({
  sale,
  business,
  taxConfig,
  onClose,
}) => {
  const { dispatchPrint } = usePrinter();

  const handlePrint = async () => {
    await dispatchPrint('BILL', { ...sale, tax_config: taxConfig });
  };

  const namedSaleItems = (sale.items || []).filter((item) => (item.name || '').trim().length > 0);
  const salePkgComp =
    Boolean((sale as any).is_packaging_comp) ||
    (Number(sale.packaging_qty || 0) > 0 &&
      sale.packaging_charge !== undefined &&
      sale.packaging_charge !== null &&
      Number(sale.packaging_charge) === 0);
  const saleBillable = computeOrderBillableAmounts(namedSaleItems, {
    packagingFeeRate: Math.max(0, Number(taxConfig?.packaging_fee ?? 10) || 0),
    isPackagingComp: salePkgComp,
    explicitPackagingCharge:
      sale.packaging_charge !== undefined && sale.packaging_charge !== null
        ? Number(sale.packaging_charge)
        : undefined,
    explicitPackagingQty:
      sale.packaging_qty !== undefined && sale.packaging_qty !== null
        ? Number(sale.packaging_qty)
        : undefined,
  });

  const computedItemsSubtotal = saleBillable.itemsMenuTotal;
  const packagingCharge = saleBillable.packagingTotal;
  const packagingQty = saleBillable.packagingQty;

  const displaySubtotal = (sale.subtotal > 0 || (computedItemsSubtotal === 0 && packagingCharge === 0))
    ? sale.subtotal
    : computedItemsSubtotal + packagingCharge;

  const displayTotalAmount = (sale.total_amount > 0 || (computedItemsSubtotal === 0 && packagingCharge === 0))
    ? sale.total_amount
    : (displaySubtotal + (sale.total_tax || 0) - (sale.discount_amount || 0));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-zinc-200 max-h-[90vh] overflow-y-auto">
        {/* Actions Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 print:hidden">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
            Invoice Preview
          </span>
          <div className="flex items-center gap-2">
            <button
              id="btn-print-receipt"
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Slip
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Thermal Receipt Container */}
        <div className="bg-zinc-50/50 p-6 rounded-xl border border-zinc-200 font-mono text-xs text-zinc-800 space-y-4 shadow-inner">
          {/* Business Header */}
          <div className="text-center space-y-1">
            <h2 className="text-base font-black text-zinc-950 uppercase tracking-tight">
              {taxConfig?.invoice_display_name || business.name}
            </h2>
            {taxConfig?.invoice_subtitle ? (
              <p className="text-[10px] text-zinc-500 whitespace-pre-line">
                {taxConfig.invoice_subtitle}
              </p>
            ) : (
              <p className="text-[10px] text-zinc-500">
                {business.location || 'Main Dining & Hospitality Lounge'}
              </p>
            )}
            {taxConfig?.invoice_address && (
              <p className="text-[10px] text-zinc-500 whitespace-pre-line">
                {taxConfig.invoice_address}
              </p>
            )}
            {formatPanVatDisplay(taxConfig) && (
              <p className="text-[10px] text-zinc-600 font-bold">
                {formatPanVatDisplay(taxConfig)}
              </p>
            )}
            <div className="border-b border-dashed border-zinc-300 my-2" />

            {/* Document Title with Prefix Header Banner */}
            <div className="text-center py-0.5 my-1">
              <span className="font-black text-xs uppercase tracking-wider text-zinc-950 border-b border-dashed border-zinc-400 pb-0.5 inline-block">
                {formatDocumentTitleWithPrefix(taxConfig, 'TAX INVOICE')}
              </span>
            </div>
          </div>

          {/* Invoice Meta */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-zinc-500">{taxConfig?.order_label || 'Order No:'}</span>
              <span className="font-bold text-zinc-900">
                {sale.order_number || (sale.order_id ? (sale.order_id.replace(/^order-(pos-)?/, '').slice(0, 8).toUpperCase()) : (sale.id ? String(sale.id).slice(0, 8).toUpperCase() : 'ORD'))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">{taxConfig?.invoice_label || (taxConfig?.invoice_prefix ? `${taxConfig.invoice_prefix} Invoice:` : 'Invoice No.:')}</span>
              <span className="font-bold text-zinc-900">{sale.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Date:</span>
              <span>{renderFormattedDate(sale.created_at, business?.date_format_billing || 'ENGLISH', ' | ', business?.operations_config?.timezone)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Customer:</span>
              <span className="font-bold">{sale.customer_name}</span>
            </div>
            {sale.customer_pan && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Customer PAN:</span>
                <span className="font-bold">{sale.customer_pan}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-zinc-500">
                {sale.table_number && /^table\s/i.test(sale.table_number) ? 'Table:' : 'Service:'}
              </span>
              <span className="font-bold">
                {sale.table_number
                  ? (/^\d+$/.test(sale.table_number.trim()) ? `Table ${sale.table_number}` : sale.table_number)
                  : sale.sale_type === 'TAKEAWAY'
                  ? 'Takeaway'
                  : sale.sale_type === 'DELIVERY'
                  ? 'Delivery'
                  : 'Dine-In Restaurant'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Cashier:</span>
              <span>{sale.cashier_name}</span>
            </div>
          </div>

          <div className="border-b border-dashed border-zinc-300 my-2" />

          {/* Items List */}
          <div className="space-y-1.5 text-[11px]">
            {sale.items
              .filter((item) => (item.name || '').trim().length > 0)
              .map((item, idx) => {
              const qty = Number(item.quantity) || 1;
              const compQty = Math.max(0, Math.min(qty, Number(item.comp_qty) || (item.is_comp ? qty : 0)));
              const isComp = Boolean(item.is_comp || compQty >= qty);
              const billedQty = isComp ? 0 : Math.max(0, qty - compQty);
              const uPrice = Number(item.unit_price ?? item.price ?? 0);
              const tPrice = isComp ? 0 : billedQty * uPrice;

              return (
                <div key={idx} className="flex justify-between items-start">
                  <div className="flex-1 pr-2">
                    <span className="font-bold">{item.name}</span>
                    {(compQty > 0 || isComp) && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold uppercase tracking-wider">
                        {isComp ? 'COMPLIMENTARY' : `${compQty}× COMP`}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500 block">
                      {isComp ? (
                        `${qty} x ${sale.currency} 0.00 (Complimentary)`
                      ) : compQty > 0 ? (
                        `${billedQty} x ${sale.currency} ${uPrice.toFixed(2)} (+${compQty}x Comp)`
                      ) : (
                        `${qty} x ${sale.currency} ${uPrice.toFixed(2)}`
                      )}
                    </span>
                  </div>
                  <span className="font-bold shrink-0">
                    {sale.currency} {tPrice.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="border-b border-dashed border-zinc-300 my-2" />

          {/* Calculations Breakdown */}
          <div className="space-y-1 text-[11px]">
            {packagingQty > 0 && (
              <div className="flex justify-between text-zinc-700 font-semibold">
                <span>Packaging ({packagingQty} pkgs):</span>
                <span>
                  {packagingCharge === 0 ? `Complimentary (${sale.currency} 0.00)` : `+${sale.currency} ${packagingCharge.toFixed(2)}`}
                </span>
              </div>
            )}
            <div className="flex justify-between text-zinc-600">
              <span>Subtotal:</span>
              <span>
                {sale.currency} {displaySubtotal.toFixed(2)}
              </span>
            </div>

            {sale.promo_code && sale.promo_discount && sale.promo_discount > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Promo Code ({sale.promo_code}):</span>
                <span>
                  -{sale.currency} {sale.promo_discount.toFixed(2)}
                </span>
              </div>
            )}

            {sale.discount_amount > 0 && (!sale.promo_code || (sale.discount_amount > (sale.promo_discount || 0))) && (
              <div className="flex justify-between text-rose-600">
                <span>
                  Discount{sale.discount_percent > 0 && !sale.promo_code ? ` (${sale.discount_percent}%)` : ''}:
                </span>
                <span>
                  -{sale.currency} {(sale.promo_code ? Math.max(0, sale.discount_amount - (sale.promo_discount || 0)) : sale.discount_amount).toFixed(2)}
                </span>
              </div>
            )}

            {Math.max(Number(sale.discount_amount) || 0, Number(sale.promo_discount) || 0) > 0 && (
              <div className="flex justify-between text-zinc-700 font-semibold border-t border-dashed border-zinc-200 pt-0.5">
                <span>Taxable Amount:</span>
                <span>
                  {sale.currency} {Math.max(0, displaySubtotal - (Number(sale.discount_amount) || Number(sale.promo_discount) || 0)).toFixed(2)}
                </span>
              </div>
            )}

            {sale.taxes.map((t, tIdx) => (
              <div key={t.id || `${t.name}-${tIdx}`} className="flex justify-between text-zinc-600">
                <span>
                  {t.name} ({t.rate_percent}%):
                </span>
                <span>
                  +{sale.currency} {t.amount.toFixed(2)}
                </span>
              </div>
            ))}

            <div className="border-b border-zinc-800 pt-1 my-1" />

            <div className="flex justify-between text-sm font-black text-zinc-950">
              <span>TOTAL PAID:</span>
              <span>
                {sale.currency} {displayTotalAmount.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
              <span>Payment Mode:</span>
              <span className="font-bold text-zinc-800">{sale.payment_method === 'CREDIT' && sale.credit_gl_account_name ? `Credit — ${sale.credit_gl_account_name}` : sale.payment_method}</span>
            </div>

            {sale.comp_reason && (
              <div className="flex justify-between text-[10px] text-amber-800 pt-0.5">
                <span>Comp Reason:</span>
                <span className="font-semibold">{sale.comp_reason}</span>
              </div>
            )}
          </div>

          <div className="border-b border-dashed border-zinc-300 my-2" />

          {/* Receipt Footer */}
          <div className="text-center text-[10px] text-zinc-500 space-y-1 pt-1">
            <p className="font-semibold">
              {taxConfig?.receipt_footer_note || 'Thank you for your visit! Please dine with us again.'}
            </p>
            <p className="text-[9px] text-zinc-400">Powered by NamasteQR Restaurant POS Engine</p>
          </div>
        </div>
      </div>
    </div>
  );
};

