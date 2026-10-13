const fs = require('fs');

function patchDbService() {
  const filePath = 'server/src/services/db.service.ts';
  if (!fs.existsSync(filePath)) return;
  
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/\r\n/g, '\n');

  const oldLogic = `      snap.forEach(d => {
        const data = d.data() as any;
        const u: User = {
          id: d.id,
          business_id: data.business_id,
          email: data.email,
          password_hash: data.password_hash || '',
          role: data.role,
          status: data.status || 'ACTIVE',
          last_login_at: data.last_login_at ? new Date(data.last_login_at) : null,
          created_at: data.created_at ? new Date(data.created_at) : new Date(),
          updated_at: data.updated_at ? new Date(data.updated_at) : new Date(),
        };`;

  const newLogic = `      snap.forEach(d => {
        const data = d.data() as any;
        const u: User = {
          id: d.id,
          business_id: data.business_id,
          email: data.email,
          password_hash: data.password_hash || '',
          role: data.role,
          status: data.status || 'ACTIVE',
          custom_permissions: data.custom_permissions,
          last_login_at: data.last_login_at ? new Date(data.last_login_at) : null,
          created_at: data.created_at ? new Date(data.created_at) : new Date(),
          updated_at: data.updated_at ? new Date(data.updated_at) : new Date(),
        };`;

  code = code.replace(oldLogic, newLogic);
  code = code.replace(/\n/g, '\r\n');
  fs.writeFileSync(filePath, code);
  console.log('Patched findUsersByBusinessId in db.service.ts');
}

patchDbService();
