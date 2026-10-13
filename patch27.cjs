const fs = require('fs');
let code = fs.readFileSync('server/src/controllers/auth.controller.ts', 'utf8');

const regex = /async getAuditLogs\(req: AuthenticatedRequest, res: Response\) \{\s*const userId = req\.user\?\.id \|\| \(req\.query\.userId as string \| undefined\);\s*const email = req\.user\?\.email \|\| \(req\.query\.email as string \| undefined\);/m;

const replacement = `async getAuditLogs(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.id || (req.query.userId as string | undefined);
    const email = req.user?.email || (req.query.email as string | undefined);
    // If the frontend explicitly provided businessId in query, use it. Otherwise fallback to the user's current business_id context
    const businessId = (req.query.businessId as string | undefined) || req.user?.business_id;`;

code = code.replace(regex, replacement);

const regex2 = /const logs = await db\.getAuditLogs\(userId, email\);/m;
const replacement2 = `const logs = await db.getAuditLogs(userId, email, businessId);`;

code = code.replace(regex2, replacement2);

fs.writeFileSync('server/src/controllers/auth.controller.ts', code, 'utf8');
console.log('Updated auth.controller.ts');
