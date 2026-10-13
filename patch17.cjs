const fs = require('fs');
let content = fs.readFileSync('src/types/rbac.ts', 'utf8');
content = content.replace(
  /  \| 'audit_logs'\r?\n  \| 'settings';/,
  "  | 'audit_logs'\n  | 'settings'\n  | 'business_details'\n  | 'franchise';"
);
fs.writeFileSync('src/types/rbac.ts', content, 'utf8');
console.log('src/types/rbac.ts updated');
