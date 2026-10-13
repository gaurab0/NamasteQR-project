const fs = require('fs');
let code = fs.readFileSync('src/components/config/BusinessConfigurationCenter.tsx', 'utf8');

const regex = /  \{\n    id: 'hardware',/m;
const replacement = `  {
    id: 'date_localization',
    label: 'Operations & Localization',
    shortLabel: 'Localization',
    description: 'Configure Nepali and English date & time formats for the app and billing.',
    icon: <Globe className="w-4 h-4" />,
    badge: 'Localization',
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  {
    id: 'hardware',`;

code = code.replace(regex, replacement);

if (!code.includes('Globe')) {
  code = code.replace(/import \{([\s\S]*?) \} from 'lucide-react';/, "import { Globe,$1 } from 'lucide-react';");
}

fs.writeFileSync('src/components/config/BusinessConfigurationCenter.tsx', code, 'utf8');
console.log('Added date_localization tab');
