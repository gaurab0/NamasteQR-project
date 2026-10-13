import type { BusinessTaxConfig, SaleTaxBreakdown, TableOrder } from '../types/rbac';

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Resolves whether the business tax configuration is set to Inclusive of VAT% mode.
 */
export function isTaxInclusiveMode(taxConfig?: BusinessTaxConfig | null): boolean {
  if (!taxConfig) return false;
  if (typeof taxConfig.tax_inclusive === 'boolean') {
    return taxConfig.tax_inclusive;
  }
  if (Array.isArray(taxConfig.rates)) {
    const enabledRates = taxConfig.rates.filter((r) => r.enabled);
    if (enabledRates.length > 0) {
      return enabledRates.some((r) => Boolean(r.is_inclusive));
    }
    return taxConfig.rates.some((r) => Boolean(r.is_inclusive));
  }
  return false;
}

export interface BillCalculationInput {
  /** Sum of (item.price * item.quantity) from menu pricing */
  itemsMenuTotal: number;
  taxConfig?: BusinessTaxConfig | null;
  /** Optional manual percentage discount (0-100) */
  manualDiscountPercent?: number;
  /** Optional manual flat discount amount */
  manualFlatDiscount?: number;
  /** Alias for manualFlatDiscount */
  flatDiscountAmount?: number;
  /** Optional promo code percentage discount (0-100) */
  promoDiscountPercent?: number;
  /** Optional fallback order for when taxConfig hasn't loaded yet */
  fallbackOrder?: Partial<TableOrder> | null;
  /** Optional fallback taxes list from an order when taxConfig hasn't loaded yet */
  fallbackTaxes?: any[];
  /** Optional fallback tax amount from an order when taxConfig hasn't loaded yet */
  fallbackTaxAmount?: number;
}

export interface BillCalculationResult {
  isInclusive: boolean;
  /** Subtotal (reverse-calculated net amount in inclusive mode; menu items total in exclusive mode) */
  subtotal: number;
  taxesList: SaleTaxBreakdown[];
  totalTax: number;
  serviceChargeAmount: number;
  /** Pre-discount Grand Total = round2(subtotal + totalTax) */
  grossTotal: number;
  manualDiscountAmount: number;
  promoDiscountAmount: number;
  totalDiscountAmount: number;
  /** Final payable Grand Total after deducting discounts from grossTotal */
  grandTotal: number;
}

/**
 * Calculates Subtotal, Taxes, Discounts, and Grand Total for both Exclusive and Inclusive of VAT% modes.
 *
 * Rules:
 * 1. Exclusive mode:
 *    - subtotal = round2(itemsMenuTotal)
 *    - each tax = round2(subtotal * rate / 100)
 *    - grossTotal = round2(subtotal + totalTax)
 * 2. Inclusive mode:
 *    - grossTotal = round2(itemsMenuTotal)
 *    - subtotal = round2(grossTotal / (1 + totalRatePercent / 100))
 *    - exactTotalTax = round2(grossTotal - subtotal)
 *    - each tax = round2(subtotal * rate / 100), reconciled for any 1-paisa rounding residual so subtotal + totalTax === grossTotal
 * 3. Discounts (both modes):
 *    - Never combined with VAT (never deducted from subtotal before VAT calculation).
 *    - Deducted directly from grossTotal (pre-discount Grand Total).
 */
