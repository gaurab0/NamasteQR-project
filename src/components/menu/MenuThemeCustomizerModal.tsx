import React, { useState, useMemo } from 'react';
import {
  X,
  Check,
  Paintbrush,
  Type,
  Layout,
  Save,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Sparkles,
  Sliders,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Layers,
  UtensilsCrossed,
  Tag,
  Image as ImageIcon,
  Upload,
  Trash2,
  Loader2,
} from 'lucide-react';
import { MenuThemeConfig, MenuItemCustomStyle } from '../../types/auth';
import { MenuItem, MenuCategory } from '../../types/rbac';
import { getThemeClasses } from '../../utils/themeEngine';

/**
 * Resize and compress an image file to an optimal web data URL
 */
const compressImageFile = (
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number = 0.85
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file from computer.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image file.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Keep PNG transparency if original is png or webp
        const isTransparent =
          file.type === 'image/png' ||
          file.type === 'image/webp' ||
          file.type === 'image/svg+xml';
        const mimeType = isTransparent ? 'image/png' : 'image/jpeg';

        try {
          const dataUrl = canvas.toDataURL(mimeType, quality);
          resolve(dataUrl);
        } catch {
          resolve(reader.result as string);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
};

interface MenuThemeCustomizerModalProps {
  currentConfig?: MenuThemeConfig;
  onSave: (config: MenuThemeConfig) => Promise<void>;
  onClose: () => void;
  menuItems?: MenuItem[];
  categories?: MenuCategory[];
}

const PRESETS = [
  { id: 'minimal', label: 'Modern Minimal', color: 'bg-zinc-100 text-zinc-900' },
  { id: 'bistro', label: 'Warm Bistro', color: 'bg-orange-50 text-orange-900' },
  { id: 'midnight', label: 'Midnight Dark', color: 'bg-zinc-900 text-amber-500' },
  { id: 'emerald', label: 'Royal Emerald', color: 'bg-[#062c22] text-amber-400' },
  { id: 'vibrant', label: 'Vibrant Cafe', color: 'bg-rose-600 text-white' },
  { id: 'rustic', label: 'Rustic Wood (Bento)', color: 'bg-[#4a2e18] text-yellow-500' },
  { id: 'paper', label: 'Artisanal Paper (List)', color: 'bg-[#d8c3a5] text-[#4e342e]' },
];

const FONTS = [
  { id: 'sans', label: 'Modern Sans (Inter)' },
  { id: 'serif', label: 'Editorial Serif (Playfair)' },
  { id: 'rounded', label: 'Casual Rounded (Outfit)' },
  { id: 'classic', label: 'Classic Luxury (Cinzel)' },
];

const LAYOUTS = [
  { id: 'mixed', label: 'Dynamic Mixed Layout (Custom per dish & smart text fill)', desc: 'Allows some dishes with images, some text-only, and hero banners' },
  { id: 'cards', label: 'Visual Hero Cards (Photo Grid)', desc: 'Grid cards with food photos' },
  { id: 'bento', label: 'Bento Split Cards (Side-by-side)', desc: 'Two-column split cards' },
  { id: 'list', label: 'Sleek Text List (Classic Menu)', desc: 'Pure typography without photos' },
];

const BACKDROP_PRESETS = [
  {
    id: 'bistro',
    label: 'Warm Bistro',
    url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1600&auto=format&fit=crop&q=80',
  },
  {
    id: 'midnight',
    label: 'Midnight Bar',
    url: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1600&auto=format&fit=crop&q=80',
  },
  {
    id: 'emerald',
    label: 'Emerald Garden',
    url: 'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=1600&auto=format&fit=crop&q=80',
  },
  {
    id: 'rustic',
    label: 'Rustic Vineyard',
    url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&auto=format&fit=crop&q=80',
  },
  {
    id: 'minimal',
    label: 'Modern Minimal',
    url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&auto=format&fit=crop&q=80',
  },
];

const SAMPLE_LOGOS = [
  {
    label: 'Resort Crest',
    url: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=300&auto=format&fit=crop&q=80',
  },
  {
    label: 'Cafe Emblem',
    url: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=300&auto=format&fit=crop&q=80',
  },
  {
    label: 'Bar Cocktail',
    url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=300&auto=format&fit=crop&q=80',
  },
];

// Fallback sample dishes if restaurant has no dishes yet
const DEFAULT_SAMPLE_ITEMS: MenuItem[] = [
  {
    id: 'sample_1',
    business_id: 'biz',
    name: 'Steamed Chicken Momo',
    category: 'Starters',
    price: 320,
    currency: 'Rs.',
    description: 'Freshly minced spiced chicken enveloped in delicate wrapper served with spicy tomato achar.',
    image_url: 'https://images.unsplash.com/photo-1625398407796-82650a8c135f?w=400&q=80',
    food_type: 'non-veg',
    is_available: true,
    has_variants: true,
    variants: [
      { id: 'v1', name: 'Standard (10 pcs)', price: 320 },
      { id: 'v2', name: 'Jhol Momo Bowl', price: 380 },
    ],
    created_by: 'admin',
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 'sample_2',
    business_id: 'biz',
    name: 'Mutton Sekuwa Skewers',
    category: 'Barbeque',
    price: 550,
    currency: 'Rs.',
    description: 'Charcoal grilled tender mutton chunks marinated in Himalayan herbs, ginger-garlic, and mustard oil.',
    image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&q=80',
    food_type: 'non-veg',
    is_available: true,
    created_by: 'admin',
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 'sample_3',
    business_id: 'biz',
    name: 'Authentic Thakali Set (Khana)',
    category: 'Mains',
    price: 650,
    currency: 'Rs.',
    description: 'Basmati rice, black lentils, gundruk achar, seasonal greens, fresh radish pickle, and pure ghee.',
    image_url: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=400&q=80',
    food_type: 'veg',
    is_available: true,
    created_by: 'admin',
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 'sample_4',
    business_id: 'biz',
    name: 'Everest Craft Beer (650ml)',
    category: 'Beverages',
    price: 480,
    currency: 'Rs.',
    description: 'Chilled premium Nepali lager brewed from fine hops and pure Himalayan spring water.',
    image_url: '',
    food_type: 'veg',
    is_available: true,
    has_variants: true,
    variants: [
      { id: 'b1', name: 'Pint (330ml)', price: 300 },
      { id: 'b2', name: 'Bottle (650ml)', price: 480 },
    ],
    created_by: 'admin',
    created_at: new Date(),
    updated_at: new Date(),
  },
];

export const MenuThemeCustomizerModal: React.FC<MenuThemeCustomizerModalProps> = ({
  currentConfig,
  onSave,
  onClose,
  menuItems = [],
  categories = [],
}) => {
  const [activeTab, setActiveTab] = useState<'theme' | 'items'>('theme');
  const [isSaving, setIsSaving] = useState(false);

  // Initialize Theme Config
  const [config, setConfig] = useState<MenuThemeConfig>({
    preset: currentConfig?.preset || 'minimal',
    fontFamily: currentConfig?.fontFamily || 'sans',
    layoutMode: currentConfig?.layoutMode || 'mixed',
    logoUrl: currentConfig?.logoUrl || '',
    coverUrl: currentConfig?.coverUrl || '',
    taxNotice: currentConfig?.taxNotice || '',
    itemOrder: currentConfig?.itemOrder || [],
    itemCustomizations: currentConfig?.itemCustomizations || {},
  });

  // Local File Upload States
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (PNG, JPG, SVG, WebP).');
      return;
    }
    setUploadError(null);
    setIsUploadingLogo(true);
    try {
      // Max 400x400 for logo, preserving transparency
      const dataUrl = await compressImageFile(file, 400, 400, 0.9);
      setConfig((prev) => ({ ...prev, logoUrl: dataUrl }));
    } catch (err: any) {
      setUploadError(err.message || 'Failed to process logo image.');
    } finally {
      setIsUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleCoverFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }
    setUploadError(null);
    setIsUploadingCover(true);
    try {
      // Max 1280x720 for backdrop cover photo, optimized quality
      const dataUrl = await compressImageFile(file, 1280, 720, 0.82);
      setConfig((prev) => ({ ...prev, coverUrl: dataUrl }));
    } catch (err: any) {
      setUploadError(err.message || 'Failed to process backdrop photo.');
    } finally {
      setIsUploadingCover(false);
      e.target.value = '';
    }
  };

  // Category filter inside phone preview
  const [previewCategory, setPreviewCategory] = useState<string>('All');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Effective items pool (either real restaurant menu items or sample items)
  const itemsPool = useMemo(() => {
    return menuItems.length > 0 ? menuItems : DEFAULT_SAMPLE_ITEMS;
  }, [menuItems]);

  // Order items based on config.itemOrder
  const orderedItems = useMemo(() => {
    const order = config.itemOrder || [];
    if (order.length === 0) return itemsPool;

    const orderMap = new Map<string, number>();
    order.forEach((id, idx) => orderMap.set(id, idx));

    return [...itemsPool].sort((a, b) => {
      const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
      const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
      return idxA - idxB;
    });
  }, [itemsPool, config.itemOrder]);

  // Filtered for phone preview
  const previewItems = useMemo(() => {
    if (!previewCategory || previewCategory === 'All') return orderedItems;
    return orderedItems.filter((it) => {
      return (
        it.category?.toLowerCase() === previewCategory.toLowerCase() ||
        (it.additional_categories &&
          it.additional_categories.some((c) => c.toLowerCase() === previewCategory.toLowerCase()))
      );
    });
  }, [orderedItems, previewCategory]);

  // Active selected item for fine-tuning
  const activeSelectedItem = useMemo(() => {
    if (!selectedItemId) return previewItems[0] || null;
    return itemsPool.find((it) => it.id === selectedItemId) || previewItems[0] || null;
  }, [selectedItemId, itemsPool, previewItems]);

  // Reorder Item: Move Up
  const handleMoveUp = (itemId: string) => {
    const currentOrder = orderedItems.map((it) => it.id);
    const index = currentOrder.indexOf(itemId);
    if (index <= 0) return;

    const newOrder = [...currentOrder];
    const temp = newOrder[index - 1];
    newOrder[index - 1] = newOrder[index];
    newOrder[index] = temp;

    setConfig((prev) => ({
      ...prev,
      itemOrder: newOrder,
    }));
  };

  // Reorder Item: Move Down
  const handleMoveDown = (itemId: string) => {
    const currentOrder = orderedItems.map((it) => it.id);
    const index = currentOrder.indexOf(itemId);
    if (index < 0 || index >= currentOrder.length - 1) return;

    const newOrder = [...currentOrder];
    const temp = newOrder[index + 1];
    newOrder[index + 1] = newOrder[index];
    newOrder[index] = temp;

    setConfig((prev) => ({
      ...prev,
      itemOrder: newOrder,
    }));
  };

  // Toggle Display Mode for a specific dish
  const handleCycleItemMode = (itemId: string) => {
    const currentStyle = config.itemCustomizations?.[itemId]?.display_style || 'auto';
    const modes: ('auto' | 'hero' | 'bento' | 'text_only')[] = ['auto', 'hero', 'bento', 'text_only'];
    const nextIndex = (modes.indexOf(currentStyle) + 1) % modes.length;
    const nextMode = modes[nextIndex];

    handleUpdateItemCustomization(itemId, { display_style: nextMode });
  };

  // Toggle image visibility for a specific dish
  const handleToggleItemImage = (itemId: string) => {
    const currentShowImage =
      config.itemCustomizations?.[itemId]?.show_image !== undefined
        ? config.itemCustomizations[itemId].show_image
        : true;

    handleUpdateItemCustomization(itemId, { show_image: !currentShowImage });
  };

  // Update item customization
  const handleUpdateItemCustomization = (
    itemId: string,
    updates: Partial<MenuItemCustomStyle>
  ) => {
    setConfig((prev) => {
      const existing = prev.itemCustomizations?.[itemId] || {};
      return {
        ...prev,
        itemCustomizations: {
          ...prev.itemCustomizations,
          [itemId]: {
            ...existing,
            ...updates,
          },
        },
      };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(config);
      onClose();
    } catch (err) {
      console.error('Failed to save theme config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Dynamic preview colors
  const themeClasses = getThemeClasses(config);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-2 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[92vh] max-h-[92vh] overflow-hidden flex flex-col md:flex-row border border-zinc-200">
        {/* ========================================================================= */}
        {/* Left Side: Settings Panel (Scrollable with Sticky Header and Footer)      */}
        {/* ========================================================================= */}
        <div className="w-full md:w-[48%] flex flex-col h-full min-h-0 border-r border-zinc-200 bg-white">
          {/* Top Sticky Header */}
          <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-white shrink-0 z-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center">
                <Paintbrush className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-zinc-900 leading-none">
                  Menu Theme & Layout Studio
                </h2>
                <span className="text-[11px] text-zinc-400 font-medium">
                  Dynamic mobile design & space layout
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer active:scale-95"
              >
                <Save className="w-3.5 h-3.5 text-amber-400" />
                <span>{isSaving ? 'Saving...' : 'Save'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sub-navigation Tabs */}
          <div className="flex border-b border-zinc-200 px-4 bg-zinc-50/70 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('theme')}
              className={`py-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'theme'
                  ? 'border-amber-600 text-amber-900 bg-white shadow-2xs'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Paintbrush className="w-3.5 h-3.5" />
              <span>Palette & Typography</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('items')}
              className={`py-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'items'
                  ? 'border-amber-600 text-amber-900 bg-white shadow-2xs'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Dishes & Space Filling</span>
              <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 rounded-full font-extrabold">
                {itemsPool.length}
              </span>
            </button>
          </div>

          {/* Scrollable Settings Body */}
          <div className="p-5 sm:p-6 space-y-6 flex-1 overflow-y-auto min-h-0">
            {activeTab === 'theme' ? (
              <>
                {/* Theme Palette Presets */}
                <div>
                  <h3 className="text-xs font-bold text-zinc-600 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Paintbrush className="w-3.5 h-3.5 text-amber-500" /> Theme Palette
                  </h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    {PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setConfig({ ...config, preset: p.id as any })}
                        className={`p-3 rounded-xl border text-xs sm:text-sm font-medium transition-all cursor-pointer ${p.color} ${
                          config.preset === p.id
                            ? 'ring-2 ring-amber-500 shadow-md scale-[1.02]'
                            : 'opacity-85 hover:opacity-100 border-zinc-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{p.label}</span>
                          {config.preset === p.id && (
                            <Check className="w-4 h-4 shrink-0 ml-1 text-amber-500" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Typography Profile */}
                <div>
                  <h3 className="text-xs font-bold text-zinc-600 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-indigo-500" /> Typography Profile
                  </h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    {FONTS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setConfig({ ...config, fontFamily: f.id as any })}
                        className={`p-3 text-xs sm:text-sm rounded-xl border text-left transition-all cursor-pointer ${
                          config.fontFamily === f.id
                            ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-2xs font-bold'
                            : 'border-zinc-200 hover:border-zinc-300 text-zinc-700'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Default Layout Mode */}
                <div>
                  <h3 className="text-xs font-bold text-zinc-600 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Layout className="w-3.5 h-3.5 text-emerald-500" /> Layout Engine Mode
                  </h3>
                  <div className="space-y-2">
                    {LAYOUTS.map((l) => (
                      <label
                        key={l.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          config.layoutMode === l.id
                            ? 'border-amber-500 bg-amber-50/70 text-amber-950 shadow-2xs'
                            : 'border-zinc-200 hover:border-zinc-300 text-zinc-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="layoutMode"
                          value={l.id}
                          checked={config.layoutMode === l.id}
                          onChange={() => setConfig({ ...config, layoutMode: l.id as any })}
                          className="w-4 h-4 text-amber-600 focus:ring-amber-500 mt-0.5"
                        />
                        <div>
                          <div className="text-xs sm:text-sm font-bold">{l.label}</div>
                          <div className="text-[11px] text-zinc-500">{l.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Header Branding: Business Logo & Backdrop */}
                <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-amber-600" /> Header Branding & Backdrop
                    </h3>
                    <span className="text-[10px] text-zinc-400 font-medium">Local Computer / Device Upload</span>
                  </div>

                  {/* Upload Error Feedback */}
                  {uploadError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center justify-between">
                      <span>{uploadError}</span>
                      <button
                        type="button"
                        onClick={() => setUploadError(null)}
                        className="text-rose-500 hover:text-rose-800 font-bold ml-2 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* ------------------------------------------------------------- */}
                  {/* 1. Business Logo: Upload from Device or Paste URL             */}
                  {/* ------------------------------------------------------------- */}
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 block mb-1.5">
                      Business Logo (PNG, JPG, SVG, WebP)
                    </label>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      {/* Logo Preview & Direct Upload Area */}
                      <div className="relative group w-16 h-16 rounded-2xl border-2 border-dashed border-zinc-300 hover:border-amber-500 bg-white flex items-center justify-center shrink-0 overflow-hidden shadow-xs transition">
                        {config.logoUrl ? (
                          <>
                            <img
                              src={config.logoUrl}
                              alt="Logo preview"
                              className="w-full h-full object-cover"
                              onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                            />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition gap-1.5">
                              <label className="cursor-pointer p-1 text-white hover:text-amber-300" title="Change logo">
                                <Upload className="w-3.5 h-3.5" />
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleLogoFileUpload}
                                  className="hidden"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => setConfig({ ...config, logoUrl: '' })}
                                className="p-1 text-white hover:text-rose-400 cursor-pointer"
                                title="Remove logo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-1 text-center text-zinc-400 hover:text-amber-600 transition">
                            {isUploadingLogo ? (
                              <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                            ) : (
                              <>
                                <Upload className="w-4 h-4 mb-0.5 text-zinc-400 group-hover:text-amber-600" />
                                <span className="text-[9px] font-bold">Upload</span>
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleLogoFileUpload}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>

                      {/* Controls: Upload Button + URL input */}
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <label className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs">
                            <Upload className="w-3.5 h-3.5 text-amber-700" />
                            <span>{isUploadingLogo ? 'Processing...' : 'Choose Logo from Computer'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleLogoFileUpload}
                              className="hidden"
                            />
                          </label>
                          {config.logoUrl && (
                            <button
                              type="button"
                              onClick={() => setConfig({ ...config, logoUrl: '' })}
                              className="text-xs text-zinc-400 hover:text-rose-600 font-medium cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        <input
                          type="url"
                          placeholder="Or paste image URL (https://.../logo.png)"
                          value={config.logoUrl || ''}
                          onChange={(e) => setConfig({ ...config, logoUrl: e.target.value })}
                          className="w-full px-3 py-1.5 border border-zinc-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[10px] text-zinc-400">Quick Samples:</span>
                      {SAMPLE_LOGOS.map((sl) => (
                        <button
                          key={sl.label}
                          type="button"
                          onClick={() => setConfig({ ...config, logoUrl: sl.url })}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-200/70 hover:bg-zinc-300 text-zinc-700 cursor-pointer transition"
                        >
                          {sl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ------------------------------------------------------------- */}
                  {/* 2. Header Backdrop Cover: Upload from Device or Preset        */}
                  {/* ------------------------------------------------------------- */}
                  <div className="pt-3 border-t border-zinc-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-zinc-700 block">
                        Header Backdrop Cover Photo
                      </label>
                      {config.coverUrl && (
                        <button
                          type="button"
                          onClick={() => setConfig({ ...config, coverUrl: '' })}
                          className="text-xs text-zinc-400 hover:text-rose-600 font-medium cursor-pointer"
                        >
                          Clear Backdrop
                        </button>
                      )}
                    </div>

                    {/* Preview Box & Upload Trigger */}
                    <div className="relative rounded-2xl border-2 border-dashed border-zinc-300 hover:border-amber-500 bg-zinc-100 overflow-hidden mb-2 group transition shadow-2xs">
                      {config.coverUrl ? (
                        <div className="relative h-28 sm:h-32 w-full">
                          <img
                            src={config.coverUrl}
                            alt="Backdrop cover preview"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-end justify-between p-3">
                            <span className="text-xs font-bold text-white drop-shadow-md">Active Header Backdrop</span>
                            <div className="flex items-center gap-2">
                              <label className="px-2.5 py-1 bg-white/95 hover:bg-white text-zinc-900 rounded-lg text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1 transition">
                                <Upload className="w-3 h-3 text-zinc-800" />
                                <span>Replace File</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleCoverFileUpload}
                                  className="hidden"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => setConfig({ ...config, coverUrl: '' })}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer transition flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Remove</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <label className="h-24 w-full flex flex-col items-center justify-center cursor-pointer p-4 text-center text-zinc-500 hover:text-amber-700 transition hover:bg-amber-50/50">
                          {isUploadingCover ? (
                            <div className="flex items-center gap-2 text-amber-700 text-xs font-bold">
                              <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                              <span>Optimizing and loading backdrop photo...</span>
                            </div>
                          ) : (
                            <>
                              <div className="w-8 h-8 rounded-full bg-white shadow-2xs border border-zinc-200 flex items-center justify-center mb-1.5 text-zinc-500 group-hover:text-amber-600">
                                <Upload className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-bold text-zinc-800 group-hover:text-amber-800">
                                Click to Upload Backdrop from Computer
                              </span>
                              <span className="text-[10px] text-zinc-400 mt-0.5">
                                JPG, PNG, WebP (Landscape works best)
                              </span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleCoverFileUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    {/* Or URL input */}
                    <div className="mb-2">
                      <input
                        type="url"
                        placeholder="Or paste backdrop image URL (https://.../cover.jpg)"
                        value={config.coverUrl || ''}
                        onChange={(e) => setConfig({ ...config, coverUrl: e.target.value })}
                        className="w-full px-3 py-1.5 border border-zinc-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                      />
                    </div>

                    <span className="text-[10px] text-zinc-400 block mb-1.5 font-medium">
                      Or pick a curated atmosphere backdrop:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {BACKDROP_PRESETS.map((bp) => (
                        <button
                          key={bp.id}
                          type="button"
                          onClick={() => setConfig({ ...config, coverUrl: bp.url })}
                          className={`text-[11px] px-2 py-1.5 rounded-lg border text-left transition truncate cursor-pointer ${
                            config.coverUrl === bp.url
                              ? 'bg-amber-500 text-zinc-950 font-bold border-amber-600 shadow-2xs'
                              : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-200'
                          }`}
                          title={bp.label}
                        >
                          {bp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tax Notice Footer */}
                <div className="pb-2">
                  <h3 className="text-xs font-bold text-zinc-600 uppercase tracking-wider mb-1.5">
                    Custom Footer / Tax Notice
                  </h3>
                  <p className="text-[11px] text-zinc-400 mb-2">
                    Appears cleanly at the bottom of the customer digital menu.
                  </p>
                  <input
                    type="text"
                    placeholder="e.g. All rates are inclusive of 13% VAT and 10% Service Charge"
                    value={config.taxNotice || ''}
                    onChange={(e) => setConfig({ ...config, taxNotice: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              </>
            ) : (
              /* Item Layout & Space Filling Tab */
              <div className="space-y-5">
                <div className="p-3 bg-amber-50 border border-amber-200/70 rounded-xl text-xs text-amber-900">
                  <span className="font-bold block mb-1">💡 Interactive Reordering & Space Filling:</span>
                  <span>
                    Tap on dishes in the phone preview or select them below to reorder with ▲ ▼, toggle images, or change their layout mode to hero cards or sleek text rows.
                  </span>
                </div>

                {/* Active Selected Dish Inspector */}
                {activeSelectedItem && (
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Selected Dish Customizer
                      </span>
                      <span className="text-[10px] bg-zinc-200 text-zinc-700 px-2 py-0.5 rounded-full font-bold">
                        {activeSelectedItem.category || 'General'}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-sm text-zinc-900">{activeSelectedItem.name}</h4>
                      <p className="text-xs text-zinc-500 font-mono">
                        {activeSelectedItem.currency || 'Rs.'} {activeSelectedItem.price}
                      </p>
                    </div>

                    {/* Display Mode for this Item */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-700 block">
                        Dish Presentation Style:
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { id: 'auto', label: 'Auto (Default)' },
                          { id: 'hero', label: 'Hero Banner 🌟' },
                          { id: 'bento', label: 'Bento Split 🍱' },
                          { id: 'text_only', label: 'Text Only (No Photo)' },
                        ].map((mode) => {
                          const currentMode =
                            config.itemCustomizations?.[activeSelectedItem.id]?.display_style || 'auto';
                          return (
                            <button
                              key={mode.id}
                              type="button"
                              onClick={() =>
                                handleUpdateItemCustomization(activeSelectedItem.id, {
                                  display_style: mode.id as any,
                                })
                              }
                              className={`p-2 rounded-xl text-xs font-bold border transition text-left cursor-pointer ${
                                currentMode === mode.id
                                  ? 'bg-amber-500 text-zinc-950 border-amber-600 shadow-xs'
                                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                              }`}
                            >
                              {mode.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Image Visibility */}
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-200">
                      <div>
                        <span className="text-xs font-bold text-zinc-800 block">Show Photo</span>
                        <span className="text-[10px] text-zinc-400">
                          Toggle photo off to turn into space-filling text row
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleItemImage(activeSelectedItem.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                          config.itemCustomizations?.[activeSelectedItem.id]?.show_image === false
                            ? 'bg-zinc-200 text-zinc-700'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {config.itemCustomizations?.[activeSelectedItem.id]?.show_image === false ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Hidden</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>Visible</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Promo Badge / Fill space */}
                    <div className="space-y-1.5 pt-2 border-t border-zinc-200">
                      <label className="text-xs font-bold text-zinc-800 block">
                        Highlight Badge (Fills Space):
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Chef's Special, Best Seller, New"
                        value={config.itemCustomizations?.[activeSelectedItem.id]?.promo_badge || ''}
                        onChange={(e) =>
                          handleUpdateItemCustomization(activeSelectedItem.id, {
                            promo_badge: e.target.value,
                          })
                        }
                        className="w-full px-3 py-1.5 border border-zinc-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                      />
                      <div className="flex flex-wrap gap-1">
                        {["Chef's Special", 'Best Seller', 'Signature', 'Must Try', 'Spicy 🔥'].map(
                          (badge) => (
                            <button
                              key={badge}
                              type="button"
                              onClick={() =>
                                handleUpdateItemCustomization(activeSelectedItem.id, {
                                  promo_badge: badge,
                                })
                              }
                              className="px-2 py-0.5 rounded-md text-[10px] bg-white border border-zinc-200 hover:bg-amber-50 text-zinc-700 cursor-pointer"
                            >
                              {badge}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Text Alignment */}
                    <div className="space-y-1.5 pt-2 border-t border-zinc-200">
                      <label className="text-xs font-bold text-zinc-800 block">Text Alignment:</label>
                      <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 bg-white">
                        {(['left', 'center', 'right'] as const).map((align) => {
                          const currentAlign =
                            config.itemCustomizations?.[activeSelectedItem.id]?.textAlign || 'left';
                          return (
                            <button
                              key={align}
                              type="button"
                              onClick={() =>
                                handleUpdateItemCustomization(activeSelectedItem.id, {
                                  textAlign: align,
                                })
                              }
                              className={`px-3 py-1 text-xs rounded-md font-bold transition capitalize flex items-center gap-1 cursor-pointer ${
                                currentAlign === align
                                  ? 'bg-zinc-900 text-white shadow-xs'
                                  : 'text-zinc-600 hover:text-zinc-900'
                              }`}
                            >
                              {align === 'left' && <AlignLeft className="w-3 h-3" />}
                              {align === 'center' && <AlignCenter className="w-3 h-3" />}
                              {align === 'right' && <AlignRight className="w-3 h-3" />}
                              <span>{align}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick List of All Dishes for Reordering */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider block">
                    Menu Item Sequence:
                  </span>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {orderedItems.map((item, idx) => {
                      const isSelected = item.id === (activeSelectedItem?.id || selectedItemId);
                      const customStyle = config.itemCustomizations?.[item.id];
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedItemId(item.id)}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition ${
                            isSelected
                              ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-400/20 shadow-xs'
                              : 'border-zinc-200 hover:bg-zinc-50 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 text-center text-xs font-mono font-bold text-zinc-400">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <h5 className="text-xs font-bold text-zinc-900 truncate leading-tight">
                                {item.name}
                              </h5>
                              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                                <span>{item.category}</span>
                                {customStyle?.display_style && (
                                  <span className="text-amber-700 font-semibold">
                                    • {customStyle.display_style}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleMoveUp(item.id)}
                              disabled={idx === 0}
                              className="p-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-600 disabled:opacity-30 cursor-pointer"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveDown(item.id)}
                              disabled={idx === orderedItems.length - 1}
                              className="p-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-600 disabled:opacity-30 cursor-pointer"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Fixed Bottom Save Bar */}
          <div className="p-4 border-t border-zinc-200 bg-zinc-50 shrink-0">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white py-3 rounded-xl font-bold text-sm shadow-md transition disabled:opacity-50 cursor-pointer active:scale-98"
            >
              {isSaving ? (
                <>
                  <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                  <span>Saving & Applying...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-amber-400" />
                  <span>Save & Apply Theme</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Right Side: Interactive Live Phone Preview Box                            */}
        {/* ========================================================================= */}
        <div className="hidden md:flex w-full md:w-[52%] bg-zinc-100/90 items-center justify-center p-4 overflow-y-auto min-h-0">
          {/* Outer Phone Mockup Case */}
          <div className="w-[340px] h-[600px] bg-white rounded-[2.5rem] shadow-2xl border-[8px] border-zinc-800 overflow-hidden relative flex flex-col shrink-0 ring-1 ring-black/10">
            {/* Phone Top Notch / Dynamic Island */}
            <div className="h-6 bg-black/10 w-full absolute top-0 z-30 flex justify-center pt-1.5 pointer-events-none">
              <div className="w-24 h-4 bg-zinc-900 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-zinc-800 ml-auto mr-3" />
              </div>
            </div>

            {/* Scrollable Phone Screen Container */}
            <div
              className={`flex-1 pt-8 px-3 pb-4 overflow-y-auto min-h-0 ${themeClasses.pageBg} ${themeClasses.fontClass}`}
            >
              {/* Restaurant Header in Phone with Backdrop & Logo */}
              <div className="relative rounded-2xl overflow-hidden mb-3 shadow-md border border-black/10 min-h-[110px] flex flex-col justify-end p-3">
                {/* Backdrop Image */}
                <img
                  src={config.coverUrl || (themeClasses as any).defaultBackdrop}
                  alt="Cover"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover object-center scale-105"
                />
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/65 to-black/35" />

                {/* Header Content */}
                <div className="relative z-10 flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/25 backdrop-blur-xs flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-white/20 shadow-md">
                    {config.logoUrl ? (
                      <img
                        src={config.logoUrl}
                        alt="Logo"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-white font-black text-xs">
                        SF
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-white">
                    <div className="flex items-center gap-1.5">
                      <h1 className="text-xs font-black tracking-wide truncate">
                        Restaurant Dining Menu
                      </h1>
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold shrink-0">
                        Live
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-200 truncate mt-0.5">
                      Dine-In • Live QR Ordering
                    </p>
                  </div>
                </div>
              </div>

              {/* Category Quick Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-none">
                {['All', ...Array.from(new Set(itemsPool.map((it) => it.category).filter(Boolean)))].map(
                  (cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setPreviewCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition cursor-pointer ${
                        previewCategory.toLowerCase() === cat.toLowerCase()
                          ? `${themeClasses.categoryActive} shadow-2xs`
                          : `${themeClasses.categoryInactive}`
                      }`}
                    >
                      {cat}
                    </button>
                  )
                )}
              </div>

              {/* Dynamic Items List Inside Phone */}
              <div className="space-y-3">
                {previewItems.map((item, idx) => {
                  const custom = config.itemCustomizations?.[item.id] || {};
                  const isSelected = item.id === (activeSelectedItem?.id || selectedItemId);
                  const isVeg = item.food_type === 'veg';

                  // Determine display style for this item
                  let effectiveStyle: 'hero' | 'bento' | 'text_only' | 'cards' = 'cards';
                  if (custom.display_style && custom.display_style !== 'auto') {
                    effectiveStyle = custom.display_style;
                  } else if (config.layoutMode === 'list') {
                    effectiveStyle = 'text_only';
                  } else if (config.layoutMode === 'bento') {
                    effectiveStyle = 'bento';
                  } else if (config.layoutMode === 'cards') {
                    effectiveStyle = 'cards';
                  } else if (config.layoutMode === 'mixed') {
                    // Smart mixed fallback: if no image or image hidden, gracefully use text_only
                    if (!item.image_url || custom.show_image === false) {
                      effectiveStyle = 'text_only';
                    } else if (idx === 0) {
                      effectiveStyle = 'hero';
                    } else {
                      effectiveStyle = 'bento';
                    }
                  }

                  const showImg =
                    custom.show_image !== undefined
                      ? custom.show_image
                      : Boolean(item.image_url);

                  const badgeText = custom.promo_badge || item.promo_badge;
                  const textAlignClass =
                    custom.textAlign === 'center'
                      ? 'text-center'
                      : custom.textAlign === 'right'
                      ? 'text-right'
                      : 'text-left';

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedItemId(item.id);
                        setActiveTab('items');
                      }}
                      className={`group relative rounded-xl border transition-all cursor-pointer ${
                        themeClasses.cardBg
                      } ${
                        isSelected
                          ? 'ring-2 ring-amber-500 shadow-md scale-[1.01]'
                          : 'hover:shadow-sm'
                      }`}
                    >
                      {/* Floating Admin Controls on Phone Item */}
                      <div
                        className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1 bg-black/75 backdrop-blur-xs p-1 rounded-lg text-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Move Up */}
                        <button
                          type="button"
                          onClick={() => handleMoveUp(item.id)}
                          disabled={idx === 0}
                          className="p-0.5 hover:text-amber-400 disabled:opacity-20 cursor-pointer"
                          title="Move Item Up"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        {/* Move Down */}
                        <button
                          type="button"
                          onClick={() => handleMoveDown(item.id)}
                          disabled={idx === previewItems.length - 1}
                          className="p-0.5 hover:text-amber-400 disabled:opacity-20 cursor-pointer"
                          title="Move Item Down"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        {/* Quick Style Switcher */}
                        <button
                          type="button"
                          onClick={() => handleCycleItemMode(item.id)}
                          className="px-1 py-0.5 text-[9px] font-mono bg-white/20 hover:bg-white/30 rounded cursor-pointer"
                          title="Click to cycle display style"
                        >
                          {effectiveStyle === 'hero'
                            ? 'HERO'
                            : effectiveStyle === 'bento'
                            ? 'BNTO'
                            : effectiveStyle === 'text_only'
                            ? 'TEXT'
                            : 'CARD'}
                        </button>
                        {/* Quick Image Toggle */}
                        {item.image_url && (
                          <button
                            type="button"
                            onClick={() => handleToggleItemImage(item.id)}
                            className={`p-0.5 hover:text-amber-400 cursor-pointer ${
                              !showImg ? 'text-rose-400' : 'text-emerald-400'
                            }`}
                            title="Toggle photo"
                          >
                            {showImg ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </button>
                        )}
                      </div>

                      {/* 1. HERO BANNER STYLE */}
                      {effectiveStyle === 'hero' && (
                        <div className="overflow-hidden rounded-xl">
                          {showImg && item.image_url ? (
                            <div className="relative w-full h-32 bg-zinc-200">
                              <img
                                src={item.image_url}
                                alt={item.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                              <div className="absolute bottom-2 left-2.5 right-2.5 text-white">
                                {badgeText && (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-500 text-zinc-950 uppercase tracking-wider mb-1">
                                    ★ {badgeText}
                                  </span>
                                )}
                                <h4 className={`font-bold text-xs leading-snug drop-shadow-xs ${textAlignClass}`}>
                                  {item.name}
                                </h4>
                                <div className={`text-[11px] font-mono font-black ${themeClasses.priceColor}`}>
                                  {item.currency || 'Rs.'} {item.price}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className={`p-3 ${themeClasses.heroHeaderBg || 'bg-black/5 border-b border-black/10'}`}>
                              {badgeText && (
                                <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-500 text-zinc-950 uppercase tracking-wider mb-1">
                                  ★ {badgeText}
                                </span>
                              )}
                              <h4 className={`font-bold text-xs ${textAlignClass}`}>{item.name}</h4>
                              <div className={`text-xs font-mono font-bold ${themeClasses.priceColor}`}>
                                {item.currency || 'Rs.'} {item.price}
                              </div>
                            </div>
                          )}
                          <div className="p-2.5">
                            <p className="text-[9px] opacity-70 line-clamp-1">{item.description}</p>
                          </div>
                        </div>
                      )}

                      {/* 2. BENTO SPLIT STYLE */}
                      {effectiveStyle === 'bento' && (
                        <div className="p-2.5 flex gap-2.5 items-center">
                          {showImg && item.image_url ? (
                            <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-zinc-200 relative">
                              <img
                                src={item.image_url}
                                alt={item.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                              {badgeText && (
                                <span className="absolute bottom-0 inset-x-0 bg-amber-500 text-zinc-950 text-[7px] font-black text-center py-0.2 uppercase">
                                  {badgeText}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-black/5 flex items-center justify-center shrink-0">
                              <UtensilsCrossed className="w-5 h-5 opacity-40" />
                            </div>
                          )}
                          <div className={`flex-1 min-w-0 ${themeClasses.text} ${textAlignClass}`}>
                            {badgeText && (!showImg || !item.image_url) && (
                              <span className="text-[8px] font-bold text-amber-600 uppercase tracking-wider block">
                                ★ {badgeText}
                              </span>
                            )}
                            <h4 className="font-bold text-xs truncate leading-snug">{item.name}</h4>
                            <p className="text-[9px] opacity-70 line-clamp-1">{item.description}</p>
                            <div className="mt-1 flex items-center justify-between gap-1">
                              <span className={`text-xs font-mono font-extrabold ${themeClasses.priceColor}`}>
                                {item.currency || 'Rs.'} {item.price}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${themeClasses.accentBg}`}>
                                + Add
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3. TEXT ONLY (CLASSIC LUXURY LIST / NO PHOTO PLACEHOLDER) */}
                      {effectiveStyle === 'text_only' && (
                        <div className={`p-2.5 ${themeClasses.text} ${textAlignClass}`}>
                          <div className="flex items-baseline justify-between gap-1">
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              <div
                                className={`w-2.5 h-2.5 rounded-xs border flex items-center justify-center shrink-0 ${
                                  isVeg ? 'border-emerald-600' : 'border-rose-600'
                                }`}
                              >
                                <div
                                  className={`w-1 h-1 rounded-full ${
                                    isVeg ? 'bg-emerald-600' : 'bg-rose-600'
                                  }`}
                                />
                              </div>
                              <h4 className="font-bold text-xs truncate">{item.name}</h4>
                              {badgeText && (
                                <span className="text-[7px] font-black px-1 rounded bg-amber-200 text-amber-950 uppercase shrink-0">
                                  {badgeText}
                                </span>
                              )}
                              {/* Dot leaders filling horizontal space */}
                              <span className="hidden sm:inline-block flex-1 border-b border-dotted border-current opacity-30 mx-1 mb-0.5" />
                            </div>

                            <div className={`text-xs font-mono font-bold ${themeClasses.priceColor} shrink-0 ml-1`}>
                              {item.currency || 'Rs.'} {item.price}
                            </div>
                          </div>
                          {item.description && (
                            <p className="text-[9px] opacity-70 line-clamp-1 mt-0.5">
                              {item.description}
                            </p>
                          )}
                        </div>
                      )}

                      {/* 4. CARDS STYLE (Compact Side-by-side) */}
                      {effectiveStyle === 'cards' && (
                        <div className="p-2.5 flex gap-2.5 items-center">
                          {showImg && item.image_url ? (
                            <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-zinc-200 relative">
                              <img
                                src={item.image_url}
                                alt={item.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                              {badgeText && (
                                <span className="absolute bottom-0 inset-x-0 bg-amber-500 text-zinc-950 text-[7px] font-black text-center py-0.2 uppercase">
                                  {badgeText}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-black/5 flex items-center justify-center shrink-0">
                              <UtensilsCrossed className="w-5 h-5 opacity-40" />
                            </div>
                          )}
                          <div className={`flex-1 min-w-0 ${themeClasses.text} ${textAlignClass}`}>
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[9px] opacity-60 truncate">{item.category}</span>
                              {badgeText && (!showImg || !item.image_url) && (
                                <span className="text-[8px] font-bold text-amber-600 uppercase tracking-wider block">
                                  ★ {badgeText}
                                </span>
                              )}
                            </div>
                            <h4 className="font-bold text-xs truncate leading-snug">{item.name}</h4>
                            <p className="text-[9px] opacity-70 line-clamp-1">{item.description}</p>
                            <div className="mt-1 flex items-center justify-between gap-1">
                              <span className={`text-xs font-mono font-extrabold ${themeClasses.priceColor}`}>
                                {item.currency || 'Rs.'} {item.price}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${themeClasses.accentBg}`}>
                                + Add
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Tax Notice at bottom of phone preview */}
              {config.taxNotice && (
                <div
                  className={`text-center text-[9px] mt-4 p-2 rounded-lg bg-black/5 opacity-80 ${themeClasses.text}`}
                >
                  {config.taxNotice}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


