import assert from 'assert';
import { prisma } from '../src/lib/prisma';
import { rbacService } from '../src/services/rbac.service';
import type { BusinessTaxConfig } from '../src/types/rbac.types';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${name}`, extra !== undefined ? extra : '');
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 BILL & RECEIPT CUSTOMIZATION SUITE');
  console.log('====================================================\n');

  const testBizId = 'annapurna-vista-dining-1f3a';

  try {
    // 1. Fetch current tax configuration
    console.log('📋 1. Config Persistence & Field Verification');
    const originalConfig = await rbacService.getTaxConfig(testBizId);
    check('getTaxConfig returns valid business_id', originalConfig.business_id === testBizId);
    check('getTaxConfig includes invoice_prefix', typeof originalConfig.invoice_prefix === 'string');
    check('getTaxConfig includes order_prefix', typeof originalConfig.order_prefix === 'string');
    check('getTaxConfig includes order_label', typeof originalConfig.order_label === 'string');
    check('getTaxConfig includes invoice_label', typeof originalConfig.invoice_label === 'string');
    check('getTaxConfig includes order_reset_interval', typeof originalConfig.order_reset_interval === 'string');

    // 2. Update tax configuration with custom prefixes and header edits
    const testUpdate: Partial<BusinessTaxConfig> = {
      order_prefix: 'KT-',
      order_label: 'KOT No:',
      order_reset_interval: 'DAILY',
      invoice_prefix: 'BILL-',
      invoice_label: 'Bill# Invoice:',
      invoice_document_title: 'ESTIMATED BILL / INVOICE',
      invoice_display_name: 'TEST CUSTOM BISTRO',
      pan_vat_prefix: 'PAN#',
      pan_vat_number: '987654321',
      invoice_subtitle: 'Ground Floor, Test Plaza',
    };

    await rbacService.updateTaxConfig(testBizId, testUpdate);
    const updatedConfig = await rbacService.getTaxConfig(testBizId);

    check('order_prefix was saved to KT-', updatedConfig.order_prefix === 'KT-');
    check('order_label was saved to KOT No:', updatedConfig.order_label === 'KOT No:', updatedConfig.order_label);
    check('order_reset_interval was saved to DAILY', updatedConfig.order_reset_interval === 'DAILY');
    check('invoice_prefix was saved to BILL-', updatedConfig.invoice_prefix === 'BILL-');
    check('invoice_label was saved to Bill# Invoice:', updatedConfig.invoice_label === 'Bill# Invoice:', updatedConfig.invoice_label);
    check('invoice_document_title was saved', updatedConfig.invoice_document_title === 'ESTIMATED BILL / INVOICE');
    check('invoice_display_name was saved', updatedConfig.invoice_display_name === 'TEST CUSTOM BISTRO');
    check('pan_vat_number was saved', updatedConfig.pan_vat_number === '987654321');

    // 3. Sequence Generator Verification
    console.log('\n🔢 2. Sequence Number Generation with Configured Prefixes');
    const orderSeq1 = await rbacService.getNextSequenceNumber(testBizId, 'order', undefined, 'KT-', updatedConfig);
    check('Order sequence 1 begins with KT- prefix', orderSeq1.startsWith('KT-'));

    const orderSeq2 = await rbacService.getNextSequenceNumber(testBizId, 'order', undefined, 'KT-', updatedConfig);
    check('Order sequence increments sequentially', orderSeq2 > orderSeq1);

    const invSeq1 = await rbacService.getNextSequenceNumber(testBizId, 'invoice', undefined, 'BILL-', updatedConfig);
    check('Invoice sequence begins with BILL- prefix', invSeq1.startsWith('BILL-'));

    // 4. Restore original tax configuration
    console.log('\n🔄 3. Idempotent Rollback & Cleanup');
    await rbacService.updateTaxConfig(testBizId, {
      order_prefix: originalConfig.order_prefix || 'ORD-',
      order_label: originalConfig.order_label || 'Order No:',
      order_reset_interval: originalConfig.order_reset_interval || 'MANUAL',
      invoice_prefix: originalConfig.invoice_prefix || 'INV-',
      invoice_label: originalConfig.invoice_label || 'Invoice No:',
      invoice_document_title: originalConfig.invoice_document_title || null as any,
      invoice_display_name: originalConfig.invoice_display_name || null as any,
      pan_vat_prefix: originalConfig.pan_vat_prefix || null as any,
      pan_vat_number: originalConfig.pan_vat_number || null as any,
      invoice_subtitle: originalConfig.invoice_subtitle || null as any,
    });

    const restoredConfig = await rbacService.getTaxConfig(testBizId);
    check('Config restored back to original state', restoredConfig.invoice_prefix === (originalConfig.invoice_prefix || 'INV-') && restoredConfig.order_label === (originalConfig.order_label || 'Order No:'));

  } catch (err: any) {
    console.error('Unexpected test exception:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n====================================================');
  console.log(`🏁 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
