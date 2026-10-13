const fs = require('fs');
let c = fs.readFileSync('src/components/menu/MenuItemFormModal.tsx', 'utf8');

const stateBlock = `  const [isSearchingImages, setIsSearchingImages] = useState(false);
  const [suggestedImages, setSuggestedImages] = useState<{ id: string; title: string; url: string; source?: string }[]>([]);
  const [variantSuggestions, setVariantSuggestions] = useState<Record<number, {id: string; title: string; url: string;}[]>>({});
  const [isSearchingVariantImages, setIsSearchingVariantImages] = useState<Record<number, boolean>>({});`;

c = c.replace(
  `  const [isSearchingImages, setIsSearchingImages] = useState(false);\n  const [suggestedImages, setSuggestedImages] = useState<{ id: string; title: string; url: string; source?: string }[]>([]);`,
  stateBlock
);

const funcBlock = `  const handleSuggestVariantPhotos = async (index: number) => {
    const vName = variants[index].name;
    const combinedQuery = (name + ' ' + vName).trim();
    if (!combinedQuery) return;
    
    setIsSearchingVariantImages(prev => ({ ...prev, [index]: true }));
    try {
      const res = await fetch(\`/api/images/search?q=\${encodeURIComponent(combinedQuery)}&category=\${encodeURIComponent(category)}\`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.results)) {
          setVariantSuggestions(prev => ({ ...prev, [index]: data.results.slice(0, 3) }));
        }
      }
    } catch (err) {
      console.warn('Variant image search error:', err);
    } finally {
      setIsSearchingVariantImages(prev => ({ ...prev, [index]: false }));
    }
  };

  const handleUpdateVariant =`;

c = c.replace(`  const handleUpdateVariant =`, funcBlock);

const newVariantRow = `                          {/* Bottom Row (Inline Description Input) */}
                          <div className="flex flex-col gap-1.5">
                            <input
                              type="text"
                              value={v.description || ''}
                              onChange={(e) => handleUpdateVariant(idx, 'description', e.target.value)}
                              placeholder="Option description (e.g. Creamy mozzarella, cheddar blend, and herbs)..."
                              className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-zinc-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                            
                            {!v.image_url && (
                              <div>
                                <button
                                  type="button"
                                  onClick={() => handleSuggestVariantPhotos(idx)}
                                  disabled={isSearchingVariantImages[idx]}
                                  className="text-[10px] flex items-center gap-1 font-semibold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-md border border-amber-200 transition"
                                >
                                  {isSearchingVariantImages[idx] ? (
                                    <><Loader2 className="w-3 h-3 animate-spin" /> Searching...</>
                                  ) : (
                                    <><Sparkles className="w-3 h-3" /> Auto-Suggest Photos</>
                                  )}
                                </button>
                                
                                {variantSuggestions[idx] && variantSuggestions[idx].length > 0 && (
                                  <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                                    {variantSuggestions[idx].map((sugg) => (
                                      <button
                                        key={sugg.id}
                                        type="button"
                                        onClick={() => {
                                          handleUpdateVariant(idx, 'image_url', sugg.url);
                                          setVariantSuggestions(prev => ({ ...prev, [idx]: [] }));
                                        }}
                                        className="relative rounded-lg border border-amber-300 overflow-hidden group cursor-pointer"
                                      >
                                        <div className="aspect-video w-full bg-zinc-100">
                                          <img src={sugg.url} alt={sugg.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                        </div>
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[9px] font-bold transition">
                                          Select
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>`;

c = c.replace(
  `                          {/* Bottom Row (Inline Description Input) */}
                          <div>
                            <input
                              type="text"
                              value={v.description || ''}
                              onChange={(e) => handleUpdateVariant(idx, 'description', e.target.value)}
                              placeholder="Option description (e.g. Creamy mozzarella, cheddar blend, and herbs)..."
                              className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-zinc-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </div>`,
  newVariantRow
);

fs.writeFileSync('src/components/menu/MenuItemFormModal.tsx', c);
