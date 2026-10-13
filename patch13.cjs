const fs = require('fs');

let code = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
code = code.replace(/\r\n/g, '\n');

// Add Lock to imports
if (!code.includes('Lock,')) {
  code = code.replace('ChevronDown', 'ChevronDown,\n  Lock');
}

// Remove filter from navItems
const oldNavItemsEnd = `    {
      id: 'audit' as DashboardTab,
      label: 'Security & Audit',
      icon: ShieldCheck,
      badge: null,
      visible: (userRole || '').toUpperCase().includes('OWNER') || (userRole || '').toUpperCase().includes('ADMIN') || (userRole || '').toUpperCase().includes('MANAGER'),
    },
  ].filter(item => item.visible);`;

const newNavItemsEnd = `    {
      id: 'audit' as DashboardTab,
      label: 'Security & Audit',
      icon: ShieldCheck,
      badge: null,
      visible: (userRole || '').toUpperCase().includes('OWNER') || (userRole || '').toUpperCase().includes('ADMIN') || (userRole || '').toUpperCase().includes('MANAGER'),
    },
  ];`;

code = code.replace(oldNavItemsEnd, newNavItemsEnd);


// Replace the rendering loop
const oldRenderStart = `        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              id={\`nav-item-\${item.id}\`}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={\`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer group \${
                isActive
                  ? 'bg-amber-50 text-amber-700 shadow-2xs font-extrabold border-l-4 border-amber-600'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/80 border-l-4 border-transparent'
              } \${isCollapsed ? 'justify-center px-0' : ''}\`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon
                className={\`w-4 h-4 shrink-0 transition-transform \${
                  isActive ? 'text-amber-600 scale-105' : 'text-zinc-400 group-hover:text-zinc-700'
                }\`}
              />

              {!isCollapsed && (
                <>
                  <span className="truncate flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <span className={\`text-[10px] px-1.5 py-0.2 rounded-full font-black \${item.badgeColor || 'bg-amber-100 text-amber-800'}\`}>
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}`;

const newRenderStart = `        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const hasAccess = item.visible;

          return (
            <button
              key={item.id}
              id={\`nav-item-\${item.id}\`}
              type="button"
              onClick={() => hasAccess && onSelectTab(item.id)}
              disabled={!hasAccess}
              className={\`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all group \${
                !hasAccess 
                  ? 'opacity-50 cursor-not-allowed bg-zinc-50 text-zinc-400 border-l-4 border-transparent'
                  : isActive
                    ? 'bg-amber-50 text-amber-700 shadow-2xs font-extrabold border-l-4 border-amber-600 cursor-pointer'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/80 border-l-4 border-transparent cursor-pointer'
              } \${isCollapsed ? 'justify-center px-0' : ''}\`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon
                className={\`w-4 h-4 shrink-0 transition-transform \${
                  !hasAccess ? 'text-zinc-300' : isActive ? 'text-amber-600 scale-105' : 'text-zinc-400 group-hover:text-zinc-700'
                }\`}
              />

              {!isCollapsed && (
                <>
                  <span className="truncate flex-1 text-left">{item.label}</span>
                  {!hasAccess ? (
                     <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  ) : item.badge && (
                    <span className={\`text-[10px] px-1.5 py-0.2 rounded-full font-black \${item.badgeColor || 'bg-amber-100 text-amber-800'}\`}>
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}`;

code = code.replace(oldRenderStart, newRenderStart);

code = code.replace(/\n/g, '\r\n');
fs.writeFileSync('src/components/layout/Sidebar.tsx', code);
console.log('Sidebar rendering patched successfully');
