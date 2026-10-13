import { db } from './server/src/services/db.service.ts';

async function testDelete() {
  console.log('Testing deleteAuditLogs...');
  try {
    const res = await db.deleteAuditLogs(undefined, undefined, 'ALL');
    console.log('Success:', res);
  } catch (e) {
    console.error('Error:', e);
  }
}

testDelete();
