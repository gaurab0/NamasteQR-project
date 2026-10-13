const fs = require('fs');
let dashCode = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf8');
dashCode = dashCode.replace(/mode=\{business\?\.date_format_nav \|\| user\?\.business\?\.date_format_nav \|\| 'ENGLISH'\}/, 
  "mode={user?.business?.date_format_nav || 'ENGLISH'}");
dashCode = dashCode.replace(/mode=\{activeBusiness\?\.date_format_nav \|\| user\?\.business\?\.date_format_nav \|\| 'ENGLISH'\}/, 
  "mode={user?.business?.date_format_nav || 'ENGLISH'}");
fs.writeFileSync('src/pages/DashboardPage.tsx', dashCode, 'utf8');
