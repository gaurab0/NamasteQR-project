import { rbacService } from '../src/services/rbac.service';
import { db } from '../src/services/db.service';
import { prisma } from '../src/lib/prisma';

async function run() {
  console.log('🧪 Testing Franchise Branch Provisioning with Owner Roles...');
  const testParentId = `test-franchise-parent-${Date.now()}`;
  
  try {
    // 1. Ensure test parent business exists
    await db.ensureBusiness(testParentId, 'Main Test Restaurant', 'RESTAURANT');

    // 2. Test RESTAURANT_OWNER role
    console.log('\n1. Testing RESTAURANT_OWNER provisioning:');
    const restOwnerUser = {
      id: `usr-rest-${Date.now()}`,
      role: 'RESTAURANT_OWNER',
      email: 'owner@testrestaurant.com'
    };

    const branch1 = await rbacService.createFranchiseBranch(
      {
        name: '7 sapice two',
        parentBusinessId: testParentId,
        branchCode: 'BRANCH-01',
        location: 'New Road',
        phone: '+9779800000000',
        tagline: 'New restaurant',
        kitchenHours: '08:00 AM – 11:00 PM',
        taxRate: 13,
      },
      restOwnerUser
    );

    if (branch1 && branch1.branch.name === '7 sapice two') {
      console.log('  ✅ PASS: RESTAURANT_OWNER successfully provisioned branch:', branch1.branch.name);
    } else {
      throw new Error('Failed to create branch with RESTAURANT_OWNER');
    }

    // Verify branch exists in PostgreSQL
    const pgBranch1 = await prisma.business.findUnique({
      where: { id: branch1.branch.id }
    });
    if (pgBranch1 && pgBranch1.name === '7 sapice two' && pgBranch1.parent_business_id === testParentId) {
      console.log('  ✅ PASS: Branch correctly saved in PostgreSQL with parent_business_id');
    } else {
      throw new Error('Branch not found in PostgreSQL');
    }

    // Verify tables seeded in PostgreSQL
    const pgTables = await prisma.restaurantTable.findMany({
      where: { business_id: branch1.branch.id }
    });
    if (pgTables.length > 0) {
      console.log(`  ✅ PASS: Default tables seeded into PostgreSQL (${pgTables.length} tables)`);
    } else {
      throw new Error('Default tables were not seeded in PostgreSQL');
    }

    // 3. Test ADMIN / secondary owner role
    console.log('\n2. Testing ADMIN provisioning:');
    const adminOwnerUser = {
      id: `usr-admin-${Date.now()}`,
      role: 'ADMIN',
      email: 'admin@testbistro.com'
    };

    const branch2 = await rbacService.createFranchiseBranch(
      {
        name: 'Bistro Branch Annexe',
        parentBusinessId: testParentId,
        branchCode: 'BRANCH-02',
      },
      adminOwnerUser
    );

    if (branch2 && branch2.branch.name === 'Bistro Branch Annexe') {
      console.log('  ✅ PASS: ADMIN successfully provisioned branch');
    } else {
      throw new Error('Failed to create branch with ADMIN');
    }

    // 4. Test unauthorized role (WAITER)
    console.log('\n3. Testing unauthorized role rejection (WAITER):');
    const waiterUser = {
      id: `usr-waiter-${Date.now()}`,
      role: 'WAITER',
      email: 'waiter@testrestaurant.com'
    };

    try {
      await rbacService.createFranchiseBranch(
        {
          name: 'Unauthorized Branch',
          parentBusinessId: testParentId,
        },
        waiterUser
      );
      throw new Error('FAIL: WAITER should not be allowed to provision a branch');
    } catch (err: any) {
      if (err.message.includes('Only Business Owners and Administrators')) {
        console.log('  ✅ PASS: WAITER correctly rejected with permission error');
      } else {
        throw err;
      }
    }

    console.log('\n========================================');
    console.log('🏁 Franchise Provisioning Verification: ALL PASSED');
    console.log('========================================');
  } finally {
    // Cleanup
    try {
      await prisma.restaurantTable.deleteMany({
        where: { business_id: { startsWith: testParentId } }
      });
      await prisma.business.deleteMany({
        where: {
          OR: [
            { id: testParentId },
            { parent_business_id: testParentId },
          ]
        }
      });
    } catch (e) {}
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Test failed:', e);
    process.exit(1);
  });
