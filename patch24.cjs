const fs = require('fs');
let code = fs.readFileSync('src/components/team/StaffRoleLoginModal.tsx', 'utf8');

const crossBizCheck = `      if (res.success && res.data?.user) {
        const user = res.data.user;

        // Check if user belongs to the current business context
        const userBizId = user.business?.id || user.business_id;
        if (userBizId && userBizId !== businessId) {
           setErrorMsg(\`This account does not belong to \${businessName}. Please use credentials designated for this specific branch/business.\`);
           setLoading(false);
           return;
        }

        const dbRole = (user.role || '').toUpperCase();`;

code = code.replace(
  /if \(res\.success && res\.data\?\.user\) \{\s*const user = res\.data\.user;\s*const dbRole = \(user\.role \|\| ''\)\.toUpperCase\(\);/,
  crossBizCheck
);

fs.writeFileSync('src/components/team/StaffRoleLoginModal.tsx', code, 'utf8');
console.log('Updated StaffRoleLoginModal.tsx with cross-business check.');