export function calculateBillTotals(input: BillCalculationInput): BillCalculationResult {
  const menuTotal = Math.max(0, round2(input.itemsMenuTotal));
  const { taxConfig, fallbackOrder, fallbackTaxes, fallbackTaxAmount } = input;
  const orderTaxes = (fallbackOrder?.taxes && fallbackOrder.taxes.length > 0)
    ? fallbackOrder.taxes
    : (Array.isArray(fallbackTaxes) && fallbackTaxes.length > 0 ? fallbackTaxes : []);
  const orderTaxAmt = fallbackOrder?.tax_amount ?? fallbackTaxAmount;

  let isTaxEnabled = true;
  let isInclusive = false;
  let activeRates: Array<{ id?: string; name: string; rate_percent: number }> = [];

  if (taxConfig) {
    isTaxEnabled = taxConfig.tax_enabled ?? true;
    isInclusive = isTaxInclusiveMode(taxConfig);
    const rawRates = Array.isArray(taxConfig.rates) ? taxConfig.rates : [];
    if (isTaxEnabled) {
      if (rawRates.length > 0) {
        activeRates = rawRates
          .filter((r) => r.enabled && (Number(r.rate_percent) || 0) > 0)
          .map((r) => ({
            id: r.id,
            name: r.name || 'VAT',
            rate_percent: Number(r.rate_percent) || 0,
          }));
      } else if (orderTaxes.length > 0) {
        isInclusive = Boolean(taxConfig.tax_inclusive ?? orderTaxes.some((t: any) => Boolean(t.is_inclusive)));
        activeRates = orderTaxes
          .filter((t: any) => (Number(t.rate_percent) || 0) > 0)
          .map((t: any, idx: number) => ({
            id: t.id || t.tax_id || `tax-${idx}`,
            name: t.name || 'VAT',
            rate_percent: Number(t.rate_percent) || 13,
          }));
      } else {
        activeRates = [{ id: 'vat', name: 'VAT', rate_percent: 13 }];
      }
    }
  } else {
    // Fallback when taxConfig has not yet loaded
    if (orderTaxes.length > 0) {
      isInclusive = orderTaxes.some((t: any) => Boolean(t.is_inclusive));
      activeRates = orderTaxes
        .filter((t: any) => (Number(t.rate_percent) || 0) > 0)
        .map((t: any, idx: number) => ({
          id: t.id || t.tax_id || `tax-${idx}`,
          name: t.name || 'VAT',
          rate_percent: Number(t.rate_percent) || 13,
        }));
    } else if (typeof orderTaxAmt === 'number' && orderTaxAmt === 0 && fallbackOrder && fallbackOrder.subtotal === fallbackOrder.total_amount && (fallbackOrder.subtotal || 0) > 0) {
      // Explicitly 0 tax on order
      isTaxEnabled = false;
      activeRates = [];
    } else {
      isInclusive = false;
      activeRates = [{ id: 'vat', name: 'VAT', rate_percent: 13 }];
    }
  }

  let subtotal = menuTotal;
  let taxesList: SaleTaxBreakdown[] = [];
  let totalTax = 0;
  let serviceChargeAmount = 0;
  let grossTotal = menuTotal;

  const totalRatePercent = activeRates.reduce((sum, r) => sum + (Number(r.rate_percent) || 0), 0);

  if (isTaxEnabled && activeRates.length > 0 && totalRatePercent > 0 && menuTotal > 0) {
    if (isInclusive) {
      grossTotal = menuTotal;
      subtotal = round2(grossTotal / (1 + totalRatePercent / 100));
      const exactTotalTax = round2(grossTotal - subtotal);

      taxesList = activeRates.map((rate) => {
        const rateVal = Number(rate.rate_percent) || 0;
        const amt = round2((subtotal * rateVal) / 100);
        return {
          id: rate.id,
          name: rate.name,
          rate_percent: rateVal,
          amount: amt,
          is_inclusive: true,
        };
      });

      const sumTaxes = round2(taxesList.reduce((acc, t) => acc + t.amount, 0));
      const residual = round2(exactTotalTax - sumTaxes);
      if (Math.abs(residual) > 0 && taxesList.length > 0) {
        taxesList[0].amount = round2(taxesList[0].amount + residual);
      }

      totalTax = exactTotalTax;
      serviceChargeAmount = round2(
        taxesList
          .filter((t) => t.name.toLowerCase().includes('service'))
          .reduce((acc, t) => acc + t.amount, 0)
      );
    } else {
      subtotal = menuTotal;
      taxesList = activeRates.map((rate) => {
        const rateVal = Number(rate.rate_percent) || 0;
        const amt = round2((subtotal * rateVal) / 100);
        return {
          id: rate.id,
          name: rate.name,
          rate_percent: rateVal,
          amount: amt,
          is_inclusive: false,
        };
      });

      totalTax = round2(taxesList.reduce((acc, t) => acc + t.amount, 0));
      serviceChargeAmount = round2(
        taxesList
          .filter((t) => t.name.toLowerCase().includes('service'))
          .reduce((acc, t) => acc + t.amount, 0)
      );
      grossTotal = round2(subtotal + totalTax);
    }
  }

  // Discounts: Never combined with VAT; deducted from grossTotal (pre-discount Grand Total) in both modes
  const manualPct = Math.max(0, Number(input.manualDiscountPercent) || 0);
  const manualFlat = Math.max(0, Number(input.manualFlatDiscount ?? input.flatDiscountAmount) || 0);
  const promoPct = Math.max(0, Number(input.promoDiscountPercent) || 0);

  const manualPercentPart = manualPct > 0 ? (grossTotal * manualPct) / 100 : 0;
  const manualDiscountAmount = Math.min(grossTotal, round2(manualPercentPart + manualFlat));
  const promoDiscountAmount = promoPct > 0 ? Math.min(grossTotal, round2((grossTotal * promoPct) / 100)) : 0;
  const totalDiscountAmount = Math.min(grossTotal, round2(manualDiscountAmount + promoDiscountAmount));
  const grandTotal = Math.max(0, round2(grossTotal - totalDiscountAmount));

  return {
    isInclusive,
    subtotal,
    taxesList,
    totalTax,
    serviceChargeAmount,
    grossTotal,
    manualDiscountAmount,
    promoDiscountAmount,
    totalDiscountAmount,
    grandTotal,
  };
}
