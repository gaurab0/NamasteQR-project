import assert from 'node:assert';
import { rbacService } from '../src/services/rbac.service';
import {
  isBusinessOwnerRole,
  canAccessTab as canAccessServerTab,
  deriveAllowedTabs,
  getEffectiveTabs as getEffectiveServerTabs,
  allTabs,
} from '../src/services/tabAccess';
import {
  isBusinessOwner,
  canAccessTab as canAccessClientTab,
  getFirstPermittedTab,
  getEffectiveTabs as getEffectiveClientTabs,
  SIDEBAR_TAB_ORDER,
  TAB_LABELS,
} from '../../src/utils/tabAccess';
import { TabPermissionId, AppRole } from '../src/types/rbac.types';

console.log('\n====================================================');
console.log('🛡️  SERVEFLOW PART 6 — RBAC SECURITY & AUDIT SUITE');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function check(desc: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        passed++;
        console.log(`✅ PASS: ${desc}`);
      }).catch((err) => {
        failed++;
        console.error(`❌ FAIL: ${desc} ->`, err.message);
      });
    }
    passed++;
    console.log(`✅ PASS: ${desc}`);
  } catch (err: any) {
    failed++;
    console.error(`❌ FAIL: ${desc} ->`, err.message);
  }
}

async function runAuditSuite() {
  // -------------------------------------------------------------------------
  // SECTION B: BEHAVIOUR & CLIENT ACCESS RULES
  // -------------------------------------------------------------------------
  console.log('--- B. Client & Role Access Verifications ---');

  // B1: Owner has all 10 tabs + branch switcher
  check('B1.1: Owner has full tab access (all 11 tabs)', () => {
    const owner = { id: 'u1', role: 'OWNER' as AppRole };
    assert.strictEqual(isBusinessOwner(owner.role), true);
    assert.strictEqual(canAccessClientTab(owner, 'overview'), true);
    assert.strictEqual(canAccessClientTab(owner, 'billing'), true);
    assert.strictEqual(canAccessClientTab(owner, 'team'), true);
    assert.strictEqual(canAccessClientTab(owner, 'franchise'), true);
    assert.strictEqual(getEffectiveClientTabs(owner).length, 11);
  });

  // B2: Waiter-type account with ['kds', 'checkins']
  check('B2.1: Limited staff with [kds, checkins] is restricted only to those tabs', () => {
    const waiter = {
      id: 'w1',
      role: 'WAITER' as AppRole,
      allowed_tabs: ['kds', 'checkins'] as TabPermissionId[],
    };
    assert.strictEqual(isBusinessOwner(waiter.role), false);
    assert.strictEqual(canAccessClientTab(waiter, 'kds'), true);
    assert.strictEqual(canAccessClientTab(waiter, 'checkins'), true);
    assert.strictEqual(canAccessClientTab(waiter, 'billing'), false);
    assert.strictEqual(canAccessClientTab(waiter, 'menus'), false);
    assert.strictEqual(canAccessClientTab(waiter, 'team'), false);
    assert.strictEqual(canAccessClientTab(waiter, 'configurations'), false);
    assert.strictEqual(canAccessClientTab(waiter, 'franchise'), false);
    assert.strictEqual(getFirstPermittedTab(waiter), 'kds');
  });

  // B3: Manager with partial list: restricted (no bypass)
  check('B3.1: Manager role carries NO automatic bypass when allowed_tabs is set', () => {
    const manager = {
      id: 'm1',
      role: 'MANAGER' as AppRole,
      allowed_tabs: ['menus', 'billing'] as TabPermissionId[],
    };
    assert.strictEqual(isBusinessOwner(manager.role), false);
    assert.strictEqual(canAccessClientTab(manager, 'menus'), true);
    assert.strictEqual(canAccessClientTab(manager, 'billing'), true);
    assert.strictEqual(canAccessClientTab(manager, 'team'), false);
    assert.strictEqual(canAccessClientTab(manager, 'configurations'), false);
    assert.strictEqual(canAccessClientTab(manager, 'franchise'), false);
  });

  // B4: Account with []: "No tabs assigned"
  check('B4.1: Account with empty tabs list has null first tab', () => {
    const emptyAccount = {
      id: 'e1',
      role: 'WAITER' as AppRole,
      allowed_tabs: [] as TabPermissionId[],
    };
    assert.strictEqual(getFirstPermittedTab(emptyAccount), null);
    assert.strictEqual(canAccessClientTab(emptyAccount, 'overview'), false);
    assert.strictEqual(canAccessClientTab(emptyAccount, 'franchise'), false);
  });

  // B5: Franchise permission controls BranchSwitcher
  check('B5.1: Non-owner with franchise tab CAN access branch switcher', () => {
    const staffWithFranchise = {
      id: 's1',
      role: 'SUPERVISOR' as AppRole,
      allowed_tabs: ['overview', 'franchise'] as TabPermissionId[],
    };
    assert.strictEqual(canAccessClientTab(staffWithFranchise, 'franchise'), true);
  });

  check('B5.2: Non-owner WITHOUT franchise tab CANNOT access branch switcher', () => {
    const staffNoFranchise = {
      id: 's2',
      role: 'SUPERVISOR' as AppRole,
      allowed_tabs: ['overview'] as TabPermissionId[],
    };
    assert.strictEqual(canAccessClientTab(staffNoFranchise, 'franchise'), false);
  });

  // -------------------------------------------------------------------------
  // SECTION C: SERVER SECURITY & ANTI-ESCALATION
  // -------------------------------------------------------------------------
  console.log('\n--- C. Server Security & Anti-Escalation Checks ---');

  // C1: Limited staff cannot perform mutations without matching tab
  check('C1.1: Staff without menus tab denied menu mutation', () => {
    const staff = { id: 's1', role: 'WAITER' as AppRole, allowed_tabs: ['waiter'] as TabPermissionId[] };
    const access = rbacService.evaluateAccess(staff, 'menus', 'write');
    assert.strictEqual(access.granted, false);
    assert.ok(access.reason?.includes('menus'));
  });

  check('C1.2: Staff with only menus tab denied checkin read/write', () => {
    const staff = { id: 's1', role: 'CHEF' as AppRole, allowed_tabs: ['menus'] as TabPermissionId[] };
    const access = rbacService.evaluateAccess(staff, 'check_ins', 'read');
    assert.strictEqual(access.granted, false);
    assert.ok(access.reason?.includes('checkins'));
  });

  // C2: Anti-escalation tab validation
  check('C2.1: Non-owner cannot grant tabs they do not hold', () => {
    const actor = { id: 'staff1', role: 'SUPERVISOR' as AppRole, allowed_tabs: ['team', 'kds'] as TabPermissionId[] };
    let caught = false;
    try {
      // @ts-ignore
      rbacService['assertActorMayGrantTabs'](actor, ['billing']);
    } catch (e: any) {
      caught = true;
      assert.ok(e.message.includes('cannot grant the \'billing\' tab'));
    }
    assert.strictEqual(caught, true);
  });

  check('C2.2: Non-owner cannot grant team or franchise tabs', () => {
    const actor = { id: 'staff1', role: 'SUPERVISOR' as AppRole, allowed_tabs: ['team', 'kds', 'franchise'] as TabPermissionId[] };
    let caughtTeam = false;
    try {
      // @ts-ignore
      rbacService['assertActorMayGrantTabs'](actor, ['team']);
    } catch (e: any) {
      caughtTeam = true;
      assert.ok(e.message.includes('Only the business owner can grant or revoke'));
    }
    assert.strictEqual(caughtTeam, true);

    let caughtFranchise = false;
    try {
      // @ts-ignore
      rbacService['assertActorMayGrantTabs'](actor, ['franchise']);
    } catch (e: any) {
      caughtFranchise = true;
      assert.ok(e.message.includes('Only the business owner can grant or revoke'));
    }
    assert.strictEqual(caughtFranchise, true);
  });

  check('C2.3: Owner CAN grant any tab', () => {
    const owner = { id: 'o1', role: 'OWNER' as AppRole };
    let err: any = null;
    try {
      // @ts-ignore
      rbacService['assertActorMayGrantTabs'](owner, ['team', 'franchise', 'billing']);
    } catch (e) {
      err = e;
    }
    assert.strictEqual(err, null);
  });

  // C3: Migration accuracy for legacy roles (§19.5)
  console.log('\n--- C3. Legacy Migration Rule Accuracy (§19.5) ---');

  check('C3.1: Legacy MANAGER without stored tabs derives ALL 11 tabs', () => {
    const tabs = deriveAllowedTabs('MANAGER');
    assert.strictEqual(tabs.length, 11);
  });

  check('C3.2: Legacy RESTAURANT_MANAGER without stored tabs derives ALL 11 tabs', () => {
    const tabs = deriveAllowedTabs('RESTAURANT_MANAGER');
    assert.strictEqual(tabs.length, 11);
  });

  check('C3.3: Legacy WAITER derives [kds, waiter, checkins]', () => {
    const tabs = deriveAllowedTabs('WAITER');
    assert.deepStrictEqual(tabs.sort(), ['checkins', 'kds', 'waiter'].sort());
  });

  check('C3.4: Legacy KITCHEN_STAFF derives [kds, waiter, menus]', () => {
    const tabs = deriveAllowedTabs('KITCHEN_STAFF');
    assert.deepStrictEqual(tabs.sort(), ['kds', 'menus', 'waiter'].sort());
  });

  check('C3.5: Legacy CASHIER derives [billing]', () => {
    const tabs = deriveAllowedTabs('CASHIER');
    assert.deepStrictEqual(tabs, ['billing']);
  });

  check('C3.6: Legacy FRONT_DESK derives [checkins, billing, kds, waiter]', () => {
    const tabs = deriveAllowedTabs('FRONT_DESK');
    assert.deepStrictEqual(tabs.sort(), ['billing', 'checkins', 'kds', 'waiter'].sort());
  });

  check('C3.7: Legacy user with custom_permissions migrates correctly per resource', () => {
    const legacyPerms = {
      billing: ['manage'],
      menus: ['read'],
    };
    const tabs = deriveAllowedTabs('WAITER', legacyPerms);
    assert.ok(tabs.includes('billing'));
    assert.ok(tabs.includes('menus'));
  });

  console.log('\n====================================================');
  console.log(`🏁 AUDIT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runAuditSuite().catch((err) => {
  console.error('Fatal error in audit suite:', err);
  process.exit(1);
});
