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
  /** Optional packaging charges added to the bill */
  packagingTotal?: number;
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
  /** Gross Pre-Discount Subtotal (reverse-calculated net amount in inclusive mode; menu items total in exclusive mode) */
  subtotal: number;
  /** Post-discount taxable base = max(0, round2(subtotal - totalDiscountAmount)) */
  taxableSubtotal: number;
  taxesList: SaleTaxBreakdown[];
  totalTax: number;
  serviceChargeAmount: number;
  /** Pre-discount Grand Total = round2(subtotal + preDiscountTax) */
  grossTotal: number;
  manualDiscountAmount: number;
  promoDiscountAmount: number;
  totalDiscountAmount: number;
  /** Final payable Grand Total = round2(taxableSubtotal + totalTax) */
  grandTotal: number;
}

/**
 * Calculates Subtotal, Discounts (applied to Subtotal before VAT), Taxes, and Grand Total
 * for both Exclusive and Inclusive of VAT% modes.
 */
export function calculateBillTotals(input: BillCalculationInput): BillCalculationResult {
  const packaging = Math.max(0, round2(input.packagingTotal || 0));
  const menuTotal = Math.max(0, round2(input.itemsMenuTotal)) + packaging;
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
      isTaxEnabled = false;
      activeRates = [];
    } else {
      isInclusive = false;
      activeRates = [{ id: 'vat', name: 'VAT', rate_percent: 13 }];
    }
  }

  const totalRatePercent = activeRates.reduce((sum, r) => sum + (Number(r.rate_percent) || 0), 0);
  const hasActiveTax = isTaxEnabled && activeRates.length > 0 && totalRatePercent > 0 && menuTotal > 0;

  // 1. Gross Pre-Discount Subtotal
  const subtotal = hasActiveTax && isInclusive
    ? round2(menuTotal / (1 + totalRatePercent / 100))
    : menuTotal;

  // 2. Apply all discounts to Subtotal BEFORE VAT
  const manualPct = Math.max(0, Number(input.manualDiscountPercent) || 0);
  const manualFlat = Math.max(0, Number(input.manualFlatDiscount ?? input.flatDiscountAmount) || 0);
  const promoPct = Math.max(0, Number(input.promoDiscountPercent) || 0);

  const manualPercentPart = manualPct > 0 ? (subtotal * manualPct) / 100 : 0;
  const manualDiscountAmount = Math.min(subtotal, round2(manualPercentPart + manualFlat));
  const promoDiscountAmount = promoPct > 0 ? Math.min(subtotal, round2((subtotal * promoPct) / 100)) : 0;
  const totalDiscountAmount = Math.min(subtotal, round2(manualDiscountAmount + promoDiscountAmount));
  const taxableSubtotal = Math.max(0, round2(subtotal - totalDiscountAmount));

  // 3. Calculate Taxes (VAT / Service Charge) on post-discount taxableSubtotal
  let taxesList: SaleTaxBreakdown[] = [];
  let totalTax = 0;
  let serviceChargeAmount = 0;
  let grossTotal = menuTotal;

  if (hasActiveTax) {
    taxesList = activeRates.map((rate) => {
      const rateVal = Number(rate.rate_percent) || 0;
      const amt = round2((taxableSubtotal * rateVal) / 100);
      return {
        id: rate.id,
        name: rate.name,
        rate_percent: rateVal,
        amount: amt,
        is_inclusive: isInclusive,
      };
    });

    // Reconcile 1-paisa rounding residual when there is no discount in Inclusive mode so subtotal + totalTax === menuTotal
    if (isInclusive && totalDiscountAmount === 0) {
      const exactPreTax = round2(menuTotal - subtotal);
      const sumTaxes = round2(taxesList.reduce((acc, t) => acc + t.amount, 0));
      const residual = round2(exactPreTax - sumTaxes);
      if (Math.abs(residual) > 0 && taxesList.length > 0) {
        taxesList[0].amount = round2(Math.max(0, taxesList[0].amount + residual));
      }
      totalTax = exactPreTax;
      grossTotal = menuTotal;
    } else {
      totalTax = round2(taxesList.reduce((acc, t) => acc + t.amount, 0));
      if (!isInclusive) {
        const preDiscountTaxes = activeRates.reduce((s, r) => s + round2((subtotal * r.rate_percent) / 100), 0);
        grossTotal = round2(subtotal + preDiscountTaxes);
      }
    }

    serviceChargeAmount = round2(
      taxesList
        .filter((t) => t.name.toLowerCase().includes('service'))
        .reduce((acc, t) => acc + t.amount, 0)
    );
  }

  const grandTotal = Math.max(0, round2(taxableSubtotal + totalTax));

  return {
    isInclusive,
    subtotal,
    taxableSubtotal,
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

export interface OrderBillableAmounts {
  itemsMenuTotal: number;
  packagingQty: number;
  compPackagingQty: number;
  packagingTotal: number;
  grossPackagingTotal: number;
  compItemsValue: number;
  compPackagingValue: number;
  isAllComp: boolean;
}

/**
 * Single source of truth for calculating billable item totals, packaging quantities,
 * and complimentary vs. billable packaging charges across frontend and backend.
 */
export function computeOrderBillableAmounts(
  items: any[],
  options?: {
    packagingFeeRate?: number;
    isPackagingComp?: boolean;
    explicitPackagingCharge?: number | null;
    explicitPackagingQty?: number | null;
  }
): OrderBillableAmounts {
  const rate = Math.max(0, Number(options?.packagingFeeRate ?? 10));
  const activeItems = (Array.isArray(items) ? items : []).filter(
    (it) => it && it.status !== 'CANCELLED'
  );

  let itemsMenuTotal = 0;
  let packagingQty = 0;
  let compPackagingQty = 0;
  let packagingTotal = 0;
  let grossPackagingTotal = 0;
  let compItemsValue = 0;

  for (const it of activeItems) {
    const qty = Number(it.quantity) || 1;
    const compQty = Math.max(0, Math.min(qty, Number(it.comp_qty) || (it.is_comp ? qty : 0)));
    const isItemFullyComp = Boolean(it.is_comp || compQty >= qty);
    const billedQty = isItemFullyComp ? 0 : Math.max(0, qty - compQty);
    const unitPrice = Number(it.unit_price ?? it.price) || 0;

    itemsMenuTotal += billedQty * unitPrice;
    compItemsValue += (isItemFullyComp ? qty : compQty) * unitPrice;

    const isPkg = it.is_packageable !== false;
    const rawPack =
      it.pack_qty !== undefined && it.pack_qty !== null && it.pack_qty !== ''
        ? Number(it.pack_qty)
        : it.is_packaged
          ? qty
          : 0;
    const packQty = isPkg ? Math.max(0, Math.min(qty, rawPack || 0)) : 0;

    if (packQty > 0) {
      packagingQty += packQty;
      grossPackagingTotal += packQty * rate;

      const forceItemPkgComp = Boolean(options?.isPackagingComp || it.is_packaging_comp);
      const defaultCompPack =
        it.comp_pack_qty !== undefined && it.comp_pack_qty !== null && it.comp_pack_qty !== ''
          ? Math.min(packQty, Math.max(0, Number(it.comp_pack_qty) || 0))
          : Math.min(packQty, isItemFullyComp ? qty : compQty);
      const itemCompPack = forceItemPkgComp ? packQty : defaultCompPack;
      const billedPackQty = Math.max(0, packQty - itemCompPack);

      compPackagingQty += itemCompPack;
      if (forceItemPkgComp) {
        packagingTotal += 0;
      } else if (
        it.packaging_charge !== undefined &&
        it.packaging_charge !== null &&
        (itemCompPack === 0 || it.comp_pack_qty !== undefined)
      ) {
        packagingTotal += Math.max(0, Number(it.packaging_charge) || 0);
      } else {
        packagingTotal += billedPackQty * rate;
      }
    }
  }

  if (
    options?.explicitPackagingQty !== undefined &&
    options?.explicitPackagingQty !== null &&
    packagingQty === 0
  ) {
    packagingQty = Math.max(0, Number(options.explicitPackagingQty) || 0);
    grossPackagingTotal = packagingQty * rate;
  }

  if (options?.isPackagingComp) {
    compPackagingQty = packagingQty;
    packagingTotal = 0;
  } else if (
    options?.explicitPackagingCharge !== undefined &&
    options?.explicitPackagingCharge !== null
  ) {
    packagingTotal = Math.max(0, Number(options.explicitPackagingCharge) || 0);
    if (packagingQty > 0 && packagingTotal === 0) {
      compPackagingQty = packagingQty;
    }
  }

  const roundedPkgTotal = round2(packagingTotal);
  const roundedGrossPkg = round2(grossPackagingTotal);
  if (
    !options?.isPackagingComp &&
    options?.explicitPackagingCharge !== undefined &&
    options?.explicitPackagingCharge !== null &&
    roundedGrossPkg > 0 &&
    roundedPkgTotal >= roundedGrossPkg
  ) {
    compPackagingQty = 0;
  }
  const compPackagingValue = round2(Math.max(0, roundedGrossPkg - roundedPkgTotal));
  const isAllComp =
    activeItems.length > 0 &&
    activeItems.every((it) => {
      const qty = Number(it.quantity) || 1;
      const compQty = Math.max(0, Math.min(qty, Number(it.comp_qty) || (it.is_comp ? qty : 0)));
      return Boolean(it.is_comp || compQty >= qty);
    });

  return {
    itemsMenuTotal: round2(itemsMenuTotal),
    packagingQty,
    compPackagingQty,
    packagingTotal: roundedPkgTotal,
    grossPackagingTotal: roundedGrossPkg,
    compItemsValue: round2(compItemsValue),
    compPackagingValue,
    isAllComp,
  };
}

/**
 * Determines whether a sale record is a 100% complimentary transaction.
 */
export function isSaleAllComp(sale: any): boolean {
  if (!sale) return false;
  if ((sale.payment_method || '').toUpperCase() === 'COMPLIMENTARY') return true;
  const items = Array.isArray(sale.items) ? sale.items : [];
  if (items.length === 0) {
    return Number(sale.total_amount) === 0;
  }
  return items.every((it: any) => {
    const qty = Number(it.quantity) || 1;
    const compQty = Math.max(0, Math.min(qty, Number(it.comp_qty) || (it.is_comp ? qty : 0)));
    return Boolean(it.is_comp || compQty >= qty);
  });
}
