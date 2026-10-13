const fs = require('fs');
let content = fs.readFileSync('server/src/types/rbac.types.ts', 'utf8');
content = content.replace(
  /  \| 'audit_logs'\r?\n  \| 'settings';/,
  "  | 'audit_logs'\n  | 'settings'\n  | 'business_details'\n  | 'franchise';"
);
fs.writeFileSync('server/src/types/rbac.types.ts', content, 'utf8');
console.log('server/src/types/rbac.types.ts updated');
