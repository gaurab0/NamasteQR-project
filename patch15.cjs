const fs = require('fs');

let code = fs.readFileSync('src/pages/CustomerMenuPreviewPage.tsx', 'utf8');
const isCRLF = code.includes('\r\n');
code = code.replace(/\r\n/g, '\n');

// 1. Update line 1790 outer onClick behavior for cards so clicking outside doesn't force popup
const oldCardWrapper = `                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedDetailItem(item);
                    setIsDetailModalOpen(true);
                  }}
                  className={\`rounded-2xl border transition-all cursor-pointer \${theme.cardBg} \${colSpanClass} hover:shadow-lg hover:scale-[1.01] flex flex-col justify-between overflow-hidden\`}`;

const newCardWrapper = `                <div
                  key={item.id}
                  onClick={(e) => {
                    if (effectiveStyle !== 'cards') {
                      setSelectedDetailItem(item);
                      setIsDetailModalOpen(true);
                    }
                  }}
                  className={\`rounded-2xl border transition-all \${effectiveStyle !== 'cards' ? 'cursor-pointer hover:shadow-lg hover:scale-[1.01]' : 'shadow-xs'} \${theme.cardBg} \${colSpanClass} flex flex-col justify-between overflow-hidden\`}`;

if (code.includes(oldCardWrapper)) {
  code = code.replace(oldCardWrapper, newCardWrapper);
  console.log('Outer card wrapper patched.');
} else {
  console.log('Note: outer card wrapper pattern not matched directly.');
}

// 2. Replace STYLE D block
const startMarker = '/* STYLE D: UPDATED INTERACTIVE CUSTOMER CARD (Based on image)   */';
const startIndex = code.indexOf(startMarker);
if (startIndex === -1) {
  console.error('Could not find startMarker!');
  process.exit(1);
}

const endMarker = '</div>\n                  )}\n                </div>\n              );\n            })}';
let endIndex = code.indexOf(endMarker, startIndex);

if (endIndex === -1) {
  // Try alternative search
  const altEnd = '</div>\n                  )}\n';
  endIndex = code.indexOf(altEnd, startIndex);
}

if (endIndex === -1) {
  console.error('Could not find endMarker in normalized code!');
  process.exit(1);
}

