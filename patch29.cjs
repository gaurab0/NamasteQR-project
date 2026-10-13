const fs = require('fs');
let code = fs.readFileSync('server/src/services/audit.service.ts', 'utf8');

const regex = /async logActivity\(data: \{[\s\S]*?\}\): Promise<void> \{\s*try \{/m;

const replacement = `async logActivity(data: {
    userId: string;
    accountName: string;
    businessName?: string | null;
    email?: string | null;
    status: 'ONLINE' | 'OFFLINE' | 'PENDING_VERIFICATION' | string;
    eventType: AuditEventType | string;
    req?: any;
    businessId?: string | null;
  }): Promise<void> {
    try {`;

code = code.replace(regex, replacement);

const regex2 = /await db\.upsertAccountAuditLog\(\{\s*userId: data\.userId,\s*accountName: data\.accountName,\s*businessName: data\.businessName,\s*email: data\.email,\s*status: data\.status,\s*eventType: data\.eventType,\s*ipAddress,\s*userAgent,\s*\}\);/m;

const replacement2 = `await db.upsertAccountAuditLog({
        userId: data.userId,
        accountName: data.accountName,
        businessName: data.businessName,
        email: data.email,
        status: data.status,
        eventType: data.eventType,
        ipAddress,
        userAgent,
        businessId: data.businessId,
      });`;

code = code.replace(regex2, replacement2);
fs.writeFileSync('server/src/services/audit.service.ts', code, 'utf8');
console.log('Updated audit.service.ts logActivity.');
