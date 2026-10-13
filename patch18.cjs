const fs = require('fs');
let code = fs.readFileSync('src/components/team/TeamStaffManagement.tsx', 'utf8');
const isCRLF = code.includes('\r\n');
code = code.replace(/\r\n/g, '\n');

const searchStr = `                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 bg-zinc-50 border-t border-zinc-200">`;

const replaceStr = `                  </label>
                </div>
              </div>

              {/* Admin Operations */}
              <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 space-y-2">
                <div className="text-xs font-bold text-zinc-900">Admin Operations</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={memberPermissions.business_details?.includes('read') ?? false} onChange={() => toggleCustomPermission('business_details', 'read')} className="rounded text-amber-600" />
                    <span>View Business Details</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={memberPermissions.business_details?.includes('manage') ?? false} onChange={() => toggleCustomPermission('business_details', 'manage')} className="rounded text-amber-600" />
                    <span>Manage Business Details</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={memberPermissions.audit_logs?.includes('read') ?? false} onChange={() => toggleCustomPermission('audit_logs', 'read')} className="rounded text-amber-600" />
                    <span>Security & Audit Logs</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={memberPermissions.franchise?.includes('manage') ?? false} onChange={() => toggleCustomPermission('franchise', 'manage')} className="rounded text-amber-600" />
                    <span>Manage Franchise & Branches</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 bg-zinc-50 border-t border-zinc-200">`;

if (code.includes(searchStr)) {
  code = code.replace(searchStr, replaceStr);
  if (isCRLF) code = code.replace(/\n/g, '\r\n');
  fs.writeFileSync('src/components/team/TeamStaffManagement.tsx', code, 'utf8');
  console.log('Admin Operations section added successfully.');
} else {
  console.error('Could not find search string in TeamStaffManagement.tsx');
  process.exit(1);
}
