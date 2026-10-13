const fs = require('fs');
let code = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf8');

code = code.replace(
  /id: 'account' as DashboardTab,\s*label: 'Business Details',\s*icon: Store,\s*badge: null,\s*visible:.*?,/s,
  `id: 'account' as DashboardTab,\n      label: 'Business Details',\n      icon: Store,\n      badge: null,\n      visible: checkAccess(userRole, 'business_details', 'read'),`
);

code = code.replace(
  /id: 'audit' as DashboardTab,\s*label: 'Security & Audit',\s*icon: ShieldCheck,\s*badge: null,\s*visible:.*?,/s,
  `id: 'audit' as DashboardTab,\n      label: 'Security & Audit',\n      icon: ShieldCheck,\n      badge: null,\n      visible: checkAccess(userRole, 'audit_logs', 'read'),`
);

fs.writeFileSync('src/components/layout/Sidebar.tsx', code, 'utf8');
console.log('Sidebar.tsx updated successfully.');
