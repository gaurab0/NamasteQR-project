const fs = require('fs');
let code = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf8');

code = code.replace(
  /import \{ WaiterStationDashboard \} from '\.\.\/components\/waiter\/WaiterStationDashboard';/,
  "import { WaiterStationDashboard } from '../components/waiter/WaiterStationDashboard';\nimport { DateTimeDisplay } from '../components/common/DateTimeDisplay';"
);

const pillsRegex = /\{\/\* Quick Sub-navigation Pills \(matching RestroX: \[Overview\] \[Finance\] \[Order\]\) \*\/\}([\s\S]*?)<\/div>/;
const replacement = `<div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar shrink-0">
              <DateTimeDisplay mode={activeBusiness?.date_format_nav || 'ENGLISH'} />
            </div>`;

code = code.replace(pillsRegex, replacement);

fs.writeFileSync('src/pages/DashboardPage.tsx', code, 'utf8');
console.log('Updated DashboardPage.tsx');
