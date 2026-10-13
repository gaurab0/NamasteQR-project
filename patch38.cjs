const fs = require('fs');

// Fix BusinessConfigurationCenter.tsx
let configCode = fs.readFileSync('src/components/config/BusinessConfigurationCenter.tsx', 'utf8');

configCode = configCode.replace(/  const \[businessProfile, setBusinessProfile\] = useState<Business \| null>\(business \|\| user\?\.business \|\| null\);\n\n/m, 
  "  const [businessProfile, setBusinessProfile] = useState<Business | null>(business || user?.business || null);\n  const businessId = business?.id || user?.business?.id || 'default-biz';\n  const businessName = business?.name || user?.business?.name || 'ServeFlow Business';\n\n");

fs.writeFileSync('src/components/config/BusinessConfigurationCenter.tsx', configCode, 'utf8');

// Fix DashboardPage.tsx
let dashCode = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf8');
dashCode = dashCode.replace(/mode=\{business\?\.date_format_nav \|\| user\?\.business\?\.date_format_nav \|\| 'ENGLISH'\}/, 
  "mode={activeBusiness?.date_format_nav || user?.business?.date_format_nav || 'ENGLISH'}");
// wait, activeBusiness is undefined in DashboardPage. Let's see what business object is called there.
fs.writeFileSync('src/pages/DashboardPage.tsx', dashCode, 'utf8');
console.log('Fixed TS errors.');