const newStyleD = `/* STYLE D: UPDATED INTERACTIVE CUSTOMER CARD (Compact Mobile + Desktop) */
                      /* ---------------------------------------------------------------------- */
                      <div className="bg-white p-3 sm:p-4 flex flex-col gap-2.5 sm:gap-3 relative w-full h-full justify-between rounded-2xl border border-zinc-200 shadow-2xs">
                        {/* Top Right: Cart Pill (Always visible by default: 0 in cart) */}
                        <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 z-10 pointer-events-none">
                          <div className="px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full border border-[#3b2d24] text-[#3b2d24] text-[10px] sm:text-xs font-black bg-white shadow-2xs">
                            {getItemCartQuantity(item.id)} in cart
                          </div>
                        </div>

                        {/* Top Section: Image on left, Name & Price & Thin Description Box beside Image */}
                        <div className="flex flex-row gap-2.5 sm:gap-3.5 items-start relative">
                          {/* Left: Image */}
                          {showPhoto && item.image_url && (
                            <div 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setSelectedDetailItem(item); 
                                setIsDetailModalOpen(true); 
                              }}
                              className="shrink-0 rounded-xl sm:rounded-2xl overflow-hidden relative shadow-2xs bg-zinc-100 cursor-pointer hover:opacity-90 transition-opacity"
                              style={{ width: '4.75rem', height: '4.75rem' }}
                            >
                              <img 
                                src={item.image_url} 
                                alt={item.name} 
                                className="w-full h-full object-cover" 
                                referrerPolicy="no-referrer" 
                              />
                            </div>
                          )}

                          {/* Beside Image: Name on top, and beside the price is a thin description box */}
                          <div className="flex flex-col justify-between flex-1 min-w-0" style={{ minHeight: showPhoto && item.image_url ? '4.75rem' : 'auto' }}>
                            {/* Dish Name: pr-16 leaves clearance for '0 in cart' pill on top right */}
                            <h3 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setSelectedDetailItem(item); 
                                setIsDetailModalOpen(true); 
                              }}
                              className="font-extrabold text-sm sm:text-base text-[#3b2d24] truncate pr-16 sm:pr-20 leading-tight cursor-pointer hover:text-amber-800"
                            >
                              {item.name}
                            </h3>

                            {/* Row: Price & Thin Description Box beside Price */}
                            <div className="flex flex-row items-center gap-2 mt-1 sm:mt-1.5 flex-nowrap">
                              {/* Price */}
                              <div className="shrink-0 flex flex-col justify-center">
                                <div className="font-black text-sm sm:text-base text-[#3b2d24] leading-tight">
                                  {item.currency || 'Rs.'} {displayPrice.toLocaleString()}
                                </div>
                                {hasVariants && (
                                  <div className="text-[#8c7b6d] text-[10px] sm:text-xs font-semibold truncate leading-tight">
                                    [{activeVariant?.name || 'Base'}]
                                  </div>
                                )}
                              </div>

                              {/* Beside the price: Thin Description Box */}
                              {item.description ? (
                                <div className="flex-1 min-w-0 bg-[#e8e4e1]/60 rounded-lg px-2 py-0.5 sm:px-2.5 sm:py-1 relative flex flex-col justify-center border border-[#ded8d2]/70 h-10 overflow-hidden">
                                  <div className="flex items-center justify-between gap-1 leading-none">
                                    <span className="text-[9px] font-bold text-[#3b2d24] shrink-0">Description</span>
                                    <button 
                                      type="button"
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setSelectedDetailItem(item); 
                                        setIsDetailModalOpen(true); 
                                      }} 
                                      className="text-[9px] font-extrabold text-[#3b2d24] hover:underline cursor-pointer uppercase tracking-wider bg-transparent border-0 p-0 leading-none shrink-0"
                                    >
                                      Read more
                                    </button>
                                  </div>
                                  <p className="text-[10px] text-[#5c4a3d] truncate leading-tight mt-0.5">
                                    {item.description}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* Divider */}
                        {((hasVariants && item.variants && item.variants.length > 0) || (!isReadOnlyMode && isHost && isAvailable)) && (
                          <hr className="border-[#e8e4e1] my-0.5 sm:my-1" />
                        )}

                        {/* Bottom Section: Variants & Add */}
                        {hasVariants && item.variants && item.variants.length > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            <p className="text-[9px] sm:text-[10px] font-extrabold text-[#8c7b6d] uppercase tracking-wider leading-none">
                              {item.variant_group_name ? \`\${item.variant_group_name}:\` : 'PORTION / SIZE:'}
                            </p>
                            <div className="flex flex-wrap gap-1.5 sm:gap-2">
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
                                      <div className={\`px-2.5 sm:px-3 py-1.5 font-bold text-xs \${isExpanded ? 'text-[#3b2d24]' : 'text-white'}\`}>
                                        {v.name} · {item.currency || 'Rs.'} {Number(v.price).toLocaleString()}
                                      </div>
                                      {isExpanded && (
                                        <div className="flex items-center gap-2.5 sm:gap-3 px-2 sm:px-2.5 py-1 bg-[#fcf8f5] text-[#3b2d24] border-l border-[#f0e8df] font-black text-sm">
                                          <button 
                                            type="button"
                                            className="hover:text-amber-600 transition p-0.5 leading-none"
                                            onClick={(e) => { 
                                              e.stopPropagation(); 
                                              handleUpdateQuantity(\`\${item.id}_\${v.id}\`, vQty - 1); 
                                            }}
                                          >
                                            -
                                          </button>
                                          <span className="text-xs min-w-[12px] text-center leading-none">{vQty}</span>
                                          <button 
                                            type="button"
                                            className="hover:text-amber-600 transition p-0.5 leading-none"
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
                            <div className="flex flex-col gap-1.5">
                              <div className="flex flex-wrap gap-1.5">
                                <div className={\`flex items-center rounded-xl overflow-hidden border transition-all cursor-pointer \${
                                  getItemCartQuantity(item.id) > 0 ? 'bg-[#5c4a3d] border-[#5c4a3d]' : 'bg-[#faf8f5] border-[#e8e4e1] hover:bg-[#f3eee8]'
                                }\`}>
                                   <div className={\`px-2.5 sm:px-3 py-1.5 font-bold text-xs whitespace-nowrap \${getItemCartQuantity(item.id) > 0 ? 'text-white' : 'text-[#3b2d24]'}\`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (getItemCartQuantity(item.id) === 0) handleAddToCartWithDetails(item, 1);
                                      }}
                                   >
                                     {getItemCartQuantity(item.id) > 0 ? 'Added to Cart' : \`Add \${item.name}\`}
                                   </div>
                                   {getItemCartQuantity(item.id) > 0 && (
                                     <div className="flex items-center gap-2.5 sm:gap-3 px-2 sm:px-2.5 py-1 bg-[#fcf8f5] text-[#3b2d24] border-l border-[#f0e8df] font-black text-sm">
                                       <button 
                                         type="button"
                                         className="hover:text-amber-600 transition p-0.5 leading-none"
                                         onClick={(e) => { e.stopPropagation(); handleUpdateQuantity(item.id, getItemCartQuantity(item.id) - 1); }}
                                       >
                                         -
                                       </button>
                                       <span className="text-xs min-w-[12px] text-center leading-none">{getItemCartQuantity(item.id)}</span>
                                       <button 
                                         type="button"
                                         className="hover:text-amber-600 transition p-0.5 leading-none"
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
                      </div>\n`;

code = code.slice(0, startIndex) + newStyleD + code.slice(endIndex + 6); // + 6 to consume '</div>\n'

if (isCRLF) {
  code = code.replace(/\n/g, '\r\n');
}

fs.writeFileSync('src/pages/CustomerMenuPreviewPage.tsx', code, 'utf8');
console.log('CustomerMenuPreviewPage updated successfully!');
