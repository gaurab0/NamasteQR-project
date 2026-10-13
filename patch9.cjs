const fs = require('fs');

function patchCheckAccess(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/\r\n/g, '\n');

  const oldLogic = `const isOwnerOrAdmin = ['OWNER', 'ADMIN', 'MANAGER', 'BUSINESS_OWNER', 'SYSTEM_ADMIN', 'GENERAL_MANAGER'].includes(roleUpper);`;
  const newLogic = `const isOwnerOrAdmin = roleUpper.includes('OWNER') || roleUpper.includes('ADMIN') || roleUpper.includes('MANAGER');`;

  code = code.replace(oldLogic, newLogic);
  
  // Also fix the visibility checks for 'overview', 'account', and 'audit' tabs in the Sidebar
  const oldVisibility = `visible: ['OWNER', 'ADMIN', 'MANAGER', 'BUSINESS_OWNER', 'SYSTEM_ADMIN', 'GENERAL_MANAGER'].includes((userRole || '').toUpperCase())`;
  const newVisibility = `visible: (userRole || '').toUpperCase().includes('OWNER') || (userRole || '').toUpperCase().includes('ADMIN') || (userRole || '').toUpperCase().includes('MANAGER')`;
  
  code = code.replace(new RegExp(oldVisibility.replace(/[.*+?^$\/{}()|[\\]\\\\]/g, '\\\\$&'), 'g'), newVisibility);

  // Also fix DashboardPage getFirstPermittedTab
  const oldDashboardCheck = `if (['OWNER', 'ADMIN', 'MANAGER', 'BUSINESS_OWNER', 'SYSTEM_ADMIN', 'GENERAL_MANAGER'].includes(roleUpper)) return 'overview';`;
  const newDashboardCheck = `if (roleUpper.includes('OWNER') || roleUpper.includes('ADMIN') || roleUpper.includes('MANAGER')) return 'overview';`;
  code = code.replace(oldDashboardCheck, newDashboardCheck);

  const oldTabCheck = `return ['OWNER', 'ADMIN', 'MANAGER', 'BUSINESS_OWNER', 'SYSTEM_ADMIN', 'GENERAL_MANAGER'].includes((userRole || '').toUpperCase());`;
  const newTabCheck = `const ru = (userRole || '').toUpperCase(); return ru.includes('OWNER') || ru.includes('ADMIN') || ru.includes('MANAGER');`;
  code = code.replace(oldTabCheck, newTabCheck);

  code = code.replace(/\n/g, '\r\n');
  fs.writeFileSync(filePath, code);
  console.log('Patched ' + filePath);
}

patchCheckAccess('src/components/layout/Sidebar.tsx');
patchCheckAccess('src/pages/DashboardPage.tsx');
