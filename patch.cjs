const fs = require('fs');
let code = fs.readFileSync('src/pages/CustomerMenuPreviewPage.tsx', 'utf8');

// The marker where we start modifying the outermost div of the grid item
const outerDivRegex = /return\s*\(\s*<div\s*key=\{item\.id\}\s*onClick=\{\(\) => \{\s*setSelectedDetailItem\(item\);\s*setIsDetailModalOpen\(true\);\s*\}\}/;
const newOuterDivStart = `return (
                  <div
                    key={item.id}`;
                    
code = code.replace(outerDivRegex, newOuterDivStart);

// Now we need to append the onClick to hero, bento, text_only divs so they don't break.
code = code.replace(
  /\{effectiveStyle === 'hero' \? \(\s*<div className="flex flex-col h-full justify-between">/,
  `{effectiveStyle === 'hero' ? (\n                      <div className="flex flex-col h-full justify-between cursor-pointer" onClick={() => { setSelectedDetailItem(item); setIsDetailModalOpen(true); }}>`
);

code = code.replace(
  /\) : effectiveStyle === 'bento' \? \(\s*\/\* -+ \*\/\s*\/\* STYLE B: [^\*]+ \*\/\s*\/\* -+ \*\/\s*<div className="p-3 sm:p-3\.5 flex flex-col gap-2">/g,
  `) : effectiveStyle === 'bento' ? (\n                      /* ------------------------------------------------------------- */\n                      /* STYLE B: BENTO SPLIT CARDS (Compact Photo + Details Beside)   */\n                      /* ------------------------------------------------------------- */\n                      <div className="p-3 sm:p-3.5 flex flex-col gap-2 cursor-pointer" onClick={() => { setSelectedDetailItem(item); setIsDetailModalOpen(true); }}>`
);

code = code.replace(
  /\) : effectiveStyle === 'text_only' \? \(\s*\/\* -+ \*\/\s*\/\* STYLE C: [^\*]+ \*\/\s*\/\* -+ \*\/\s*<div className="p-4 sm:p-5 flex flex-col justify-between h-full space-y-3">/g,
  `) : effectiveStyle === 'text_only' ? (\n                      /* ------------------------------------------------------------- */\n                      /* STYLE C: TEXT ONLY (Classic Luxury Elegance / Fills Space)    */\n                      /* ------------------------------------------------------------- */\n                      <div className="p-4 sm:p-5 flex flex-col justify-between h-full space-y-3 cursor-pointer" onClick={() => { setSelectedDetailItem(item); setIsDetailModalOpen(true); }}>`
);

// Now replace STYLE D
const styleDRegex = /\) : \(\s*\/\* -+ \*\/\s*\/\* STYLE D: COMPACT CARDS \(Price & Add Beside Image\)\s*\*\/\s*\/\* -+ \*\//;
const match = code.match(styleDRegex);
if (!match) {
  console.log('Failed to find STYLE D marker');
  process.exit(1);
}

const idx = match.index;

const endingRegex = /<\/div>\s*\)\}\s*<\/div>\s*\);\s*\}\)\}/;
const endMatch = code.substring(idx).match(endingRegex);
if (!endMatch) {
  console.log('Failed to find ending marker');
  process.exit(1);
}

const endIdx = idx + endMatch.index;

