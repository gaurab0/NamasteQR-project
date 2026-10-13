const fs = require('fs');

let code = fs.readFileSync('src/pages/CustomerMenuPreviewPage.tsx', 'utf8');
const isCRLF = code.includes('\r\n');
code = code.replace(/\r\n/g, '\n');

// Target the variants mapping block in Style D
const oldVariantsBlock = `                                 return (
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
                                 )`;

const newVariantsBlock = `                                 return (
                                   <div key={v.id} 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isExpanded) handleSelectVariant(item.id, v, e);
                                      }} 
                                      className={\`flex items-center rounded-xl overflow-hidden border transition-all \${
                                        isExpanded ? 'bg-[#5c4a3d] border-[#5c4a3d] text-white shadow-2xs' : 'bg-[#faf8f5] border-[#e8e4e1] text-[#3b2d24] cursor-pointer hover:bg-[#f3eee8] hover:border-[#ded8d2]'
                                      }\`}
                                   >
                                      <div className={\`px-2.5 sm:px-3 py-1.5 font-bold text-xs \${isExpanded ? 'text-white' : 'text-[#3b2d24]'}\`}>
                                        {v.name} · {item.currency || 'Rs.'} {Number(v.price).toLocaleString()}
                                      </div>
                                      {isExpanded && (
                                        <div className="flex items-center gap-2.5 sm:gap-3 px-2 sm:px-2.5 py-1 bg-[#4a3b30] text-white border-l border-[#6b5849] font-black text-sm">
                                          <button 
                                            type="button"
                                            className="hover:text-amber-300 text-white transition p-0.5 leading-none cursor-pointer"
                                            onClick={(e) => { 
                                              e.stopPropagation(); 
                                              handleUpdateQuantity(\`\${item.id}_\${v.id}\`, vQty - 1); 
                                            }}
                                          >
                                            -
                                          </button>
                                          <span className="text-xs min-w-[12px] text-center leading-none text-white font-bold">{vQty}</span>
                                          <button 
                                            type="button"
                                            className="hover:text-amber-300 text-white transition p-0.5 leading-none cursor-pointer"
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
                                 )`;

// Target non-variant counter block
const oldNonVariantBlock = `                                <div className={\`flex items-center rounded-xl overflow-hidden border transition-all cursor-pointer \${
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
                                </div>`;

const newNonVariantBlock = `                                <div className={\`flex items-center rounded-xl overflow-hidden border transition-all cursor-pointer \${
                                  getItemCartQuantity(item.id) > 0 ? 'bg-[#5c4a3d] border-[#5c4a3d] text-white shadow-2xs' : 'bg-[#faf8f5] border-[#e8e4e1] text-[#3b2d24] hover:bg-[#f3eee8]'
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
                                     <div className="flex items-center gap-2.5 sm:gap-3 px-2 sm:px-2.5 py-1 bg-[#4a3b30] text-white border-l border-[#6b5849] font-black text-sm">
                                       <button 
                                         type="button"
                                         className="hover:text-amber-300 text-white transition p-0.5 leading-none cursor-pointer"
                                         onClick={(e) => { e.stopPropagation(); handleUpdateQuantity(item.id, getItemCartQuantity(item.id) - 1); }}
                                       >
                                         -
                                       </button>
                                       <span className="text-xs min-w-[12px] text-center leading-none text-white font-bold">{getItemCartQuantity(item.id)}</span>
                                       <button 
                                         type="button"
                                         className="hover:text-amber-300 text-white transition p-0.5 leading-none cursor-pointer"
                                         onClick={(e) => { e.stopPropagation(); handleUpdateQuantity(item.id, getItemCartQuantity(item.id) + 1); }}
                                       >
                                         +
                                       </button>
                                     </div>
                                   )}
                                </div>`;

if (!code.includes(oldVariantsBlock)) {
  console.error('Could not find oldVariantsBlock!');
  process.exit(1);
}
code = code.replace(oldVariantsBlock, newVariantsBlock);

if (!code.includes(oldNonVariantBlock)) {
  console.error('Could not find oldNonVariantBlock!');
  process.exit(1);
}
code = code.replace(oldNonVariantBlock, newNonVariantBlock);

if (isCRLF) {
  code = code.replace(/\n/g, '\r\n');
}

fs.writeFileSync('src/pages/CustomerMenuPreviewPage.tsx', code, 'utf8');
console.log('Subcategory selection colors swapped successfully!');
