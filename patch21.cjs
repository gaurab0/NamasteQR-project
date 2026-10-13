const fs = require('fs');
let code = fs.readFileSync('src/components/layout/BranchSwitcher.tsx', 'utf8');

// add import
if (!code.includes('rbacService')) {
  code = code.replace(
    /import \{ useAuth \} from '\.\.\/\.\.\/context\/AuthContext';/,
    "import { useAuth } from '../../context/AuthContext';\nimport { rbacService } from '../../services/rbac.service';"
  );
}

// add permission check
const permLogic = `  const staffSession = rbacService.getCurrentStaffSession();
  const currentRole = staffSession?.role || user?.role || 'OWNER';
  const roleUpper = currentRole.toUpperCase();
  const permissions = staffSession?.custom_permissions || user?.custom_permissions || {};
  const hasFranchiseAccess = roleUpper.includes('OWNER') || roleUpper.includes('ADMIN') || roleUpper.includes('MANAGER') || (permissions.franchise?.includes('manage') ?? false);`;

if (!code.includes('hasFranchiseAccess')) {
  code = code.replace(
    /if \(\!user\) return null;/,
    `if (!user) return null;\n\n${permLogic}`
  );
}

// apply permission check
code = code.replace(
  /onClick=\{\(\) => setIsOpen\(\!isOpen\)\}/,
  `onClick={() => hasFranchiseAccess && setIsOpen(!isOpen)}`
);

code = code.replace(
  /className="flex items-center gap-2\.5 px-3 py-1\.5 rounded-xl text-xs font-medium bg-white\/95 hover:bg-zinc-50 border border-zinc-200\/90 shadow-2xs hover:border-amber-300 transition-all cursor-pointer group"/,
  "className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/95 border shadow-2xs transition-all group ${hasFranchiseAccess ? 'hover:bg-zinc-50 border-zinc-200/90 hover:border-amber-300 cursor-pointer' : 'border-transparent cursor-default'}`}"
);

code = code.replace(
  /<ChevronDown className=\{`w-3\.5 h-3\.5 text-zinc-400 transition-transform ml-1 \$\{isOpen \? 'rotate-180 text-zinc-700' : ''\}`\} \/>/,
  `{hasFranchiseAccess && (
          <ChevronDown className={\`w-3.5 h-3.5 text-zinc-400 transition-transform ml-1 \${isOpen ? 'rotate-180 text-zinc-700' : ''}\`} />
        )}`
);

fs.writeFileSync('src/components/layout/BranchSwitcher.tsx', code, 'utf8');
console.log('BranchSwitcher.tsx updated successfully.');