const replacement = `) : (
                      /* ------------------------------------------------------------- */
                      /* STYLE D: UPDATED INTERACTIVE CUSTOMER CARD (Based on image)   */
                      /* ------------------------------------------------------------- */
                      <div className="bg-white p-4 sm:p-5 flex flex-col gap-4 relative w-full h-full justify-between rounded-[1.5rem] border border-zinc-200">
                        {/* Top Right: Cart Pill */}
                        {(getItemCartQuantity(item.id) > 0) && (
                          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 pointer-events-none">
                            <div className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-full border border-[#3b2d24] text-[#3b2d24] text-xs sm:text-sm font-extrabold bg-white shadow-sm">
                              {getItemCartQuantity(item.id)} in cart
                            </div>
                          </div>
                        )}

                        {/* Top Section */}
                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-stretch relative">
                          
                          {/* Left: Image */}
                          {showPhoto && item.image_url && (
                            <div className="w-24 h-24 sm:w-32 sm:h-32 shrink-0 rounded-[1.25rem] overflow-hidden relative shadow-sm">
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                          )}

                          {/* Middle: Title & Price */}
                          <div className="flex flex-col justify-center flex-1 min-w-0 pt-1">
                            <h3 className="font-extrabold text-xl sm:text-2xl text-[#3b2d24] truncate pr-16">{item.name}</h3>
                            <div className="font-extrabold text-xl sm:text-2xl text-[#3b2d24] mt-1">
                              {item.currency || 'Rs.'} {displayPrice.toLocaleString()}
                            </div>
                            {hasVariants && (
                              <div className="text-[#8c7b6d] text-xs sm:text-sm mt-1 font-semibold truncate">
                                [{activeVariant?.name || 'Base'}]
                              </div>
                            )}
                          </div>

                          {/* Right: Description Box (Visible on sm+ screens) */}
                          {item.description && (
                            <div className="hidden sm:flex bg-[#e8e4e1]/60 rounded-xl p-3 w-48 lg:w-64 relative flex-col justify-between shrink-0 h-full">
                              <p className="text-[13px] font-bold text-[#3b2d24] mb-1">Description</p>
                              <p className="text-xs text-[#5c4a3d] line-clamp-3 leading-relaxed">{item.description}</p>
                              <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setSelectedDetailItem(item); setIsDetailModalOpen(true); }} 
                                className="text-[10px] font-extrabold text-[#3b2d24] self-end mt-2 hover:underline cursor-pointer uppercase tracking-wider bg-transparent border-0">
                                Read more
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Description Box (Mobile Fallback) */}
                        {item.description && (
                          <div className="flex sm:hidden bg-[#e8e4e1]/60 rounded-xl p-3 relative flex-col justify-between w-full">
                            <p className="text-[13px] font-bold text-[#3b2d24] mb-1">Description</p>
                            <p className="text-xs text-[#5c4a3d] line-clamp-2 leading-relaxed">{item.description}</p>
                            <button 
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setSelectedDetailItem(item); setIsDetailModalOpen(true); }} 
                              className="text-[10px] font-extrabold text-[#3b2d24] self-end mt-2 hover:underline cursor-pointer uppercase tracking-wider bg-transparent border-0">
                              Read more
                            </button>
                          </div>
                        )}

                        {/* Divider */}
                        {((hasVariants && item.variants && item.variants.length > 0) || (!hasVariants && !isReadOnlyMode && isHost && isAvailable)) && (
                          <hr className="border-[#e8e4e1] my-1" />
                        )}

                        {/* Bottom Section: Variants & Add */}
                        {hasVariants && item.variants && item.variants.length > 0 ? (
                          <div className="flex flex-col gap-2.5">
                            <p className="text-[10px] sm:text-[11px] font-extrabold text-[#8c7b6d] uppercase tracking-wider">
                              {item.variant_group_name ? \`\${item.variant_group_name}:\` : 'PORTION / SIZE:'}
                            </p>
                            <div className="flex flex-wrap gap-2 sm:gap-3">
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
                                      className={\`flex items-center rounded-xl overflow-hidden border transition-all \${
                                        isExpanded ? 'bg-[#fcf8f5] border-[#f0e8df]' : 'bg-[#5c4a3d] border-[#5c4a3d] text-white cursor-pointer hover:bg-[#4a3b30]'
                                      }\`}
                                   >
                                      <div className={\`px-3 sm:px-4 py-2 font-bold text-xs sm:text-sm \${isExpanded ? 'text-[#3b2d24]' : 'text-white'}\`}>
                                        {v.name} · {item.currency || 'Rs.'} {Number(v.price).toLocaleString()}
                                      </div>
                                      {isExpanded && (
                                        <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-1.5 sm:py-2 bg-[#fcf8f5] text-[#3b2d24] border-l border-[#f0e8df] font-black text-base sm:text-lg">
                                          <button 
                                            type="button"
                                            className="hover:text-amber-600 transition p-0.5"
                                            onClick={(e) => { 
                                              e.stopPropagation(); 
                                              handleUpdateQuantity(\`\${item.id}_\${v.id}\`, vQty - 1); 
                                            }}
                                          >
                                            -
                                          </button>
                                          <span className="text-sm min-w-[12px] text-center">{vQty}</span>
                                          <button 
                                            type="button"
                                            className="hover:text-amber-600 transition p-0.5"
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
                              })}
                            </div>
                          </div>
                        ) : (
                          !isReadOnlyMode && isHost && isAvailable && (
                            <div className="flex flex-col gap-2.5">
                              <p className="text-[10px] sm:text-[11px] font-extrabold text-[#8c7b6d] uppercase tracking-wider">
                                ORDER:
                              </p>
                              <div className="flex flex-wrap gap-2 sm:gap-3">
                                <div className={\`flex items-center rounded-xl overflow-hidden border transition-all \${
                                  getItemCartQuantity(item.id) > 0 ? 'bg-[#fcf8f5] border-[#f0e8df]' : 'bg-[#5c4a3d] border-[#5c4a3d] text-white cursor-pointer hover:bg-[#4a3b30]'
                                }\`}>
                                   <div className={\`px-3 sm:px-4 py-2 font-bold text-xs sm:text-sm \${getItemCartQuantity(item.id) > 0 ? 'text-[#3b2d24]' : 'text-white'}\`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (getItemCartQuantity(item.id) === 0) handleAddToCartWithDetails(item, 1);
                                      }}
                                   >
                                     {getItemCartQuantity(item.id) > 0 ? 'Added to Cart' : \`Add \${item.name}\`}
                                   </div>
                                   {getItemCartQuantity(item.id) > 0 && (
                                     <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-1.5 sm:py-2 bg-[#fcf8f5] text-[#3b2d24] border-l border-[#f0e8df] font-black text-base sm:text-lg">
                                       <button 
                                         type="button"
                                         className="hover:text-amber-600 transition p-0.5"
                                         onClick={(e) => { e.stopPropagation(); handleUpdateQuantity(item.id, getItemCartQuantity(item.id) - 1); }}
                                       >
                                         -
                                       </button>
                                       <span className="text-sm min-w-[12px] text-center">{getItemCartQuantity(item.id)}</span>
                                       <button 
                                         type="button"
                                         className="hover:text-amber-600 transition p-0.5"
                                         onClick={(e) => { e.stopPropagation(); handleUpdateQuantity(item.id, getItemCartQuantity(item.id) + 1); }}
                                       >
                                         +
                                       </button>
                                     </div>
                                   )}
                                </div>
                              </div>
                            </div>
                          )
                        )}
`;

code = code.substring(0, idx) + replacement + code.substring(endIdx);
fs.writeFileSync('src/pages/CustomerMenuPreviewPage.tsx', code);
console.log('Successfully patched CustomerMenuPreviewPage');
