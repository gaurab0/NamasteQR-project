const fs = require('fs');
let code = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
code = code.replace(/\r\n/g, '\n');

const logicToInsert = `  const permissions = staffSession?.custom_permissions || user?.custom_permissions || {};
  
  const checkAccess = (role: string, resource: string, action: string) => {
    const roleUpper = (role || '').toUpperCase();
    const isOwnerOrAdmin = roleUpper.includes('OWNER') || roleUpper.includes('ADMIN') || roleUpper.includes('MANAGER');
    if (isOwnerOrAdmin) return true;

    if (permissions[resource] && Array.isArray(permissions[resource])) {
      return permissions[resource].includes(action);
    }

    // Role Defaults
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

  const navItems = [
    {
      id: 'overview' as DashboardTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
      visible: (userRole || '').toUpperCase().includes('OWNER') || (userRole || '').toUpperCase().includes('ADMIN') || (userRole || '').toUpperCase().includes('MANAGER'),
    },
    {
      id: 'kds' as DashboardTab,
      label: 'Orders',
      icon: ClipboardList,
      badge: 'Live',
      badgeColor: 'bg-amber-500 text-white animate-pulse',
      visible: checkAccess(userRole, 'orders', 'read'),
    },
    {
      id: 'waiter' as DashboardTab,
      label: 'Waiter Station',
      icon: Bell,
      badge: null,
      visible: checkAccess(userRole, 'orders', 'read') || checkAccess(userRole, 'check_ins', 'read'),
    },
    {
      id: 'checkins' as DashboardTab,
      label: 'Table & Space',
      icon: QrCode,
      badge: null,
      visible: checkAccess(userRole, 'check_ins', 'read'),
    },
    {
      id: 'menus' as DashboardTab,
      label: 'Menu',
      icon: UtensilsCrossed,
      badge: null,
      visible: checkAccess(userRole, 'menus', 'read'),
    },
    {
      id: 'billing' as DashboardTab,
      label: 'Finance & POS',
      icon: Receipt,
      badge: null,
      visible: checkAccess(userRole, 'billing', 'read'),
    },
    {
      id: 'team' as DashboardTab,
      label: 'Staff',
      icon: Users,
      badge: null,
      visible: checkAccess(userRole, 'staff', 'read'),
    },
    {
      id: 'configurations' as DashboardTab,
      label: 'Settings',
      icon: SlidersHorizontal,
      badge: null,
      visible: checkAccess(userRole, 'settings', 'read'),
    },
    {
      id: 'account' as DashboardTab,
      label: 'Business Details',
      icon: Store,
      badge: null,
      visible: (userRole || '').toUpperCase().includes('OWNER') || (userRole || '').toUpperCase().includes('ADMIN') || (userRole || '').toUpperCase().includes('MANAGER'),
    },
    {
      id: 'audit' as DashboardTab,
      label: 'Security & Audit',
      icon: ShieldCheck,
      badge: null,
      visible: (userRole || '').toUpperCase().includes('OWNER') || (userRole || '').toUpperCase().includes('ADMIN') || (userRole || '').toUpperCase().includes('MANAGER'),
    },
  ].filter(item => item.visible);`;

// Find the start and end of navItems in Sidebar.tsx
const startIndex = code.indexOf('  const navItems = [');
if (startIndex !== -1) {
  const endIndex = code.indexOf('  ];', startIndex);
  if (endIndex !== -1) {
    const stringToReplace = code.substring(startIndex, endIndex + 4);
    code = code.replace(stringToReplace, logicToInsert);
  }
}

code = code.replace(/\n/g, '\r\n');
fs.writeFileSync('src/components/layout/Sidebar.tsx', code);
console.log('Sidebar patched successfully');
