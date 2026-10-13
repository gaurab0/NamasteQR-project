const fs = require('fs');
let code = fs.readFileSync('server/src/services/rbac.service.ts', 'utf8');

// Normalize line endings for reliable replacement
code = code.replace(/\r\n/g, '\n');

code = code.replace(
  `      last_login_at: u.last_login_at,
      created_at: u.created_at,
    }));`,
  `      last_login_at: u.last_login_at,
      created_at: u.created_at,
      custom_permissions: u.custom_permissions,
    }));`
);

// Restore line endings
code = code.replace(/\n/g, '\r\n');
fs.writeFileSync('server/src/services/rbac.service.ts', code);
console.log('Fixed getTeamMembers properly');
