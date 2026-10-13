const fs = require('fs');
let code = fs.readFileSync('server/src/services/rbac.service.ts', 'utf8');

const replacement = `    // Check if user with email already exists
    const existing = await db.findUserByEmail(staffData.email);
    if (existing) {
      if (existing.business_id === businessId) {
        throw new Error(\`A staff account with email \${staffData.email} already exists in your business.\`);
      } else {
        throw new Error(\`The email \${staffData.email} is already registered in the system. Staff emails must be globally unique across all businesses.\`);
      }
    }`;

code = code.replace(
  /\/\/ Check if user with email already exists\s+const existing = await db\.findUserByEmail\(staffData\.email\);\s+if \(existing\) \{\s+throw new Error\(`A user with email \$\{staffData\.email\} already exists\.`\);\s+\}/m,
  replacement
);

fs.writeFileSync('server/src/services/rbac.service.ts', code, 'utf8');
console.log('Updated rbac.service.ts with better cross-business uniqueness error message.');
