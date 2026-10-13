const fs = require('fs');
let c = fs.readFileSync('src/components/menu/MenuItemFormModal.tsx', 'utf8');

const oldRows = `                    {/* Variant Rows */}
                    <div className="space-y-2">
                      {variants.map((v, idx) => (
                        <div key={v.id || idx} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-zinc-200 shadow-2xs">
                          <div className="flex-1">
                            <input
                              type="text"
                              value={v.name}
                              onChange={(e) => handleUpdateVariant(idx, 'name', e.target.value)}
                              placeholder="Option name (e.g. Chicken, Pork, Steamed, Large)..."
                              className="w-full text-xs px-3 py-1.5 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                            />
                          </div>
                          <div className="w-32 relative">
                            <span className="absolute left-2.5 top-1.5 text-xs text-zinc-400 font-bold font-mono">
                              {currency}
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={v.price}
                              onChange={(e) => handleUpdateVariant(idx, 'price', e.target.value)}
                              placeholder="Price"
                              className="w-full text-xs pl-8 pr-2 py-1.5 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDuplicateVariant(idx)}
                            className="p-1.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                            title="Duplicate option"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveVariant(idx)}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Remove option"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>`;

const newRows = `                    {/* Variant Rows */}
                    <div className="space-y-2">
                      {variants.map((v, idx) => (
                        <div key={v.id || idx} className="flex flex-col gap-2 bg-white p-2 rounded-xl border border-zinc-200 shadow-2xs">
                          <div className="flex items-center gap-2">
                            {/* Photo Thumbnail */}
                            <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-zinc-50 border border-zinc-200 flex items-center justify-center group">
                              {v.image_url ? (
                                <>
                                  <img src={v.image_url} alt="Variant" className="w-full h-full object-cover" />
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateVariant(idx, 'image_url', '')}
                                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition cursor-pointer"
                                    title="Remove image"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                  </button>
                                </>
                              ) : (
                                <label className="w-full h-full flex items-center justify-center cursor-pointer text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition">
                                  <Upload className="w-3.5 h-3.5" />
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleVariantImageUpload(idx, e)}
                                    className="hidden"
                                  />
                                </label>
                              )}
                            </div>
                            
                            <div className="flex-1">
                              <input
                                type="text"
                                value={v.name}
                                onChange={(e) => handleUpdateVariant(idx, 'name', e.target.value)}
                                placeholder="Option name (e.g. Cheese Pizza)..."
                                className="w-full text-xs px-2.5 py-1.5 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                              />
                            </div>
                            
                            <div className="w-24 relative">
                              <span className="absolute left-2.5 top-1.5 text-xs text-zinc-400 font-bold font-mono">
                                {currency}
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={v.price}
                                onChange={(e) => handleUpdateVariant(idx, 'price', e.target.value)}
                                placeholder="Price"
                                className="w-full text-xs pl-7 pr-2 py-1.5 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-bold"
                              />
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => handleDuplicateVariant(idx)}
                              className="p-1.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                              title="Duplicate option"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveVariant(idx)}
                              className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Remove option"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          
                          {/* Bottom Row (Inline Description Input) */}
                          <div>
                            <input
                              type="text"
                              value={v.description || ''}
                              onChange={(e) => handleUpdateVariant(idx, 'description', e.target.value)}
                              placeholder="Option description (e.g. Creamy mozzarella, cheddar blend, and herbs)..."
                              className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-zinc-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>`;

c = c.replace(oldRows, newRows);
fs.writeFileSync('src/components/menu/MenuItemFormModal.tsx', c);
