const fs = require('fs');
let code = fs.readFileSync('src/components/config/BusinessConfigurationCenter.tsx', 'utf8');

const regex = /      case 'hardware':/m;
const replacement = `      case 'date_localization':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/90 shadow-sm relative overflow-hidden">
              <div className="relative z-10 space-y-6">
                <div>
                  <h3 className="text-xl font-black text-zinc-900 tracking-tight">Date & Time Localization</h3>
                  <p className="text-sm text-zinc-500 mt-1">Configure whether to display Nepali date (BS), English date (AD), or both across the application.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Nav Bar Setting */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 block">
                      Navigation Bar Display
                    </label>
                    <select
                      value={activeBusiness?.date_format_nav || 'ENGLISH'}
                      onChange={(e) => handleFieldChange('date_format_nav', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-zinc-50 border border-zinc-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 transition-shadow"
                    >
                      <option value="ENGLISH">Only English Date (AD)</option>
                      <option value="NEPALI">Only Nepali Date (BS)</option>
                      <option value="BOTH">Both (AD & BS)</option>
                    </select>
                  </div>

                  {/* Billing Setting */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 block">
                      Billing, KOT & BOT Display
                    </label>
                    <select
                      value={activeBusiness?.date_format_billing || 'ENGLISH'}
                      onChange={(e) => handleFieldChange('date_format_billing', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-zinc-50 border border-zinc-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 transition-shadow"
                    >
                      <option value="ENGLISH">Only English Date (AD)</option>
                      <option value="NEPALI">Only Nepali Date (BS)</option>
                      <option value="BOTH">Both (AD & BS)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 'hardware':`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/config/BusinessConfigurationCenter.tsx', code, 'utf8');
console.log('Added date_localization UI to renderDomainContent');
