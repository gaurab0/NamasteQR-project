import { rbacService } from '../src/services/rbac.service';
import { AppResource, AppAction, TabPermissionId, TAB_PERMISSION_IDS } from '../src/types/rbac.types';
import {
  deriveAllowedTabs,
  getEffectiveTabs,
  isBusinessOwnerRole,
  isManagerRole,
  canAccessResource,
  canAccessTab,
  findInvalidTabs,
  createGuestContext,
  createSystemContext,
  allTabs,
} from '../src/services/tabAccess';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 NAMASTEQR TAB-BASED RBAC TEST RUNNER (PART 1)');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASSED: ${desc}`);
      passed++;
    } else {
      console.error(`❌ FAILED: ${desc}${detail ? ` (${detail})` : ''}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // 1. Owner Bypass
  // --------------------------------------------------------------------------
  console.log('\n--- 1. Owner Bypass ---');
  assert(isBusinessOwnerRole('OWNER'), 'OWNER is recognized as business owner');
  assert(isBusinessOwnerRole('ADMIN'), 'ADMIN is recognized as business owner');
  assert(isBusinessOwnerRole('RESTAURANT_OWNER'), 'RESTAURANT_OWNER is recognized as business owner');
  assert(isBusinessOwnerRole('HOTEL_OWNER'), 'HOTEL_OWNER is recognized as business owner');
  assert(!isBusinessOwnerRole('MANAGER'), 'MANAGER is NOT a business owner');
  assert(!isBusinessOwnerRole('WAITER'), 'WAITER is NOT a business owner');

  const ownerUser = { id: 'owner-1', role: 'RESTAURANT_OWNER', email: 'owner@test.com', allowed_tabs: [] };
  assert(getEffectiveTabs(ownerUser).length === 11, 'Owner always has all 11 tabs even if allowed_tabs is empty');
  assert(rbacService.evaluateAccess(ownerUser, 'staff', 'create').granted, 'Owner can create staff');
  assert(rbacService.evaluateAccess(ownerUser, 'billing', 'write').granted, 'Owner can access billing write');
  assert(rbacService.evaluateAccess(ownerUser, 'franchise', 'manage').granted, 'Owner can manage franchise');

  // --------------------------------------------------------------------------
  // 2. Manager Is Governed Strictly by allowed_tabs
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Manager Governed by allowed_tabs ---');
  assert(isManagerRole('MANAGER'), 'MANAGER is recognized as manager role');
  assert(isManagerRole('RESTAURANT_MANAGER'), 'RESTAURANT_MANAGER is recognized as manager role');

  const restrictedManager = {
    id: 'mgr-1',
    role: 'MANAGER',
    email: 'mgr@test.com',
    allowed_tabs: ['kds', 'menus'] as TabPermissionId[],
  };
  const mgrTabs = getEffectiveTabs(restrictedManager);
  assert(mgrTabs.length === 2 && mgrTabs.includes('kds') && mgrTabs.includes('menus'), 'Manager with explicit allowed_tabs gets only those tabs');
  assert(rbacService.evaluateAccess(restrictedManager, 'menus', 'update').granted, 'Manager with menus tab can update menu');
  assert(!rbacService.evaluateAccess(restrictedManager, 'billing', 'write').granted, 'Manager without billing tab CANNOT write billing');
  assert(!rbacService.evaluateAccess(restrictedManager, 'staff', 'update').granted, 'Manager without team tab CANNOT update staff');

  // --------------------------------------------------------------------------
  // 3. One-Time Migration (deriveAllowedTabs)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. One-Time Migration ---');
  // Manager legacy fallback
  const legacyMgr = deriveAllowedTabs('MANAGER');
  assert(legacyMgr.length === 11, 'Legacy MANAGER with no stored tabs derives all 11 tabs');

  // Role with custom_permissions override
  const customWaiter = deriveAllowedTabs('WAITER', {
    billing: ['manage'],
    menus: ['read', 'create'],
  });
  assert(customWaiter.includes('billing') && customWaiter.includes('menus'), 'Custom permissions migrate to matching tabs (billing, menus)');

  // Legacy role defaults (no custom permissions)
  const legacyWaiter = deriveAllowedTabs('WAITER');
  assert(
    legacyWaiter.includes('kds') && legacyWaiter.includes('waiter') && legacyWaiter.includes('checkins'),
    'Legacy WAITER defaults to kds, waiter, checkins'
  );

  const legacyKitchen = deriveAllowedTabs('KITCHEN_STAFF');
  assert(
    legacyKitchen.includes('kds') && legacyKitchen.includes('waiter') && legacyKitchen.includes('menus'),
    'Legacy KITCHEN_STAFF defaults to kds, waiter, menus'
  );

  const legacyCashier = deriveAllowedTabs('CASHIER');
  assert(
    legacyCashier.length === 1 && legacyCashier[0] === 'billing',
    'Legacy CASHIER defaults to billing only'
  );

  const legacyFrontDesk = deriveAllowedTabs('FRONT_DESK');
  assert(
    legacyFrontDesk.includes('checkins') && legacyFrontDesk.includes('billing'),
    'Legacy FRONT_DESK defaults to checkins, billing, kds, waiter'
  );

  const unknownStaff = deriveAllowedTabs('UNKNOWN_ROLE');
  assert(unknownStaff.length === 0, 'Unknown role with no permissions derives empty tab list');

  // --------------------------------------------------------------------------
  // 4. Read vs Write & Public Resource Access
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Read vs Write Rules ---');
  const noTabStaff = { id: 'staff-zero', role: 'STAFF', email: 'zero@test.com', allowed_tabs: [] as TabPermissionId[] };
  assert(rbacService.evaluateAccess(noTabStaff, 'menus', 'read').granted, 'Menu read is public (customer facing)');
  assert(rbacService.evaluateAccess(noTabStaff, 'tables', 'read').granted, 'Table read is public');
  assert(!rbacService.evaluateAccess(noTabStaff, 'menus', 'write').granted, 'Menu write denied for staff without menus tab');
  assert(!rbacService.evaluateAccess(noTabStaff, 'check_ins', 'read').granted, 'Check-in read denied for staff without checkins tab');

  const waiterStaff = {
    id: 'staff-waiter',
    role: 'WAITER',
    email: 'waiter@test.com',
    allowed_tabs: ['waiter'] as TabPermissionId[],
  };
  assert(rbacService.evaluateAccess(waiterStaff, 'orders', 'read').granted, 'Waiter tab unlocks orders read');
  assert(rbacService.evaluateAccess(waiterStaff, 'orders', 'update').granted, 'Waiter tab unlocks orders update');
  assert(rbacService.evaluateAccess(waiterStaff, 'check_ins', 'read').granted, 'Waiter tab unlocks check-ins read');
  assert(!rbacService.evaluateAccess(waiterStaff, 'check_ins', 'update').granted, 'Waiter tab CANNOT write check-ins');

  // --------------------------------------------------------------------------
  // 5. Anti-Escalation & Tab Validation
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Anti-Escalation & Validation ---');
  const invalidList = findInvalidTabs(['menus', 'non_existent_tab', 'billing']);
  assert(invalidList.length === 1 && invalidList[0] === 'non_existent_tab', 'findInvalidTabs detects non-existent tabs');

  const invalidType = findInvalidTabs(['kds', 12345]);
  assert(invalidType.length === 1 && invalidType[0] === 12345, 'findInvalidTabs detects non-string tabs');

  // --------------------------------------------------------------------------
  // 6. Synthetic Guest & System Contexts
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Guest & System Contexts ---');
  const guestCtx = createGuestContext();
  assert(rbacService.evaluateAccess(guestCtx, 'menus', 'read').granted, 'Guest context CAN read public menus');
  assert(rbacService.evaluateAccess(guestCtx, 'tables', 'read').granted, 'Guest context CAN read public tables');
  assert(!rbacService.evaluateAccess(guestCtx, 'menus', 'write').granted, 'Guest context CANNOT write menus');
  assert(!rbacService.evaluateAccess(guestCtx, 'staff', 'read').granted, 'Guest context CANNOT read staff');

  const sysCtx = createSystemContext();
  assert(rbacService.evaluateAccess(sysCtx, 'orders', 'create').granted, 'System context CAN create orders');
  assert(rbacService.evaluateAccess(sysCtx, 'billing', 'write').granted, 'System context CAN write billing');
  assert(rbacService.evaluateAccess(sysCtx, 'staff', 'delete').granted, 'System context has full administrative access');

  // --------------------------------------------------------------------------
  // 7. Acting-As Overlay (PIN Staff Session on Owner Token)
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Acting-As Overlay ---');
  const ownerActingAsKitchen = {
    id: 'owner-real',
    role: 'RESTAURANT_OWNER',
    email: 'owner@business.com',
    acting_as: {
      id: 'staff-kitchen',
      role: 'KITCHEN_STAFF',
      email: 'cook@business.com',
      allowed_tabs: ['kds'] as TabPermissionId[],
    },
  };
  assert(
    !rbacService.evaluateAccess(ownerActingAsKitchen, 'billing', 'write').granted,
    'Owner acting as kitchen staff CANNOT access billing'
  );
  assert(
    rbacService.evaluateAccess(ownerActingAsKitchen, 'orders', 'update').granted,
    'Owner acting as kitchen staff CAN update KDS orders'
  );

  console.log('\n====================================================');
  console.log(`🏁 SCENARIO TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test runner encountered an error:', err);
  process.exit(1);
});
