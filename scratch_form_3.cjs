const fs = require('fs');
let c = fs.readFileSync('src/components/menu/MenuItemFormModal.tsx', 'utf8');

const previewStart = `              {/* The Live Rendered Card */}
              <div
                id="live-preview-card"
                className={\`bg-white border rounded-2xl overflow-hidden shadow-md transition-all \${
                  status === 'unavailable'
                    ? 'opacity-80 border-zinc-200'
                    : status === 'out_of_stock'
                    ? 'border-amber-300'
                    : 'border-zinc-200'
                }\`}
              >
                {/* Image (hidden if displayStyle === 'text_only' or showImage === false) */}
                {displayStyle !== 'text_only' && showImage && (
                  <div className="relative w-full h-56 bg-zinc-900/5 overflow-hidden flex items-center justify-center">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={name || 'Menu preview'}
                        referrerPolicy="no-referrer"
                        className={\`w-full h-full object-cover \${
                          status === 'out_of_stock' || status === 'unavailable' ? 'grayscale opacity-75' : ''
                        }\`}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-zinc-300 gap-2">
                        <ImageIcon className="w-12 h-12" />
                        <span className="text-xs font-medium">No Image Provided</span>
                      </div>
                    )}`;

// Wait, I need to dynamically resolve the preview selected variant.
const rightColumnSetup = `          {/* Right Column: Live Customer Preview (5 cols) */}
          <div className="lg:col-span-5 p-6 bg-zinc-50/80 flex flex-col justify-between space-y-4">
            <div className="space-y-3">`;

const previewLogic = `          {/* Right Column: Live Customer Preview (5 cols) */}
          <div className="lg:col-span-5 p-6 bg-zinc-50/80 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              {(() => {
                const selectedPreviewVariant = previewSelectedVariantId 
                  ? variants.find(v => v.id === previewSelectedVariantId) || variants[0] 
                  : variants[0];
                const previewImageUrl = (hasVariants && selectedPreviewVariant?.image_url) ? selectedPreviewVariant.image_url : imageUrl;
                const previewDesc = (hasVariants && selectedPreviewVariant?.description) ? selectedPreviewVariant.description : description;
                return (
                  <>`;

c = c.replace(rightColumnSetup, previewLogic);

// Now replace imageUrl with previewImageUrl in the img src:
c = c.replace(
  `                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={name || 'Menu preview'}`,
  `                    {previewImageUrl ? (
                      <img
                        src={previewImageUrl}
                        alt={name || 'Menu preview'}`
);

// Now replace description with previewDesc in the description block:
c = c.replace(
  `                  <p className="text-xs text-zinc-500 line-clamp-3 leading-relaxed">
                    {description ||
                      'Freshly prepared with authentic ingredients, traditional recipes, and garnished to perfection.'}
                  </p>`,
  `                  <p className="text-xs text-zinc-500 line-clamp-3 leading-relaxed">
                    {previewDesc ||
                      'Freshly prepared with authentic ingredients, traditional recipes, and garnished to perfection.'}
                  </p>`
);

// Now update the variants pills to set previewSelectedVariantId:
c = c.replace(
  `                    <div className="pt-2 border-t border-zinc-100 flex flex-wrap gap-1.5">
                      {variants.map((v) => (
                        <span
                          key={v.id}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200"
                        >
                          {v.name || 'Size'}: {currency} {Number(v.price || 0).toLocaleString()}
                        </span>
                      ))}
                    </div>`,
  `                    <div className="pt-2 border-t border-zinc-100 flex flex-wrap gap-1.5">
                      {variants.map((v) => {
                        const isSelected = previewSelectedVariantId === v.id || (!previewSelectedVariantId && variants[0]?.id === v.id);
                        return (
                          <button
                            type="button"
                            key={v.id}
                            onClick={() => setPreviewSelectedVariantId(v.id)}
                            className={\`text-[10px] font-bold px-2 py-0.5 rounded-md border transition cursor-pointer \${
                              isSelected 
                                ? 'bg-amber-500 text-zinc-950 border-amber-500 shadow-2xs' 
                                : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-amber-300'
                            }\`}
                          >
                            {v.name || 'Size'}: {currency} {Number(v.price || 0).toLocaleString()}
                          </button>
                        );
                      })}
                    </div>`
);

// Close the IIFE properly at the end of the space-y-3 div.
c = c.replace(
  `                <p className="text-[9px] text-zinc-400 mt-0.5">
                  Customers view this card in your digital restaurant menu. Admin controls (Edit/Delete) will not be visible to guests.
                </p>
              </div>
            </div>`,
  `                <p className="text-[9px] text-zinc-400 mt-0.5">
                  Customers view this card in your digital restaurant menu. Admin controls (Edit/Delete) will not be visible to guests.
                </p>
              </div>
              </>
              );
            })()}
            </div>`
);


fs.writeFileSync('src/components/menu/MenuItemFormModal.tsx', c);
