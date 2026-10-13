const fs = require('fs');
let code = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf8');

code = code.replace(
  /if \(activeTab === 'overview' \|\| activeTab === 'account' \|\| activeTab === 'audit'\) \{\s*const ru = \(userRole \|\| ''\)\.toUpperCase\(\);\s*return ru\.includes\('OWNER'\) \|\| ru\.includes\('ADMIN'\) \|\| ru\.includes\('MANAGER'\);\s*\}/,
  `if (activeTab === 'overview') {
            const ru = (userRole || '').toUpperCase(); return ru.includes('OWNER') || ru.includes('ADMIN') || ru.includes('MANAGER');
         }
         if (activeTab === 'account') return checkAccess(userRole, 'business_details', 'read');
         if (activeTab === 'audit') return checkAccess(userRole, 'audit_logs', 'read');`
);

code = code.replace(
  /if \(roleUpper\.includes\('OWNER'\) \|\| roleUpper\.includes\('ADMIN'\) \|\| roleUpper\.includes\('MANAGER'\)\) return 'overview';/,
  `if (roleUpper.includes('OWNER') || roleUpper.includes('ADMIN') || roleUpper.includes('MANAGER')) return 'overview';
    if (checkAccess(userRole, 'business_details', 'read')) return 'account';
    if (checkAccess(userRole, 'audit_logs', 'read')) return 'audit';`
);

fs.writeFileSync('src/pages/DashboardPage.tsx', code, 'utf8');
console.log('DashboardPage.tsx updated successfully.');
