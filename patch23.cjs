const fs = require('fs');
let code = fs.readFileSync('src/components/team/StaffRoleLoginModal.tsx', 'utf8');

const validationCode = `      if (res.success && res.data?.user) {
        const user = res.data.user;

        const dbRole = (user.role || '').toUpperCase();
        const selRole = selectedRole.toUpperCase();
        
        const match = 
          (dbRole === selRole) ||
          (dbRole.includes('OWNER') && selRole.includes('OWNER'));

        if (!match) {
           const selectedTitle = roleOptions.find(r => r.role === selectedRole)?.title || selectedRole;
           setErrorMsg(\`The credentials do not match with the \${selectedTitle} designation.\`);
           return;
        }`;

code = code.replace(
  /if \(res\.success && res\.data\?\.user\) \{\s*const user = res\.data\.user;/,
  validationCode
);

fs.writeFileSync('src/components/team/StaffRoleLoginModal.tsx', code, 'utf8');
console.log('Updated StaffRoleLoginModal.tsx');
