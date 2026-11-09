import React, { useState, useEffect } from 'react';
import { MenuItem, MenuCategory, FoodType, MenuStatus, MenuItemVariant, KitchenStation } from '../../types/rbac';
import {
  X,
  Upload,
  Image as ImageIcon,
  Sparkles,
  UtensilsCrossed,
  Clock,
  Plus,
  Loader2,
  Trash2,
  CheckCircle2,
  Search,
  Tag,
  Check,
  Layers,
  Copy,
  ChefHat,
  Wine,
  PackageCheck,
  PackageX,
} from 'lucide-react';

interface MenuItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (itemData: Partial<MenuItem>) => Promise<void>;
  itemToEdit?: MenuItem | null;
  categories: MenuCategory[];
  onCreateCategory?: (name: string) => Promise<MenuCategory>;
}

export const MenuItemFormModal: React.FC<MenuItemFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  itemToEdit,
  categories,
  onCreateCategory,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Nepali');
  const [additionalCategories, setAdditionalCategories] = useState<string[]>([]);
  const [customCatInput, setCustomCatInput] = useState('');
  const [price, setPrice] = useState<number | string>(350);
  const [currency, setCurrency] = useState('Rs.');
  const [hasVariants, setHasVariants] = useState<boolean>(false);
  const [variants, setVariants] = useState<MenuItemVariant[]>([]);
  const [variantGroupName, setVariantGroupName] = useState<string>('Portion / Size');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [foodType, setFoodType] = useState<FoodType>('none');
  const [status, setStatus] = useState<MenuStatus>('available');
  const [prepTime, setPrepTime] = useState<number | string>(15);
  const [station, setStation] = useState<KitchenStation>('KITCHEN');
  const [erpItemCode, setErpItemCode] = useState('');
  const [isPackageable, setIsPackageable] = useState<boolean>(true);

  const [isCreatingInlineCat, setIsCreatingInlineCat] = useState(false);
  const [newCatInlineName, setNewCatInlineName] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [previewSelectedVariantId, setPreviewSelectedVariantId] = useState<string | null>(null);

  // 1-second debounce for image query to process suggestions properly
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearchingImages, setIsSearchingImages] = useState(false);
  const [suggestedImages, setSuggestedImages] = useState<{ id: string; title: string; url: string; source?: string }[]>([]);
  const [variantSuggestions, setVariantSuggestions] = useState<Record<number, {id: string; title: string; url: string;}[]>>({});
  const [isSearchingVariantImages, setIsSearchingVariantImages] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) {
      setDebouncedQuery('');
      setSuggestedImages([]);
      setIsSearchingImages(false);
      return;
    }

    setIsSearchingImages(true);
    const timer = setTimeout(async () => {
      setDebouncedQuery(trimmed);
      try {
        // Fetch real web search images from our server endpoint
        const res = await fetch(`/api/images/search?q=${encodeURIComponent(trimmed)}&category=${encodeURIComponent(category)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.results)) {
            setSuggestedImages(data.results.slice(0, 3));
          }
        }
      } catch (err) {
        console.warn('Image search error:', err);
      } finally {
        setIsSearchingImages(false);
      }
    }, 1000); // 1-second delay as requested

    return () => clearTimeout(timer);
  }, [name, category]);

  // Initialize or reset on open/edit change
  useEffect(() => {
    if (itemToEdit) {
      setName(itemToEdit.name || '');
      const primaryCat = itemToEdit.category || (categories[0]?.name ?? 'Nepali');
      setCategory(primaryCat);
      const extraCats = Array.isArray(itemToEdit.additional_categories)
        ? itemToEdit.additional_categories.filter((c) => c && c.toLowerCase() !== primaryCat.toLowerCase())
        : [];
      setAdditionalCategories(extraCats);
      setPrice(itemToEdit.price || 0);
      setCurrency(itemToEdit.currency || 'Rs.');
      const itemHasVariants = !!itemToEdit.has_variants && Array.isArray(itemToEdit.variants) && itemToEdit.variants.length > 0;
      setHasVariants(itemHasVariants);
      setVariants(itemHasVariants ? (itemToEdit.variants || []) : []);
      setVariantGroupName(itemToEdit.variant_group_name || 'Portion / Size');
      setDescription(itemToEdit.description || '');
      setImageUrl(itemToEdit.image_url || '');
      setFoodType(itemToEdit.food_type || 'none');
      setStation((itemToEdit.station as KitchenStation) || 'KITCHEN');
      setErpItemCode(itemToEdit.erp_item_code || '');
      setStatus(itemToEdit.status || (itemToEdit.is_available ? 'available' : 'unavailable'));
      setPrepTime(itemToEdit.preparation_time_mins || 15);
      setIsPackageable(itemToEdit.is_packageable !== false);
    } else {
      setName('');
      setCategory(categories[0]?.name || 'Nepali');
      setAdditionalCategories([]);
      setPrice(350);
      setCurrency('Rs.');
      setHasVariants(false);
      setVariants([]);
      setVariantGroupName('Portion / Size');
      setDescription('');
      setImageUrl('');
      setFoodType('none');
      setStation('KITCHEN');
      setErpItemCode('');
      setStatus('available');
      setPrepTime(15);
      setIsPackageable(true);
    }
    setCustomCatInput('');
    setFormError(null);
    setIsCreatingInlineCat(false);
  }, [itemToEdit, isOpen, categories]);

  const applyVariantPreset = (type: 'sizes' | 'bar' | 'styles') => {
    setHasVariants(true);
    const baseP = Number(price) || 350;
    if (type === 'sizes') {
      setVariantGroupName('Portion / Size');
      setVariants([
        { id: `var_${Date.now()}_1`, name: 'Small', price: Math.round(baseP * 0.75) },
        { id: `var_${Date.now()}_2`, name: 'Medium', price: baseP },
        { id: `var_${Date.now()}_3`, name: 'Large', price: Math.round(baseP * 1.35) },
      ]);
    } else if (type === 'bar') {
      setVariantGroupName('Bar Measure');
      setVariants([
        { id: `var_${Date.now()}_1`, name: '30ml Peg', price: Math.round(baseP * 0.4) },
        { id: `var_${Date.now()}_2`, name: '60ml Peg', price: Math.round(baseP * 0.75) },
        { id: `var_${Date.now()}_3`, name: 'Full Bottle', price: baseP * 5 },
      ]);
    } else if (type === 'styles') {
      setVariantGroupName('Preparation Style');
      setVariants([
        { id: `var_${Date.now()}_1`, name: 'Steamed', price: baseP },
        { id: `var_${Date.now()}_2`, name: 'Fried', price: Math.round(baseP + 30) },
        { id: `var_${Date.now()}_3`, name: 'Kothey (Pan-Fried)', price: Math.round(baseP + 40) },
        { id: `var_${Date.now()}_4`, name: 'Chilli / Jhol', price: Math.round(baseP + 60) },
      ]);
    }
  };

  const handleAddVariantRow = () => {
    setVariants((prev) => [
      ...prev,
      { id: `var_${Date.now()}_${prev.length + 1}`, name: '', price: Number(price) || 100, food_type: foodType as FoodType },
    ]);
  };

  const handleSuggestVariantPhotos = async (index: number) => {
    const vName = (variants[index].name || '').trim();
    const parentName = name.trim();
    // If variant already contains main keywords from parentName, don't duplicate (e.g. "Chicken Spagetti" under "Spaghetti")
    const parentTokens = parentName.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const hasOverlap = parentTokens.some(t => vName.toLowerCase().includes(t.slice(0, 4)));
    const combinedQuery = hasOverlap || !parentName ? vName : `${parentName} ${vName}`.trim();
    if (!combinedQuery) return;
    
    setIsSearchingVariantImages(prev => ({ ...prev, [index]: true }));
    try {
      const res = await fetch(`/api/images/search?q=${encodeURIComponent(combinedQuery)}&category=${encodeURIComponent(category)}`);
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

  const handleUpdateVariant = (index: number, field: 'name' | 'price' | 'image_url' | 'description' | 'food_type', val: any) => {
    setVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: val } : v))
    );
  };

  
  const handleVariantImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setFormError('Variant image file size should be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          handleUpdateVariant(index, 'image_url', reader.result);
          setFormError(null);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveVariant = (index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDuplicateVariant = (index: number) => {
    const target = variants[index];
    if (!target) return;
    const duplicated: MenuItemVariant = {
      id: `var_${Date.now()}_${variants.length + 1}`,
      name: `${target.name} (Copy)`.trim(),
      price: target.price,
      is_available: target.is_available !== false,
    };
    const next = [...variants];
    next.splice(index + 1, 0, duplicated);
    setVariants(next);
  };

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setFormError('Image file size should be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setImageUrl(reader.result);
          setFormError(null);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateCategoryInline = async () => {
    if (!newCatInlineName.trim() || !onCreateCategory) return;
    try {
      const created = await onCreateCategory(newCatInlineName.trim());
      setCategory(created.name);
      setNewCatInlineName('');
      setIsCreatingInlineCat(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create new category');
    }
  };

  const toggleAdditionalCategory = (catName: string) => {
    const trimmed = catName.trim();
    if (!trimmed || trimmed.toLowerCase() === category.toLowerCase()) return;

    if (additionalCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setAdditionalCategories(additionalCategories.filter((c) => c.toLowerCase() !== trimmed.toLowerCase()));
    } else {
      setAdditionalCategories([...additionalCategories, trimmed]);
    }
  };

  const handleAddCustomCategoryTag = () => {
    const trimmed = customCatInput.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === category.toLowerCase()) {
      setCustomCatInput('');
      return;
    }
    if (!additionalCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setAdditionalCategories([...additionalCategories, trimmed]);
    }
    setCustomCatInput('');
  };

  const handleRemoveAdditionalCategory = (catName: string) => {
    setAdditionalCategories(additionalCategories.filter((c) => c.toLowerCase() !== catName.toLowerCase()));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Please enter a valid item name.');
      return;
    }
    if (hasVariants) {
      if (variants.length === 0) {
        setFormError('Please add at least one subcategory/option or turn off Subcategories & Pricing.');
        return;
      }
      if (variants.some((v) => !v.name.trim())) {
        setFormError('All options/subcategories must have a name (e.g. Chicken, Pork, Steamed, Large).');
        return;
      }
      if (variants.some((v) => isNaN(Number(v.price)) || Number(v.price) < 0)) {
        setFormError('All options/subcategories must have a valid non-negative price.');
        return;
      }
    } else if (Number(price) < 0 || isNaN(Number(price))) {
      setFormError('Please enter a valid price.');
      return;
    }

    try {
      setLoading(true);
      setFormError(null);

      // Filter out primary category from additional categories
      const cleanAdditional = additionalCategories
        .map((c) => c.trim())
        .filter((c) => c.length > 0 && c.toLowerCase() !== category.trim().toLowerCase());

      const validVariants = hasVariants
        ? variants.map((v, i) => ({
            id: v.id || `var_${Date.now()}_${i}`,
            name: v.name?.trim() || '',
            price: Number(v.price),
            is_available: v.is_available !== false,
            image_url: v.image_url || undefined,
            description: v.description || undefined,
            food_type: v.food_type || foodType,
          }))
        : [];

      // Base price is the minimum/first variant price when variants are active
      const finalBasePrice = hasVariants && validVariants.length > 0
        ? Number(validVariants[0].price)
        : Number(price);

      const payload: Partial<MenuItem> = {
        name: name.trim(),
        category: category.trim(),
        additional_categories: cleanAdditional,
        price: finalBasePrice,
        currency,
        description: description.trim(),
        image_url: imageUrl.trim(),
        food_type: foodType,
        station,
        status,
        is_available: status === 'available',
        is_packageable: isPackageable,
        has_variants: hasVariants && validVariants.length > 0,
        variants: validVariants,
        variant_group_name: hasVariants && variantGroupName.trim() ? variantGroupName.trim() : undefined,
        display_style: itemToEdit?.display_style || 'auto',
        show_image: itemToEdit?.show_image !== undefined ? itemToEdit.show_image : true,
        promo_badge: itemToEdit?.promo_badge || undefined,
        preparation_time_mins: Number(prepTime) || 15,
      };

      console.log('SAVING PAYLOAD:', JSON.stringify(payload, null, 2));
      await onSave(payload);
      onClose();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save menu item');
    } finally {
      setLoading(false);
    }
  };

  const isVeg = foodType === 'veg';
  const isNonVeg = foodType === 'non-veg';
  const hasDietary = isVeg || isNonVeg;

  return (
    <div
      id="menu-item-form-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="menu-item-form-modal-container"
        className="relative bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-5xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/70">
          <div>
            <h2 id="modal-title" className="text-lg font-bold text-zinc-900">
              {itemToEdit ? 'Edit Menu Item' : 'Add New Menu Item'}
            </h2>
            <p className="text-xs text-zinc-500">
              {itemToEdit
                ? 'Update dish details, pricing, status, and culinary image'
                : 'Create a new dish for your restaurant menu with live preview'}
            </p>
          </div>
          <button
            id="btn-close-modal"
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: 2 Columns (Form + Live Customer Preview) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200">
          {/* Left Column: Form Controls (7 cols) */}
          <div className="lg:col-span-7 p-6 space-y-5">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-start gap-2">
                <span>⚠️</span>
                <span>{formError}</span>
              </div>
            )}

            <form id="menu-item-editor-form" onSubmit={handleSubmit} className="space-y-4">
              {/* Food Name & Price - Put first so user enters name to trigger suggestions */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-8 space-y-1">
                  <label htmlFor="input-food-name" className="block text-xs font-bold text-zinc-700">
                    Food Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-food-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Chicken Biryani, Steamed Momos, Burger..."
                    className="w-full text-xs px-3 py-2.5 border border-zinc-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-zinc-900 font-medium"
                  />
                </div>

                <div className="sm:col-span-4 space-y-1">
                  <label htmlFor="input-food-price" className="block text-xs font-bold text-zinc-700">
                    {hasVariants ? `Base Price (${currency})` : `Price (${currency})`} <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-zinc-400 font-bold font-mono">
                      {currency}
                    </span>
                    <input
                      id="input-food-price"
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={hasVariants && variants.length > 0 ? variants[0].price : price}
                      onFocus={(e) => {
                        const t = e.currentTarget;
                        setTimeout(() => t.select(), 0);
                      }}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/^0+(?=\d)/, '');
                        setPrice(clean);
                        if (hasVariants && variants.length > 0) {
                          handleUpdateVariant(0, 'price', clean);
                        }
                      }}
                      placeholder="350"
                      className="w-full text-xs pl-10 pr-3 py-2.5 border border-zinc-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-zinc-900 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Subcategories & Multi-Tier Pricing Section */}
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      id="checkbox-has-variants"
                      type="checkbox"
                      checked={hasVariants}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setHasVariants(checked);
                        if (checked && variants.length === 0) {
                          applyVariantPreset('sizes');
                        }
                      }}
                      className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 cursor-pointer"
                    />
                    <label htmlFor="checkbox-has-variants" className="text-xs font-bold text-zinc-900 cursor-pointer flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-amber-600" />
                      <span>Subcategories & Multi-Tier Pricing (Sizes / Bar / Styles)</span>
                    </label>
                  </div>
                  <span className="text-[11px] text-amber-800 font-medium hidden sm:inline">
                    Multi-tier pricing per dish
                  </span>
                </div>

                {hasVariants && (
                  <div className="space-y-3 pt-2 border-t border-amber-200/60">
                    {/* Group Title Section */}
                    <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/90 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider">
                          Subcategory / Option Group Title
                        </label>
                        <span className="text-[10px] text-zinc-500">Customer sees this as selector heading</span>
                      </div>
                      <input
                        type="text"
                        value={variantGroupName}
                        onChange={(e) => setVariantGroupName(e.target.value)}
                        placeholder="e.g. Portion / Size, Bar Measure, Preparation Style..."
                        className="w-full text-xs px-3 py-1.5 border border-zinc-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-amber-500 font-semibold"
                      />
                      {/* Quick group title suggestions */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className="text-[10px] text-zinc-400 font-medium">Suggestions:</span>
                        {[
                          'Portion / Size',
                          'Bar Measure',
                          'Preparation Style',
                        ].map((title) => (
                          <button
                            key={title}
                            type="button"
                            onClick={() => setVariantGroupName(title)}
                            className={`text-[10px] px-2 py-0.5 rounded-md font-medium border transition cursor-pointer ${
                              variantGroupName === title
                                ? 'bg-amber-500 text-zinc-950 border-amber-500 font-bold'
                                : 'bg-white text-zinc-600 border-zinc-200 hover:border-amber-300'
                            }`}
                          >
                            {title}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quick Presets: Only Sizes, Bar Measures, and Preparation Styles */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-zinc-600 font-bold">1-Click Option Presets:</span>
                        <span className="text-[10px] text-zinc-400">Quick template presets</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => applyVariantPreset('sizes')}
                          className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-950 hover:bg-amber-100 text-xs font-semibold transition cursor-pointer shadow-2xs flex items-center gap-1.5"
                        >
                          📏 <span>Sizes (Small / Med / Large)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => applyVariantPreset('bar')}
                          className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-950 hover:bg-amber-100 text-xs font-semibold transition cursor-pointer shadow-2xs flex items-center gap-1.5"
                        >
                          🍸 <span>Bar Measures (30ml / 60ml / Bottle)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => applyVariantPreset('styles')}
                          className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-950 hover:bg-amber-100 text-xs font-semibold transition cursor-pointer shadow-2xs flex items-center gap-1.5"
                        >
                          🔥 <span>Preparation Styles (Steamed / Fried / Kothey)</span>
                        </button>
                      </div>
                    </div>

                    {/* Variant Rows */}
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
                            
                            <div className="flex-1 flex gap-2">
                              <input
                                type="text"
                                value={v.name}
                                onChange={(e) => handleUpdateVariant(idx, 'name', e.target.value)}
                                placeholder="Option name (e.g. Cheese Pizza)..."
                                className="w-full text-xs px-2.5 py-1.5 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                              />
                              <select
                                value={v.food_type || foodType}
                                onChange={(e) => handleUpdateVariant(idx, 'food_type', e.target.value)}
                                className="text-xs px-2 border border-zinc-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                              >
                                <option value="veg">🟢 Veg</option>
                                <option value="non-veg">🔴 Non-Veg</option>
                                <option value="egg">🥚 Egg</option>
                                <option value="none">⚪ None</option>
                              </select>
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
                                onFocus={(e) => {
                                  const t = e.currentTarget;
                                  setTimeout(() => t.select(), 0);
                                }}
                                onChange={(e) => {
                                  const clean = e.target.value.replace(/^0+(?=\d)/, '');
                                  handleUpdateVariant(idx, 'price', clean);
                                }}
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
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={handleAddVariantRow}
                        className="text-xs text-amber-800 hover:text-amber-950 font-bold flex items-center gap-1.5 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-amber-300 shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Another Subcategory / Option</span>
                      </button>
                      <span className="text-[11px] text-zinc-500">
                        {variants.length} {variants.length === 1 ? 'option' : 'options'} configured
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Food Image Uploader & Dynamic Suggestions */}
              <div className="space-y-2.5 bg-zinc-50/80 p-3.5 rounded-xl border border-zinc-200">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
                    Dish Image
                  </label>
                  <span className="text-[11px] text-zinc-500">
                    Auto-suggests photos as you type
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-start gap-3">
                  {/* Thumbnail / Upload Trigger */}
                  <div className="relative w-full sm:w-28 h-24 bg-white rounded-xl border border-dashed border-zinc-300 flex flex-col items-center justify-center overflow-hidden shrink-0 group shadow-xs">
                    {imageUrl ? (
                      <>
                        <img
                          src={imageUrl}
                          alt="Dish Preview"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setImageUrl('')}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition text-xs font-semibold gap-1"
                          title="Remove image"
                        >
                          <Trash2 className="w-4 h-4 text-rose-400" />
                          <span>Clear</span>
                        </button>
                      </>
                    ) : (
                      <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-2 text-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition">
                        <Upload className="w-5 h-5 mb-1 text-zinc-400" />
                        <span className="text-[10px] font-semibold">Upload Photo</span>
                        <input
                          id="input-file-upload-image"
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* URL Input */}
                  <div className="flex-1 w-full space-y-1.5">
                    <div>
                      <input
                        id="input-image-url"
                        type="url"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="Paste image URL (https://...) or choose below"
                        className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-zinc-900 bg-white"
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span className="flex items-center gap-1 font-semibold text-zinc-700">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        {name.trim() ? (
                          isSearchingImages ? (
                            <span className="flex items-center gap-1.5 text-amber-700">
                              <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
                              Finding photo matches for <em>"{name.trim()}"</em>...
                            </span>
                          ) : (
                            <span>Suggested photos for <em>"{name.trim()}"</em>:</span>
                          )
                        ) : (
                          <span className="text-zinc-500 italic">Type a dish name above (e.g. Apple, Biryani, Momo, Burger) to see photo suggestions.</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Dynamic Suggestions Grid (Shown only after typing & debouncing) */}
                {name.trim().length > 0 && (
                  <div className="pt-1">
                    {isSearchingImages ? (
                      <div className="flex items-center justify-center py-5 bg-white rounded-xl border border-zinc-200 text-xs text-zinc-500 gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                        <span>Searching relevant web photos for <strong>"{name.trim()}"</strong>...</span>
                      </div>
                    ) : suggestedImages.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {suggestedImages.map((sugg) => {
                          const isCurrent = imageUrl === sugg.url;
                          return (
                            <button
                              key={sugg.id}
                              type="button"
                              onClick={() => setImageUrl(sugg.url)}
                              className={`relative flex flex-col items-start p-1.5 rounded-xl border text-left transition cursor-pointer group overflow-hidden bg-white ${
                                isCurrent
                                  ? 'border-amber-600 ring-2 ring-amber-500/60 bg-amber-50/40 shadow-xs'
                                  : 'border-zinc-200 hover:border-zinc-400 hover:shadow-xs'
                              }`}
                            >
                              <div className="relative w-full h-20 rounded-lg overflow-hidden bg-zinc-100 mb-1.5">
                                <img
                                  src={sugg.url}
                                  alt={sugg.title}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  loading="lazy"
                                />
                                {isCurrent && (
                                  <div className="absolute inset-0 bg-amber-950/40 flex items-center justify-center backdrop-blur-2xs">
                                    <CheckCircle2 className="w-6 h-6 text-white drop-shadow-md" />
                                  </div>
                                )}
                              </div>
                              <div className="w-full px-0.5 flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-zinc-800 line-clamp-1 leading-tight flex-1">
                                  {sugg.title}
                                </span>
                                <span className="text-[9px] font-medium text-amber-700 bg-amber-50 px-1 py-0.5 rounded ml-1 shrink-0">
                                  {sugg.source || 'Web'}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-4 bg-white rounded-xl border border-zinc-200 text-xs text-zinc-500">
                        No photos found. You can paste any image link or upload a file.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Category & Preparation Time */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-8 space-y-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="select-food-category" className="block text-xs font-bold text-zinc-700">
                      Primary Category <span className="text-rose-500">*</span>
                    </label>
                    {onCreateCategory && !isCreatingInlineCat && (
                      <button
                        type="button"
                        onClick={() => setIsCreatingInlineCat(true)}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>New Category</span>
                      </button>
                    )}
                  </div>

                  {isCreatingInlineCat ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        id="input-inline-cat-name"
                        type="text"
                        value={newCatInlineName}
                        onChange={(e) => setNewCatInlineName(e.target.value)}
                        placeholder="New category..."
                        className="flex-1 text-xs px-2.5 py-2 border border-indigo-300 rounded-lg focus:outline-hidden"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleCreateCategoryInline}
                        className="px-2.5 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreatingInlineCat(false)}
                        className="px-2 py-2 text-zinc-500 hover:bg-zinc-100 rounded-lg text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <select
                      id="select-food-category"
                      value={category}
                      onChange={(e) => {
                        const newPrimary = e.target.value;
                        setCategory(newPrimary);
                        // If selected as primary, remove from additional
                        setAdditionalCategories((prev) => prev.filter((c) => c.toLowerCase() !== newPrimary.toLowerCase()));
                      }}
                      className="w-full text-xs px-3 py-2.5 border border-zinc-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-zinc-900 bg-white font-medium cursor-pointer"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                      {/* If current category not in list */}
                      {!categories.some((c) => c.name.toLowerCase() === category.toLowerCase()) && (
                        <option value={category}>{category}</option>
                      )}
                    </select>
                  )}
                </div>

                <div className="sm:col-span-4 space-y-1">
                  <label htmlFor="input-prep-time" className="block text-xs font-bold text-zinc-700">
                    Prep Time (mins)
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-3 w-3.5 h-3.5 text-zinc-400" />
                    <input
                      id="input-prep-time"
                      type="number"
                      min="1"
                      value={prepTime}
                      onChange={(e) => setPrepTime(e.target.value)}
                      placeholder="15"
                      className="w-full text-xs pl-9 pr-3 py-2.5 border border-zinc-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-zinc-900 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Multi-Category Selector: Also Display in Additional Categories */}
              <div className="space-y-2 bg-zinc-50/70 p-3.5 rounded-xl border border-zinc-200">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-600" />
                    Also Include in Categories (Multi-Category)
                  </label>
                  <span className="text-[11px] text-zinc-500">
                    e.g. Chef's Recommendation, Specials
                  </span>
                </div>

                {/* Chips of other available categories */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  {categories
                    .filter((c) => c.name.toLowerCase() !== category.toLowerCase())
                    .map((c) => {
                      const isSelected = additionalCategories.some(
                        (extra) => extra.toLowerCase() === c.name.toLowerCase()
                      );
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleAdditionalCategory(c.name)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 border ${
                            isSelected
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold shadow-2xs'
                              : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:border-zinc-300'
                          }`}
                        >
                          {isSelected ? (
                            <Check className="w-3 h-3 text-indigo-600 shrink-0" />
                          ) : (
                            <Plus className="w-3 h-3 text-zinc-400 shrink-0" />
                          )}
                          <span>{c.name}</span>
                        </button>
                      );
                    })}

                  {/* Any custom additional tags added by user not in main list */}
                  {additionalCategories
                    .filter(
                      (extra) =>
                        !categories.some((c) => c.name.toLowerCase() === extra.toLowerCase()) &&
                        extra.toLowerCase() !== category.toLowerCase()
                    )
                    .map((extra) => (
                      <span
                        key={extra}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 border border-indigo-300 text-indigo-700 flex items-center gap-1.5 shadow-2xs"
                      >
                        <Check className="w-3 h-3 text-indigo-600" />
                        <span>{extra}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAdditionalCategory(extra)}
                          className="text-indigo-400 hover:text-indigo-700 cursor-pointer ml-0.5"
                          title="Remove category tag"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                </div>

                {/* Custom Category Tag Input */}
                <div className="flex items-center gap-2 pt-1">
                  <div className="relative flex-1">
                    <input
                      id="input-custom-category-tag"
                      type="text"
                      value={customCatInput}
                      onChange={(e) => setCustomCatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomCategoryTag();
                        }
                      }}
                      placeholder="Type custom category name (e.g. Chef's Recommendation)..."
                      className="w-full text-xs px-3 py-1.5 bg-white border border-zinc-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCustomCategoryTag}
                    disabled={!customCatInput.trim()}
                    className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Tag</span>
                  </button>
                </div>
              </div>

              {/* Food Type (Veg / Non-Veg / None Segmented Control) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-zinc-700">Dietary Classification</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  <button
                    id="radio-veg"
                    type="button"
                    onClick={() => setFoodType('veg')}
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition cursor-pointer ${
                      isVeg
                        ? 'border-emerald-600 bg-emerald-50/80 text-emerald-900 shadow-xs ring-1 ring-emerald-500/30'
                        : 'border-zinc-200 bg-zinc-50/50 text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-md border border-emerald-600 flex items-center justify-center bg-white shrink-0">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                    </div>
                    <div className="text-left min-w-0">
                      <div className="text-xs font-bold truncate">Vegetarian</div>
                      <div className="text-[10px] text-zinc-500 truncate">Pure Veg dish</div>
                    </div>
                  </button>

                  <button
                    id="radio-non-veg"
                    type="button"
                    onClick={() => setFoodType('non-veg')}
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition cursor-pointer ${
                      isNonVeg
                        ? 'border-rose-600 bg-rose-50/80 text-rose-900 shadow-xs ring-1 ring-rose-500/30'
                        : 'border-zinc-200 bg-zinc-50/50 text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-md border border-rose-600 flex items-center justify-center bg-white shrink-0">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-600" />
                    </div>
                    <div className="text-left min-w-0">
                      <div className="text-xs font-bold truncate">Non-Vegetarian</div>
                      <div className="text-[10px] text-zinc-500 truncate">Meat/poultry/fish</div>
                    </div>
                  </button>

                  <button
                    id="radio-food-none"
                    type="button"
                    onClick={() => setFoodType('none')}
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition cursor-pointer ${
                      !hasDietary
                        ? 'border-zinc-900 bg-zinc-100 text-zinc-900 shadow-xs ring-1 ring-zinc-900/20'
                        : 'border-zinc-200 bg-zinc-50/50 text-zinc-500 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-md border border-zinc-400 flex items-center justify-center bg-white shrink-0">
                      <div className="w-2 h-0.5 rounded-full bg-zinc-400" />
                    </div>
                    <div className="text-left min-w-0">
                      <div className="text-xs font-bold truncate">None / Unspecified</div>
                      <div className="text-[10px] text-zinc-500 truncate">Beverages / General</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label htmlFor="textarea-food-description" className="block text-xs font-bold text-zinc-700">
                  Dish Description
                </label>
                <textarea
                  id="textarea-food-description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Aromatic spices, fresh herbs, side accompaniments, or serving style..."
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-zinc-900 leading-relaxed"
                />
              </div>

              {/* Order Routing Station (Kitchen / Bar / Both) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-zinc-700">Order Routing Station</label>
                  <span className="text-[10px] text-zinc-400 font-medium">Dispatched to KDS / Bar station</span>
                </div>
                <div className="inline-flex p-0.5 bg-zinc-100/90 rounded-lg border border-zinc-200/80 w-full">
                  <button
                    id="station-option-kitchen"
                    type="button"
                    onClick={() => setStation('KITCHEN')}
                    className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      station === 'KITCHEN'
                        ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/90 font-bold'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    <ChefHat className="w-3.5 h-3.5 text-amber-600" />
                    <span>Kitchen</span>
                  </button>

                  <button
                    id="station-option-bar"
                    type="button"
                    onClick={() => setStation('BAR')}
                    className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      station === 'BAR'
                        ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/90 font-bold'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    <Wine className="w-3.5 h-3.5 text-purple-600" />
                    <span>Bar</span>
                  </button>

                  <button
                    id="station-option-both"
                    type="button"
                    onClick={() => setStation('BOTH')}
                    className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      station === 'BOTH'
                        ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/90 font-bold'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    <span>Both</span>
                  </button>
                </div>
              </div>

              
              {/* Accounting & POS / ERP Item Code Mapping */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-zinc-700">Accounting / ERP Item Code</label>
                  <span className="text-[10px] text-zinc-400 font-medium">Item ID or SKU from your accounting software</span>
                </div>
                <input
                  type="text"
                  value={erpItemCode}
                  onChange={(e) => setErpItemCode(e.target.value)}
                  placeholder="e.g. 101, SKU-024"
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-zinc-900 bg-white font-mono"
                />
              </div>

              {/* Takeaway Packaging Option */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-zinc-700">Takeaway Packaging</label>
                  <span className="text-[10px] text-zinc-400 font-medium">Allow takeaway packing (+Rs. 10/pkg)</span>
                </div>
                <div className="inline-flex p-0.5 bg-zinc-100/90 rounded-lg border border-zinc-200/80 w-full">
                  <button
                    id="packageable-option-yes"
                    type="button"
                    onClick={() => setIsPackageable(true)}
                    className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      isPackageable
                        ? 'bg-white text-amber-700 shadow-xs border border-amber-200/80 font-bold'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    <PackageCheck className="w-3.5 h-3.5 text-amber-600" />
                    <span>Packageable</span>
                  </button>

                  <button
                    id="packageable-option-no"
                    type="button"
                    onClick={() => setIsPackageable(false)}
                    className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      !isPackageable
                        ? 'bg-white text-zinc-800 shadow-xs border border-zinc-300 font-bold'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    <PackageX className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Dine-In Only</span>
                  </button>
                </div>
              </div>

              {/* Availability Status */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-zinc-700">Availability Status</label>
                <div className="inline-flex p-0.5 bg-zinc-100/90 rounded-lg border border-zinc-200/80 w-full">
                  <button
                    id="status-option-available"
                    type="button"
                    onClick={() => setStatus('available')}
                    className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      status === 'available'
                        ? 'bg-white text-emerald-700 shadow-xs border border-emerald-200/80 font-bold'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Available</span>
                  </button>

                  <button
                    id="status-option-outofstock"
                    type="button"
                    onClick={() => setStatus('out_of_stock')}
                    className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      status === 'out_of_stock'
                        ? 'bg-white text-amber-700 shadow-xs border border-amber-200/80 font-bold'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>Out of Stock</span>
                  </button>

                  <button
                    id="status-option-unavailable"
                    type="button"
                    onClick={() => setStatus('unavailable')}
                    className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      status === 'unavailable'
                        ? 'bg-white text-zinc-700 shadow-xs border border-zinc-300 font-bold'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    <span>Unavailable</span>
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Right Column: Live Customer Preview (5 cols) */}
          <div className="lg:col-span-5 p-6 bg-zinc-50/80 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              {(() => {
                const selectedPreviewVariant = previewSelectedVariantId 
                  ? variants.find(v => v.id === previewSelectedVariantId) || variants[0] 
                  : variants[0];
                const previewImageUrl = (hasVariants && selectedPreviewVariant?.image_url) ? selectedPreviewVariant.image_url : imageUrl;
                const previewDesc = (hasVariants && selectedPreviewVariant?.description) ? selectedPreviewVariant.description : description;
                return (
                  <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  Live Customer Preview
                </span>
                <span className="text-[10px] bg-indigo-100 text-indigo-800 font-semibold px-2 py-0.5 rounded-full">
                  Real-time
                </span>
              </div>

              {/* The Live Rendered Card */}
              <div
                id="live-preview-card"
                className={`bg-white border rounded-2xl overflow-hidden shadow-md transition-all ${
                  status === 'unavailable'
                    ? 'opacity-80 border-zinc-200'
                    : status === 'out_of_stock'
                    ? 'border-amber-300'
                    : 'border-zinc-200'
                }`}
              >
                {/* Dish Photo / Visual Banner */}
                <div className="relative w-full h-56 bg-zinc-900/5 overflow-hidden flex items-center justify-center">
                  {previewImageUrl ? (
                    <img
                      src={previewImageUrl}
                      alt={name || 'Menu preview'}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-center"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-100 text-zinc-400 p-4">
                      <UtensilsCrossed className="w-12 h-12 mb-2 opacity-40 stroke-[1.5]" />
                      <span className="text-xs font-medium">Add photo to see live dish image</span>
                    </div>
                  )}

                  {/* Veg indicator & Category Badges */}
                  <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 z-10 max-w-[70%]">
                    {hasDietary && (
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border bg-white shadow-xs shrink-0 ${
                          isVeg ? 'border-emerald-600' : 'border-rose-600'
                        }`}
                      >
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${
                            isVeg ? 'bg-emerald-600' : 'bg-rose-600'
                          }`}
                        />
                      </div>
                    )}
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-900/80 backdrop-blur-xs text-white">
                      {category || 'General'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold backdrop-blur-xs flex items-center gap-1 ${
                      station === 'BAR'
                        ? 'bg-purple-900/80 text-purple-100'
                        : station === 'BOTH'
                        ? 'bg-blue-900/80 text-blue-100'
                        : 'bg-zinc-900/80 text-white'
                    }`}>
                      {station === 'BAR' ? <Wine className="w-2.5 h-2.5 text-purple-300" /> : station === 'BOTH' ? <Layers className="w-2.5 h-2.5 text-blue-300" /> : <ChefHat className="w-2.5 h-2.5 text-amber-300" />}
                      {station === 'BAR' ? 'Bar' : station === 'BOTH' ? 'Kitchen & Bar' : 'Kitchen'}
                    </span>
                    {itemToEdit?.promo_badge && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500 text-zinc-950 shadow-xs uppercase tracking-wider">
                        ★ {itemToEdit.promo_badge}
                      </span>
                    )}
                    {additionalCategories.map((extra) => (
                      <span
                        key={extra}
                        className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/90 backdrop-blur-xs text-white shadow-2xs"
                      >
                        {extra}
                      </span>
                    ))}
                  </div>

                  {/* Prep time */}
                  {prepTime && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/90 backdrop-blur-xs text-zinc-700 shadow-xs">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      <span>{prepTime}m</span>
                    </div>
                  )}

                  {/* Status Overlay */}
                  {status === 'out_of_stock' && (
                    <div className="absolute inset-x-0 bottom-0 bg-amber-500 text-white text-xs font-bold text-center py-1 tracking-wider uppercase">
                      Out of Stock
                    </div>
                  )}
                  {status === 'unavailable' && (
                    <div className="absolute inset-x-0 bottom-0 bg-zinc-800 text-white text-xs font-bold text-center py-1 tracking-wider uppercase">
                      Currently Unavailable
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-zinc-900 leading-snug">
                      {name || 'Delicious Dish Name'}
                    </h3>
                    {hasVariants && variants.length > 0 ? (
                      <div className="text-right shrink-0">
                        <span className="text-xs text-zinc-400 block font-sans">From</span>
                        <span className="text-base font-extrabold text-amber-600 font-mono">
                          {currency} {Math.min(...variants.map((v) => Number(v.price) || 0)).toLocaleString()}
                        </span>
                      </div>
                    ) : (
                      <span className="text-base font-extrabold text-zinc-900 font-mono shrink-0">
                        {currency} {Number(price || 0).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {hasVariants && variants.length > 0 && (
                    <div className="pt-2 border-t border-zinc-100 flex flex-wrap gap-1.5">
                      {variants.map((v) => {
                        const isSelected = previewSelectedVariantId === v.id || (!previewSelectedVariantId && variants[0]?.id === v.id);
                        return (
                          <button
                            type="button"
                            key={v.id}
                            onClick={() => setPreviewSelectedVariantId(v.id)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition cursor-pointer ${
                              isSelected 
                                ? 'bg-amber-500 text-zinc-950 border-amber-500 shadow-2xs' 
                                : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-amber-300'
                            }`}
                          >
                            {v.name || 'Size'}: {currency} {Number(v.price || 0).toLocaleString()}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <p className="text-xs text-zinc-500 line-clamp-3 leading-relaxed">
                    {previewDesc ||
                      'Freshly prepared with authentic ingredients, traditional recipes, and garnished to perfection.'}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-zinc-100 rounded-xl text-[11px] text-zinc-500 leading-relaxed">
                ℹ️ Customers view this card in your digital restaurant menu. Admin controls (Edit/Delete) will not be visible to guests.
              </div>
              </>
              );
            })()}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50 flex items-center justify-end gap-3">
          <button
            id="btn-cancel-modal"
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            id="btn-save-menu-item"
            type="button"
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
            className="px-5 py-2 text-xs font-bold text-white bg-zinc-900 rounded-xl hover:bg-zinc-800 shadow-sm transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{itemToEdit ? 'Save Changes' : 'Save Menu Item'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
