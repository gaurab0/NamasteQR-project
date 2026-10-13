const fs = require('fs');
let code = fs.readFileSync('server/src/services/db.service.ts', 'utf8');

const regex = /async upsertAccountAuditLog\(data: \{[\s\S]*?\}\): Promise<void> \{\s*const log: AuditLog = \{\s*id: data\.userId,\s*user_id: data\.userId,\s*business_id: data\.userId,/m;

const replacement = `async upsertAccountAuditLog(data: {
    userId: string;
    accountName: string;
    businessName?: string | null;
    email?: string | null;
    status: string;
    eventType: string;
    ipAddress?: string;
    userAgent?: string;
    businessId?: string | null;
  }): Promise<void> {
    const user = Array.from(this.users.values()).find(u => u.id === data.userId);
    const resolvedBusinessId = data.businessId || user?.business_id || data.accountName;

    const log: AuditLog = {
      id: data.userId,
      user_id: data.userId,
      business_id: resolvedBusinessId,`;

code = code.replace(regex, replacement);
fs.writeFileSync('server/src/services/db.service.ts', code, 'utf8');
console.log('Updated db.service.ts upsertAccountAuditLog.');
