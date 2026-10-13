const fs = require('fs');

function patchBackendRole(filePath) {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/\r\n/g, '\n');

  const oldLogic = `  private normalizeRole(role?: string): string {
    if (!role) return 'KITCHEN_STAFF';
    const upper = role.toUpperCase().trim();
    if (upper === 'OWNER' || upper === 'RESTAURANT_OWNER' || upper === 'HOTEL_OWNER' || upper === 'ADMIN') {
      return 'MANAGER'; // For internal evaluations, treat as high-privilege
    }
    if (upper === 'GENERAL_MANAGER' || upper === 'MANAGER') return 'MANAGER';
    return upper;
  }`;

  const newLogic = `  private normalizeRole(role?: string): string {
    if (!role) return 'KITCHEN_STAFF';
    const upper = role.toUpperCase().trim();
    if (upper.includes('OWNER') || upper.includes('ADMIN') || upper.includes('MANAGER')) {
      return 'MANAGER'; // For internal evaluations, treat as high-privilege
    }
    return upper;
  }`;

  if (code.includes('private normalizeRole')) {
    code = code.replace(oldLogic, newLogic);
    code = code.replace(/\n/g, '\r\n');
    fs.writeFileSync(filePath, code);
    console.log('Patched backend normalizeRole');
  } else {
    // If exact block doesn't match, let's try to just find and replace the if block
    const fallbackSearch = `if (upper === 'OWNER' || upper === 'RESTAURANT_OWNER' || upper === 'HOTEL_OWNER' || upper === 'ADMIN')`;
    if (code.includes(fallbackSearch)) {
       code = code.replace(
         /if \(upper === 'OWNER' \|\| upper === 'RESTAURANT_OWNER' \|\| upper === 'HOTEL_OWNER' \|\| upper === 'ADMIN'\) \{[\s\S]*?return upper;\n  \}/m,
         `if (upper.includes('OWNER') || upper.includes('ADMIN') || upper.includes('MANAGER')) {
      return 'MANAGER'; // For internal evaluations, treat as high-privilege
    }
    return upper;
  }`
       );
       code = code.replace(/\n/g, '\r\n');
       fs.writeFileSync(filePath, code);
       console.log('Patched backend normalizeRole using fallback regex');
    }
  }
}

patchBackendRole('server/src/services/rbac.service.ts');
