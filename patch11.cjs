const fs = require('fs');

function patchNormalizeRole(filePath) {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/\r\n/g, '\n');

  // Replace exact matching logic with .includes() logic in normalizeRole
  const oldLogic = `  public normalizeRole(role?: string): 'OWNER' | 'ADMIN' | 'MANAGER' | 'KITCHEN_STAFF' | 'FRONT_DESK' | 'HOUSEKEEPING' | 'CASHIER' {
    if (!role) return 'KITCHEN_STAFF';
    const upper = role.toUpperCase().trim();
    if (upper === 'HOTEL_OWNER' || upper === 'RESTAURANT_OWNER' || upper === 'OWNER') {
      return 'OWNER';
    }
    if (upper === 'ADMIN' || upper === 'SUPER_ADMIN') {
      return 'ADMIN';
    }
    if (upper === 'MANAGER' || upper === 'RESTAURANT_MANAGER' || upper === 'HOTEL_MANAGER') {
      return 'MANAGER';
    }
    if (upper === 'FRONT_DESK') {
      return 'FRONT_DESK';
    }
    if (upper === 'HOUSEKEEPING') {
      return 'HOUSEKEEPING';
    }
    if (upper === 'CASHIER') {
      return 'CASHIER';
    }
    return 'KITCHEN_STAFF';
  }`;

  const newLogic = `  public normalizeRole(role?: string): 'OWNER' | 'ADMIN' | 'MANAGER' | 'KITCHEN_STAFF' | 'FRONT_DESK' | 'HOUSEKEEPING' | 'CASHIER' {
    if (!role) return 'KITCHEN_STAFF';
    const upper = role.toUpperCase().trim();
    if (upper.includes('OWNER')) {
      return 'OWNER';
    }
    if (upper.includes('ADMIN')) {
      return 'ADMIN';
    }
    if (upper.includes('MANAGER')) {
      return 'MANAGER';
    }
    if (upper.includes('FRONT') || upper.includes('DESK') || upper.includes('RECEPTION')) {
      return 'FRONT_DESK';
    }
    if (upper.includes('HOUSEKEEPING') || upper.includes('CLEANING')) {
      return 'HOUSEKEEPING';
    }
    if (upper.includes('CASHIER')) {
      return 'CASHIER';
    }
    return 'KITCHEN_STAFF'; // Fallback
  }`;

  if (code.includes('public normalizeRole')) {
    code = code.replace(oldLogic, newLogic);
    // Write back
    code = code.replace(/\n/g, '\r\n');
    fs.writeFileSync(filePath, code);
    console.log('Patched normalizeRole in ' + filePath);
  }
}

patchNormalizeRole('src/services/rbac.service.ts');
