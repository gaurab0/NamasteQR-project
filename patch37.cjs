const fs = require('fs');

// 1. Fix ConfigurationDomain type
let typesCode = fs.readFileSync('src/types/auth.ts', 'utf8');
typesCode = typesCode.replace(
  /export type ConfigurationDomain = 'menu' \| 'themes' \| 'tables' \| 'taxes' \| 'hardware' \| 'business_profile' \| 'franchise' \| 'team' \| 'audit' \| 'gl_accounts';/,
  "export type ConfigurationDomain = 'menu' | 'themes' | 'tables' | 'taxes' | 'hardware' | 'business_profile' | 'franchise' | 'team' | 'audit' | 'gl_accounts' | 'date_localization';"
);
fs.writeFileSync('src/types/auth.ts', typesCode, 'utf8');

// 2 & 3. Fix BusinessConfigurationCenter.tsx
let configCode = fs.readFileSync('src/components/config/BusinessConfigurationCenter.tsx', 'utf8');
if (!configCode.includes('Globe,')) {
  configCode = configCode.replace(/import \{([\s\S]*?) \} from 'lucide-react';/, "import { Globe,$1 } from 'lucide-react';");
}

const varsRegex = /  const businessId = [\s\S]*?user\?\.business;\n/m;
const varsMatch = configCode.match(varsRegex);
if (varsMatch) {
  configCode = configCode.replace(varsRegex, '');
  configCode = configCode.replace(/  const \[businessProfile, setBusinessProfile\] = useState<Business \| null>\(business \|\| user\?\.business \|\| null\);/m, 
    "  const [businessProfile, setBusinessProfile] = useState<Business | null>(business || user?.business || null);\n\n" + varsMatch[0]);
}

fs.writeFileSync('src/components/config/BusinessConfigurationCenter.tsx', configCode, 'utf8');

// 4. Fix DashboardPage.tsx activeBusiness
let dashCode = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf8');
dashCode = dashCode.replace(/<DateTimeDisplay mode=\{activeBusiness\?\.date_format_nav \|\| 'ENGLISH'\} \/>/, 
  "<DateTimeDisplay mode={business?.date_format_nav || user?.business?.date_format_nav || 'ENGLISH'} />");
fs.writeFileSync('src/pages/DashboardPage.tsx', dashCode, 'utf8');

console.log('Fixed TS errors.');
