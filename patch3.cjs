const fs = require('fs');
let code = fs.readFileSync('src/pages/CustomerMenuPreviewPage.tsx', 'utf8');

// Normalize line endings
code = code.replace(/\r\n/g, '\n');

// Fix 1: Remove `pr-16` from title so it doesn't truncate early, and make the title allow wrapping if needed, but the original request had `truncate`. I'll just remove `pr-16`.
code = code.replace(
  /className="font-extrabold text-xl sm:text-2xl text-\[#3b2d24\] truncate pr-16"/g,
  `className="font-extrabold text-xl sm:text-2xl text-[#3b2d24] truncate pr-2"`
);

// Fix 2: Make the description box smaller length-wise. 
// Change `w-48 lg:w-64` to `w-32 lg:w-48`
code = code.replace(
  /className="hidden sm:flex bg-\[#e8e4e1\]\/60 rounded-xl p-3 w-48 lg:w-64 relative flex-col justify-between shrink-0 h-full"/g,
  `className="hidden sm:flex bg-[#e8e4e1]/60 rounded-xl p-3 w-36 lg:w-48 relative flex-col justify-between shrink-0 h-full"`
);

// Fix 3: Fix the variants mapping
// The old logic:
/*
                              {item.variants.map((v) => {
                                 const vQty = getItemVariantCartQty(item.id, v.id);
                                 const isSelected = activeVariant?.id === v.id;
                                 const isExpanded = vQty > 0 || isSelected;
                                 
                                 return (
                                   <div key={v.id} 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isExpanded) handleSelectVariant(item.id, v, e);
                                      }} 
                                      className={`flex items-center rounded-xl overflow-hidden border transition-all ${
                                        isExpanded ? 'bg-[#fcf8f5] border-[#f0e8df]' : 'bg-[#5c4a3d] border-[#5c4a3d] text-white cursor-pointer hover:bg-[#4a3b30]'
                                      }`}
                                   >
                                      <div className={`px-3 sm:px-4 py-2 font-bold text-xs sm:text-sm ${isExpanded ? 'text-[#3b2d24]' : 'text-white'}`}>
                                        {v.name} · {item.currency || 'Rs.'} {Number(v.price).toLocaleString()}
                                      </div>
                                      {isExpanded && (
                                        <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-1.5 sm:py-2 bg-[#fcf8f5] text-[#3b2d24] border-l border-[#f0e8df] font-black text-base sm:text-lg">
*/

// New logic:
const newVariantMap = `{item.variants.map((v) => {
                                 const vQty = getItemVariantCartQty(item.id, v.id);
                                 const isSelected = activeVariant?.id === v.id;
                                 const isExpanded = isSelected;
                                 
                                 return (
                                   <div key={v.id} 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isExpanded) handleSelectVariant(item.id, v, e);
                                      }} 
                                      className={\`flex items-center rounded-xl overflow-hidden border transition-all cursor-pointer \${
                                        isSelected ? 'bg-[#5c4a3d] border-[#5c4a3d]' : 'bg-[#faf8f5] border-[#e8e4e1] hover:bg-[#f3eee8]'
                                      }\`}
                                   >
                                      <div className={\`px-3 sm:px-4 py-2 font-bold text-xs sm:text-sm whitespace-nowrap \${isSelected ? 'text-white' : 'text-[#3b2d24]'}\`}>
                                        {v.name} \u00B7 {item.currency || 'Rs.'} {Number(v.price).toLocaleString()}
                                      </div>
                                      {isExpanded && (
                                        <div className=\"flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-1.5 sm:py-2 bg-[#fcf8f5] text-[#3b2d24] border-l border-[#f0e8df] font-black text-base sm:text-lg\">
                                          <button 
                                            type=\"button\"
                                            className=\"hover:text-amber-600 transition p-0.5\"
                                            onClick={(e) => { 
                                              e.stopPropagation(); 
                                              handleUpdateQuantity(\`\${item.id}_\${v.id}\`, vQty - 1); 
                                            }}
                                          >
                                            -
                                          </button>
                                          <span className=\"text-sm min-w-[12px] text-center\">{vQty}</span>
                                          <button 
                                            type=\"button\"
                                            className=\"hover:text-amber-600 transition p-0.5\"
                                            onClick={(e) => { 
                                              e.stopPropagation(); 
                                              if (vQty === 0) {
                                                handleAddToCartWithDetails(item, 1, '', v);
                                              } else {
                                                handleUpdateQuantity(\`\${item.id}_\${v.id}\`, vQty + 1);
                                              }
                                            }}
                                          >
                                            +
                                          </button>
                                        </div>
                                      )}
                                   </div>
                                 )
                              })}`;

const variantRegex = /\{item\.variants\.map\(\(v\) => \{[\s\S]*?\}\)\}\n                                   <\/div>\n                                 \)\n                              \}\)\}/;

code = code.replace(variantRegex, newVariantMap);

// Also update the base item add button (no variants) to match this styling logic if needed, but they explicitly said "subcategories". Let's check base item anyway.
const baseItemRegex = /<div className=\{\`flex items-center rounded-xl overflow-hidden border transition-all \$\{\n                                  getItemCartQuantity\(item\.id\) > 0 \? 'bg-\[#fcf8f5\] border-\[#f0e8df\]' : 'bg-\[#5c4a3d\] border-\[#5c4a3d\] text-white cursor-pointer hover:bg-\[#4a3b30\]'\n                                \}\`\}>/g;

code = code.replace(
  baseItemRegex,
  `<div className={\`flex items-center rounded-xl overflow-hidden border transition-all cursor-pointer \${
                                  getItemCartQuantity(item.id) > 0 ? 'bg-[#5c4a3d] border-[#5c4a3d]' : 'bg-[#faf8f5] border-[#e8e4e1] hover:bg-[#f3eee8]'
                                }\`}>`
);

const baseItemTextRegex = /<div className=\{\`px-3 sm:px-4 py-2 font-bold text-xs sm:text-sm \$\{getItemCartQuantity\(item\.id\) > 0 \? 'text-\[#3b2d24\]' : 'text-white'\}\`\}/g;
code = code.replace(
  baseItemTextRegex,
  `<div className={\`px-3 sm:px-4 py-2 font-bold text-xs sm:text-sm whitespace-nowrap \${getItemCartQuantity(item.id) > 0 ? 'text-white' : 'text-[#3b2d24]'}\`}`
);


// Restore CRLF
code = code.replace(/\n/g, '\r\n');
fs.writeFileSync('src/pages/CustomerMenuPreviewPage.tsx', code);
console.log('Successfully applied style updates');
