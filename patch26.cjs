const fs = require('fs');
let code = fs.readFileSync('server/src/services/db.service.ts', 'utf8');

const regex = /async getAuditLogs\(userId\?: string, email\?: string\): Promise<AuditLog\[\]> \{\s*let logs = Array\.from\(this\.auditLogs\.values\(\)\);\s*if \(userId \|\| email\) \{\s*logs = logs\.filter\(l => \s*\(userId && \(l\.user_id === userId \|\| l\.id === userId\)\) \|\| \s*\(email && l\.email\?\.toLowerCase\(\) === email\.toLowerCase\(\)\)\s*\);\s*\}/m;

const replacement = `async getAuditLogs(userId?: string, email?: string, businessId?: string): Promise<AuditLog[]> {
    let logs = Array.from(this.auditLogs.values());
    if (businessId) {
      logs = logs.filter(l => l.business_id === businessId || l.account_name === businessId);
    } else if (userId || email) {
      logs = logs.filter(l => 
        (userId && (l.user_id === userId || l.id === userId)) || 
        (email && l.email?.toLowerCase() === email.toLowerCase())
      );
    }`;

code = code.replace(regex, replacement);
fs.writeFileSync('server/src/services/db.service.ts', code, 'utf8');
console.log('Updated db.service.ts with businessId filtering.');
