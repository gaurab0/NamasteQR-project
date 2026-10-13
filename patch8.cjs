const fs = require('fs');
let code = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf8');

// Normalize line endings
code = code.replace(/\r\n/g, '\n');

const logicToInsert = `  // Role Authentication / View-Only State
  const [staffSession, setStaffSession] = useState<StaffAccountSession | null>(() => rbacService.getCurrentStaffSession());
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const currentUserName = staffSession?.name || user?.name || user?.email?.split('@')[0] || 'User';

  const userRole = staffSession?.role || user?.role || 'OWNER';
  const permissions = staffSession?.custom_permissions || user?.custom_permissions || {};

  const checkAccess = (role: string, resource: string, action: string) => {
    const roleUpper = (role || '').toUpperCase();
    const isOwnerOrAdmin = ['OWNER', 'ADMIN', 'MANAGER', 'BUSINESS_OWNER', 'SYSTEM_ADMIN', 'GENERAL_MANAGER'].includes(roleUpper);
    if (isOwnerOrAdmin) return true;

    if (permissions[resource] && Array.isArray(permissions[resource])) {
      return permissions[resource].includes(action);
    }

    if (roleUpper.includes('WAITER') || roleUpper.includes('SERVICE') || roleUpper.includes('HOUSEKEEPING')) {
      if (resource === 'orders' || resource === 'check_ins') return true;
    }
    if (roleUpper.includes('KITCHEN') || roleUpper.includes('CHEF')) {
      if (resource === 'orders' || resource === 'menus') return true;
    }
    if (roleUpper.includes('FRONT_DESK')) {
      if (resource === 'check_ins' || resource === 'billing' || resource === 'orders') return true;
    }

    return false;
  };

  const getFirstPermittedTab = (): DashboardTab => {
    const roleUpper = (userRole || '').toUpperCase();
    if (['OWNER', 'ADMIN', 'MANAGER', 'BUSINESS_OWNER', 'SYSTEM_ADMIN', 'GENERAL_MANAGER'].includes(roleUpper)) return 'overview';
    if (checkAccess(userRole, 'orders', 'read') || checkAccess(userRole, 'check_ins', 'read')) return 'waiter';
    if (checkAccess(userRole, 'check_ins', 'read')) return 'checkins';
    if (checkAccess(userRole, 'orders', 'read')) return 'kds';
    if (checkAccess(userRole, 'menus', 'read')) return 'menus';
    if (checkAccess(userRole, 'billing', 'read')) return 'billing';
    if (checkAccess(userRole, 'staff', 'read')) return 'team';
    if (checkAccess(userRole, 'settings', 'read')) return 'configurations';
    return 'account';
  };

  useEffect(() => {
    const currentTabPermitted = () => {
       if (activeTab === 'overview' || activeTab === 'account' || activeTab === 'audit') {
          return ['OWNER', 'ADMIN', 'MANAGER', 'BUSINESS_OWNER', 'SYSTEM_ADMIN', 'GENERAL_MANAGER'].includes((userRole || '').toUpperCase());
       }
       if (activeTab === 'kds') return checkAccess(userRole, 'orders', 'read');
       if (activeTab === 'waiter') return checkAccess(userRole, 'orders', 'read') || checkAccess(userRole, 'check_ins', 'read');
       if (activeTab === 'checkins') return checkAccess(userRole, 'check_ins', 'read');
       if (activeTab === 'menus') return checkAccess(userRole, 'menus', 'read');
       if (activeTab === 'billing') return checkAccess(userRole, 'billing', 'read');
       if (activeTab === 'team') return checkAccess(userRole, 'staff', 'read');
       if (activeTab === 'configurations') return checkAccess(userRole, 'settings', 'read');
       return true;
    };

    if (!currentTabPermitted()) {
       setActiveTab(getFirstPermittedTab());
    }
  }, [userRole, permissions, activeTab]);`;

const targetRegex = /\/\/ Role Authentication \/ View-Only State[\s\S]*?const currentUserName = staffSession\?\.name \|\| user\?\.name \|\| user\?\.email\?\.split\('@'\)\[0\] \|\| 'User';/m;
code = code.replace(targetRegex, logicToInsert);

code = code.replace(/\n/g, '\r\n');
fs.writeFileSync('src/pages/DashboardPage.tsx', code);
console.log('DashboardPage patched successfully');
