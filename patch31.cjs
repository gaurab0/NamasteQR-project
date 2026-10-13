const fs = require('fs');
let code = fs.readFileSync('server/src/controllers/auth.controller.ts', 'utf8');

const regex = /const businessId = \(req\.query\.businessId as string \| undefined\) \|\| req\.user\?\.business_id;/;
const replacement = `const businessId = (req.query.businessId as string | undefined) || req.user?.business?.id;`;

code = code.replace(regex, replacement);
fs.writeFileSync('server/src/controllers/auth.controller.ts', code, 'utf8');
console.log('Fixed TS error in auth.controller.ts');
