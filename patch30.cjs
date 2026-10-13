const fs = require('fs');
let code = fs.readFileSync('server/src/services/audit.service.ts', 'utf8');

const regex = /await this\.logActivity\(\{\s*userId: data\.userId,\s*accountName,\s*businessName: business\?\.name \|\| accountName,\s*email,\s*status,\s*eventType: data\.eventType,\s*req: data\.req,\s*\}\);/m;

const replacement = `await this.logActivity({
        userId: data.userId,
        accountName,
        businessName: business?.name || accountName,
        email,
        status,
        eventType: data.eventType,
        req: data.req as any,
        businessId: data.businessId || business?.id,
      });`;

code = code.replace(regex, replacement);
fs.writeFileSync('server/src/services/audit.service.ts', code, 'utf8');
console.log('Updated audit.service.ts log function.');
