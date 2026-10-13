import { MenuThemeConfig } from '../types/auth';

export interface ThemeClassBundle {
  fontClass: string;
  pageBg: string;
  text: string;
  cardBg: string;
  headerBg: string;
  headerContainerBg: string;
  searchCardBg: string;
  accent: string;
  accentBg: string;
  priceColor: string;
  categoryActive: string;
  categoryInactive: string;
  categoryActiveBadge: string;
  categoryInactiveBadge: string;
  variantActive: string;
  variantInactive: string;
  filterActive: string;
  filterInactive: string;
  heroHeaderBg: string;
  defaultBackdrop: string;
  layout: string;
}

export const getThemeClasses = (config?: MenuThemeConfig): ThemeClassBundle => {
  const preset = config?.preset || 'minimal';
  const font = config?.fontFamily || 'sans';
  const layout = config?.layoutMode || 'cards';

  // Fonts
  const fontClass = {
    sans: 'font-sans',
    serif: 'font-serif',
    rounded: 'font-sans rounded-xl',
    classic: 'font-serif tracking-wide',
  }[font] || 'font-sans';

  // Background and overall theme colors
  const themeClasses: Record<string, Omit<ThemeClassBundle, 'fontClass' | 'layout'>> = {
    minimal: {
      pageBg: 'bg-zinc-50',
      text: 'text-zinc-900',
      cardBg: 'bg-white border-zinc-200/90 shadow-2xs',
      headerBg: 'bg-zinc-900 text-white',
      headerContainerBg: 'bg-zinc-900/85 backdrop-blur-md border-zinc-700/60 text-white',
      searchCardBg: 'bg-white border-zinc-200 text-zinc-900',
      accent: 'text-zinc-900',
      accentBg: 'bg-zinc-900 text-white hover:bg-zinc-800',
      priceColor: 'text-zinc-900 font-bold',
      categoryActive: 'bg-zinc-900 text-white border border-zinc-900 shadow-sm font-bold',
      categoryInactive: 'bg-white text-zinc-700 border border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 shadow-2xs',
      categoryActiveBadge: 'bg-white/20 text-white',
      categoryInactiveBadge: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
      variantActive: 'bg-zinc-900 text-white border-zinc-900 shadow-xs ring-1 ring-zinc-700/50',
      variantInactive: 'bg-white border-zinc-300 text-zinc-700 hover:border-zinc-400',
      filterActive: 'bg-zinc-900 text-white border border-zinc-900 shadow-sm font-bold',
      filterInactive: 'bg-white text-zinc-700 border border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 shadow-2xs',
      heroHeaderBg: 'bg-zinc-100 border-b border-zinc-200',
      defaultBackdrop: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&auto=format&fit=crop&q=80',
    },
    bistro: {
      pageBg: 'bg-[#faf6f0]',
      text: 'text-stone-900',
      cardBg: 'bg-white border-stone-200 shadow-2xs',
      headerBg: 'bg-[#291711] text-amber-100',
      headerContainerBg: 'bg-[#291711]/90 backdrop-blur-md border-orange-950/50 text-amber-100',
      searchCardBg: 'bg-white border-stone-200 text-stone-900',
      accent: 'text-amber-800',
      accentBg: 'bg-amber-800 text-white hover:bg-amber-900',
      priceColor: 'text-amber-800 font-bold',
      categoryActive: 'bg-amber-800 text-white border border-amber-800 shadow-sm font-bold',
      categoryInactive: 'bg-white text-stone-700 border border-stone-300 hover:border-amber-700 hover:bg-amber-50/50 shadow-2xs',
      categoryActiveBadge: 'bg-white/20 text-white',
      categoryInactiveBadge: 'bg-stone-100 text-stone-600 border border-stone-200',
      variantActive: 'bg-amber-800 text-white border-amber-800 shadow-xs ring-1 ring-amber-600/50',
      variantInactive: 'bg-white border-stone-300 text-stone-700 hover:border-amber-700',
      filterActive: 'bg-amber-800 text-white border border-amber-800 shadow-sm font-bold',
      filterInactive: 'bg-white text-stone-700 border border-stone-300 hover:border-amber-700 hover:bg-amber-50/50 shadow-2xs',
      heroHeaderBg: 'bg-amber-50/80 border-b border-amber-200/60',
      defaultBackdrop: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1600&auto=format&fit=crop&q=80',
    },
    midnight: {
      pageBg: 'bg-[#09090b]',
      text: 'text-zinc-100',
      cardBg: 'bg-[#121216] border-zinc-800 shadow-2xs',
      headerBg: 'bg-black text-amber-400 border-b border-zinc-800',
      headerContainerBg: 'bg-zinc-950/90 backdrop-blur-md border-zinc-800 text-zinc-100',
      searchCardBg: 'bg-[#121216] border-zinc-800 text-zinc-100',
      accent: 'text-amber-400',
      accentBg: 'bg-amber-500 text-zinc-950 hover:bg-amber-400 font-bold',
      priceColor: 'text-amber-400 font-bold',
      categoryActive: 'bg-amber-500 text-zinc-950 border border-amber-500 shadow-sm font-bold',
      categoryInactive: 'bg-zinc-900 text-zinc-300 border border-zinc-700 hover:border-amber-500/60 hover:bg-zinc-800 shadow-2xs',
      categoryActiveBadge: 'bg-black/20 text-zinc-950',
      categoryInactiveBadge: 'bg-zinc-800 text-zinc-400 border border-zinc-700',
      variantActive: 'bg-amber-500 text-zinc-950 border-amber-500 shadow-xs ring-1 ring-amber-400/50 font-bold',
      variantInactive: 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-amber-400',
      filterActive: 'bg-amber-500 text-zinc-950 border border-amber-500 shadow-sm font-bold',
      filterInactive: 'bg-zinc-900 text-zinc-300 border border-zinc-700 hover:border-amber-500/60 hover:bg-zinc-800 shadow-2xs',
      heroHeaderBg: 'bg-zinc-900/80 border-b border-zinc-800',
      defaultBackdrop: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1600&auto=format&fit=crop&q=80',
    },
    emerald: {
      pageBg: 'bg-[#042119]',
      text: 'text-emerald-50',
      cardBg: 'bg-[#073327] border-emerald-800/80 shadow-2xs',
      headerBg: 'bg-[#021510] text-emerald-100 border-b border-emerald-900',
      headerContainerBg: 'bg-[#021510]/90 backdrop-blur-md border-emerald-900 text-emerald-50',
      searchCardBg: 'bg-[#073327] border-emerald-800 text-emerald-50',
      accent: 'text-emerald-300',
      accentBg: 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300 font-bold',
      priceColor: 'text-emerald-300 font-bold',
      categoryActive: 'bg-emerald-400 text-emerald-950 border border-emerald-400 shadow-sm font-bold',
      categoryInactive: 'bg-[#062c22] text-emerald-200 border border-emerald-700 hover:border-emerald-400 hover:bg-emerald-900/60 shadow-2xs',
      categoryActiveBadge: 'bg-black/20 text-emerald-950',
      categoryInactiveBadge: 'bg-[#031d16] text-emerald-300 border border-emerald-800',
      variantActive: 'bg-emerald-400 text-emerald-950 border-emerald-400 shadow-xs ring-1 ring-emerald-300/50 font-bold',
      variantInactive: 'bg-[#062c22] border-emerald-700 text-emerald-200 hover:border-emerald-400',
      filterActive: 'bg-emerald-400 text-emerald-950 border border-emerald-400 shadow-sm font-bold',
      filterInactive: 'bg-[#062c22] text-emerald-200 border border-emerald-700 hover:border-emerald-400 hover:bg-emerald-900/60 shadow-2xs',
      heroHeaderBg: 'bg-[#031d16]/80 border-b border-emerald-800',
      defaultBackdrop: 'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=1600&auto=format&fit=crop&q=80',
    },
    vibrant: {
      pageBg: 'bg-[#fff8f8]',
      text: 'text-slate-900',
      cardBg: 'bg-white border-rose-200/90 shadow-2xs',
      headerBg: 'bg-rose-600 text-white',
      headerContainerBg: 'bg-rose-950/85 backdrop-blur-md border-rose-800 text-white',
      searchCardBg: 'bg-white border-rose-200/90 text-slate-900',
      accent: 'text-rose-600',
      accentBg: 'bg-rose-600 text-white hover:bg-rose-700',
      priceColor: 'text-rose-600 font-bold',
      categoryActive: 'bg-rose-600 text-white border border-rose-600 shadow-sm font-black',
      categoryInactive: 'bg-white text-rose-900 border-2 border-rose-200 hover:border-rose-400 hover:bg-rose-50/60 shadow-sm',
      categoryActiveBadge: 'bg-white/20 text-white',
      categoryInactiveBadge: 'bg-rose-100 text-rose-700 border border-rose-200',
      variantActive: 'bg-rose-600 text-white border-rose-600 shadow-xs ring-1 ring-rose-400/50',
      variantInactive: 'bg-white border-2 border-rose-200 text-rose-900 hover:border-rose-400',
      filterActive: 'bg-rose-600 text-white border border-rose-600 shadow-sm font-black',
      filterInactive: 'bg-white text-rose-900 border-2 border-rose-200 hover:border-rose-400 hover:bg-rose-50/60 shadow-sm',
      heroHeaderBg: 'bg-rose-50 border-b border-rose-200/60',
      defaultBackdrop: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1600&auto=format&fit=crop&q=80',
    },
    rustic: {
      pageBg: 'bg-[#2b170c]',
      text: 'text-amber-50',
      cardBg: 'bg-[#3d2212] border-[#5a351c] shadow-2xs',
      headerBg: 'bg-[#1e0f06] text-amber-300 border-b border-[#4d2c14]',
      headerContainerBg: 'bg-[#1e0f06]/90 backdrop-blur-md border-[#4d2c14] text-amber-50',
      searchCardBg: 'bg-[#3d2212] border-[#5a351c] text-amber-50',
      accent: 'text-amber-400',
      accentBg: 'bg-amber-600 text-amber-950 hover:bg-amber-500 font-bold',
      priceColor: 'text-amber-400 font-bold',
      categoryActive: 'bg-amber-500 text-amber-950 border border-amber-500 shadow-sm font-bold',
      categoryInactive: 'bg-[#2e190d] text-amber-200 border border-[#6b3e20] hover:border-amber-400 shadow-2xs',
      categoryActiveBadge: 'bg-black/20 text-amber-950',
      categoryInactiveBadge: 'bg-[#221208] text-amber-300 border border-[#523018]',
      variantActive: 'bg-amber-500 text-amber-950 border-amber-500 shadow-xs ring-1 ring-amber-400/50 font-bold',
      variantInactive: 'bg-[#2e190d] border-[#6b3e20] text-amber-200 hover:border-amber-400',
      filterActive: 'bg-amber-500 text-amber-950 border border-amber-500 shadow-sm font-bold',
      filterInactive: 'bg-[#2e190d] text-amber-200 border border-[#6b3e20] hover:border-amber-400 shadow-2xs',
      heroHeaderBg: 'bg-[#241308] border-b border-[#523018]',
      defaultBackdrop: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&auto=format&fit=crop&q=80',
    },
    paper: {
      pageBg: 'bg-[#f5efe6]',
      text: 'text-[#3e2723]',
      cardBg: 'bg-white border-[#d7ccc8] shadow-2xs',
      headerBg: 'bg-[#4e342e] text-[#efebe9]',
      headerContainerBg: 'bg-[#3e2723]/90 backdrop-blur-md border-[#5d4037] text-[#efebe9]',
      searchCardBg: 'bg-white border-[#d7ccc8] text-[#3e2723]',
      accent: 'text-[#5d4037]',
      accentBg: 'bg-[#5d4037] text-white hover:bg-[#4e342e]',
      priceColor: 'text-[#5d4037] font-bold',
      categoryActive: 'bg-[#5d4037] text-white border border-[#5d4037] shadow-sm font-bold',
      categoryInactive: 'bg-white text-[#4e342e] border border-[#bcaaa4] hover:border-[#5d4037] hover:bg-[#efebe9] shadow-2xs',
      categoryActiveBadge: 'bg-white/20 text-white',
      categoryInactiveBadge: 'bg-[#efebe9] text-[#5d4037] border border-[#d7ccc8]',
      variantActive: 'bg-[#5d4037] text-white border-[#5d4037] shadow-xs ring-1 ring-[#8d6e63]/50',
      variantInactive: 'bg-[#f5efe6] border-[#d7ccc8] text-[#4e342e] hover:border-[#5d4037]',
      filterActive: 'bg-[#5d4037] text-white border border-[#5d4037] shadow-sm font-bold',
      filterInactive: 'bg-white text-[#4e342e] border border-[#bcaaa4] hover:border-[#5d4037] hover:bg-[#efebe9] shadow-2xs',
      heroHeaderBg: 'bg-[#efebe9] border-b border-[#d7ccc8]',
      defaultBackdrop: 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=1600&auto=format&fit=crop&q=80',
    },
  };

  const selectedPreset = themeClasses[preset] || themeClasses.minimal;

  return {
    fontClass,
    ...selectedPreset,
    layout,
  };
};
