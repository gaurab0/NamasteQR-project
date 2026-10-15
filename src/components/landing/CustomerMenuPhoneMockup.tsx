import React from 'react';
import {
  Search,
  ShieldCheck,
  ShoppingBag,
  Plus,
  Minus,
  ChefHat,
  Bell,
  Wifi,
  Battery,
  CheckCircle2,
  Clock,
  Users,
  Receipt
} from 'lucide-react';

interface CustomerMenuPhoneMockupProps {
  className?: string;
  variant?: 'hero' | 'grid';
}

export const CustomerMenuPhoneMockup: React.FC<CustomerMenuPhoneMockupProps> = ({
  className = '',
  variant = 'hero',
}) => {
  return (
    <div
      className={`relative select-none ${className}`}
      style={{
        perspective: '1200px',
      }}
    >
      {/* ======================================================== */}
      {/* 1. REALISTIC SMARTPHONE CHASSIS & HARDWARE FRAME        */}
      {/* ======================================================== */}
      <div className="relative w-[300px] sm:w-[325px] md:w-[340px] h-[620px] sm:h-[660px] md:h-[690px] rounded-[50px] sm:rounded-[54px] bg-[#0c0d10] p-[10px] sm:p-[12px] shadow-[0_30px_90px_-15px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.12),inset_0_1px_2px_rgba(255,255,255,0.3)] ring-1 ring-black/80 transition-transform duration-300">
        
        {/* Left Hardware Buttons (Mute switch, Volume Up, Volume Down) */}
        <div className="absolute -left-[3.5px] top-24 w-[3.5px] h-6 bg-[#2d3139] rounded-l-xs border-r border-[#181a1f] shadow-xs" />
        <div className="absolute -left-[3.5px] top-36 w-[3.5px] h-11 bg-[#2d3139] rounded-l-xs border-r border-[#181a1f] shadow-xs" />
        <div className="absolute -left-[3.5px] top-51 w-[3.5px] h-11 bg-[#2d3139] rounded-l-xs border-r border-[#181a1f] shadow-xs" />

        {/* Right Hardware Button (Power / Siri Key) */}
        <div className="absolute -right-[3.5px] top-32 w-[3.5px] h-16 bg-[#2d3139] rounded-r-xs border-l border-[#181a1f] shadow-xs" />

        {/* Inner Phone Display Bezel */}
        <div className="relative w-full h-full rounded-[38px] sm:rounded-[42px] overflow-hidden bg-zinc-950 flex flex-col justify-between border border-white/10 text-left">
          
          {/* Subtle Screen Glass Sheen Overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-white/[0.06] z-40 rounded-[38px] sm:rounded-[42px]" />

          {/* ======================================================== */}
          {/* 2. REALISTIC STATUS BAR & DYNAMIC ISLAND                 */}
          {/* ======================================================== */}
          <div className="h-10 sm:h-11 px-6 pt-1.5 flex items-center justify-between text-white relative z-30 bg-[#121214] shrink-0">
            {/* Left: Clock Time */}
            <span className="text-[11px] sm:text-xs font-semibold tracking-tight text-white/95 font-sans">
              9:41
            </span>

            {/* Center: Dynamic Island */}
            <div className="w-24 sm:w-26 h-[22px] bg-black rounded-full flex items-center justify-between px-2.5 shadow-inner border border-white/10">
              <div className="w-2.5 h-2.5 rounded-full bg-[#111318] border border-[#232733] flex items-center justify-center relative">
                <div className="w-1 h-1 rounded-full bg-blue-900/80" />
              </div>
              <div className="w-1.5 h-1.5 rounded-full bg-[#111318] border border-[#232733]" />
            </div>

            {/* Right: Cellular, Wi-Fi & Battery */}
            <div className="flex items-center gap-1.5 text-white/90">
              <div className="flex items-end gap-[1.5px] h-2.5">
                <div className="w-[2.5px] h-1 bg-white rounded-[0.5px]" />
                <div className="w-[2.5px] h-1.5 bg-white rounded-[0.5px]" />
                <div className="w-[2.5px] h-2 bg-white rounded-[0.5px]" />
                <div className="w-[2.5px] h-2.5 bg-white rounded-[0.5px]" />
              </div>
              <Wifi className="w-3.5 h-3.5 text-white stroke-[2.2]" />
              <Battery className="w-4 h-4 text-white stroke-[2.2]" />
            </div>
          </div>

          {variant === 'hero' ? (
            /* ======================================================== */
            /* VARIANT A: REAL CUSTOMER MENU VIEW (Guest Dining UI)    */
            /* ======================================================== */
            <>
              {/* Sticky Top Bar */}
              <div className="bg-[#18181b] px-3 py-2 flex items-center justify-between border-b border-white/10 z-20 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span className="text-amber-400 font-black text-xs font-mono tracking-wide">
                    Table #4
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-bold text-zinc-300 flex items-center gap-1">
                    <ChefHat className="w-3 h-3 text-amber-400" />
                    <span>Track (1)</span>
                  </div>
                  <div className="px-2 py-0.5 rounded-md bg-rose-500 text-[10px] font-bold text-white flex items-center gap-1 shadow-2xs">
                    <Bell className="w-3 h-3" />
                    <span>Waiter</span>
                  </div>
                  <div className="px-2 py-0.5 rounded-md bg-amber-500 text-[10px] font-black text-zinc-950 flex items-center gap-1 shadow-2xs">
                    <ShoppingBag className="w-3 h-3 text-zinc-950" />
                    <span>Cart (2)</span>
                  </div>
                </div>
              </div>

              {/* Restaurant Hero Card */}
              <div className="relative min-h-[66px] overflow-hidden border-b border-white/10 shrink-0">
                <img
                  src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop&q=80"
                  alt="Restaurant Ambiance"
                  className="absolute inset-0 w-full h-full object-cover scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-black/35" />

                <div className="relative z-10 px-3 py-2 flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex flex-col items-center justify-center text-white font-black shadow-md border border-white/20 shrink-0">
                    <span className="text-sm font-black leading-none">7S</span>
                    <span className="text-[6px] tracking-widest uppercase opacity-90">BISTRO</span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="text-xs font-black text-white truncate drop-shadow-sm">
                        7 Spices Bistro & Bar
                      </h4>
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                        <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                        Live Menu
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-300 truncate mt-0.5">
                      Authentic Himalayan & Continental Dining
                    </p>
                  </div>
                </div>
              </div>

              {/* Search & Dietary Filters */}
              <div className="p-2.5 bg-zinc-900/90 border-b border-white/5 space-y-1.5 shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 w-3 h-3 text-zinc-400" />
                  <input
                    type="text"
                    readOnly
                    value="momos, burgers, drinks..."
                    className="w-full pl-7 pr-2.5 py-1 text-[11px] bg-white/5 border border-white/10 rounded-lg text-zinc-300 font-medium focus:outline-hidden"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-hidden text-[10px] font-bold">
                  <span className="px-2 py-0.5 rounded-md bg-amber-500 text-zinc-950">
                    All (18)
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-zinc-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Pure Veg
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-zinc-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Non-Veg
                  </span>
                </div>
              </div>

              {/* Category Tabs (Horizontal Pills) */}
              <div className="px-2.5 py-1.5 bg-zinc-950 border-b border-white/5 flex items-center gap-1.5 overflow-x-hidden text-[10px] font-bold shrink-0">
                <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-amber-400 border border-amber-400/30 whitespace-nowrap">
                  🔥 Best Sellers (6)
                </span>
                <span className="px-2 py-1 rounded-lg bg-zinc-900 text-zinc-400 whitespace-nowrap">
                  🥟 Momos & Starters
                </span>
                <span className="px-2 py-1 rounded-lg bg-zinc-900 text-zinc-400 whitespace-nowrap">
                  🍔 Burgers
                </span>
              </div>

              {/* Real Food Items List */}
              <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-2 bg-zinc-950 scrollbar-none">
                {/* Dish 1: Himalayan Steamed Chicken Momo */}
                <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex gap-2.5 shadow-2xs">
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                    <img
                      src="https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=400&auto=format&fit=crop&q=80"
                      alt="Himalayan Momo"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 left-1 w-3 h-3 rounded-[2px] border border-rose-600 bg-white flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white truncate">
                          Himalayan Steamed Momo
                        </span>
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                          ★ Best Seller
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                        Fresh minced chicken with spicy timur chutney
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-zinc-800/80">
                      <span className="font-mono font-bold text-xs text-amber-400">
                        Rs. 280
                      </span>
                      <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-lg bg-amber-500 text-zinc-950 text-xs font-black shadow-2xs">
                        <Minus className="w-3 h-3 stroke-[3]" />
                        <span className="text-[11px] px-1 font-mono">2</span>
                        <Plus className="w-3 h-3 stroke-[3]" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dish 2: Tandoori Paneer Tikka */}
                <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex gap-2.5 shadow-2xs">
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                    <img
                      src="https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400&auto=format&fit=crop&q=80"
                      alt="Paneer Tikka"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 left-1 w-3 h-3 rounded-[2px] border border-emerald-600 bg-white flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white truncate">
                          Tandoori Paneer Tikka
                        </span>
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                          ★ Chef Special
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                        Marinated cottage cheese roasted in clay oven
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-zinc-800/80">
                      <span className="font-mono font-bold text-xs text-amber-400">
                        Rs. 420
                      </span>
                      <button
                        type="button"
                        className="px-2.5 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 text-[10px] font-bold flex items-center gap-1 shadow-2xs"
                      >
                        <Plus className="w-3 h-3 text-amber-400" /> Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Dish 3: Classic Double Smash Burger */}
                <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex gap-2.5 shadow-2xs">
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                    <img
                      src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&auto=format&fit=crop&q=80"
                      alt="Smash Burger"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 left-1 w-3 h-3 rounded-[2px] border border-rose-600 bg-white flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white truncate">
                          Double Smash Burger
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                        Double chicken smash patty, cheddar, brioche
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-zinc-800/80">
                      <span className="font-mono font-bold text-xs text-amber-400">
                        Rs. 480
                      </span>
                      <button
                        type="button"
                        className="px-2.5 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 text-[10px] font-bold flex items-center gap-1 shadow-2xs"
                      >
                        <Plus className="w-3 h-3 text-amber-400" /> Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Dish 4: Blueberry Mint Mojito */}
                <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex gap-2.5 shadow-2xs">
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                    <img
                      src="https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400&auto=format&fit=crop&q=80"
                      alt="Mojito"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 left-1 w-3 h-3 rounded-[2px] border border-emerald-600 bg-white flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white truncate">
                          Blueberry Mint Mojito
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                        Crushed garden mint, blueberries & sparkling soda
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-zinc-800/80">
                      <span className="font-mono font-bold text-xs text-amber-400">
                        Rs. 240
                      </span>
                      <button
                        type="button"
                        className="px-2.5 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 text-[10px] font-bold flex items-center gap-1 shadow-2xs"
                      >
                        <Plus className="w-3 h-3 text-amber-400" /> Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Bottom Cart Bar */}
              <div className="p-2.5 bg-gradient-to-t from-black via-zinc-950 to-transparent shrink-0">
                <div className="p-2.5 rounded-xl bg-zinc-900/95 border border-white/15 text-white flex items-center justify-between text-xs font-bold shadow-2xl backdrop-blur-md">
                  <div className="flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px] font-bold">2 Items • Rs. 560</span>
                  </div>
                  <span className="text-amber-400 font-extrabold text-[11px] flex items-center gap-1">
                    View Table Cart →
                  </span>
                </div>

                {/* Bottom Home Indicator */}
                <div className="w-28 h-1 bg-zinc-600/80 rounded-full mx-auto mt-2.5" />
              </div>
            </>
          ) : (
            /* ======================================================== */
            /* VARIANT B: REAL COLLABORATIVE SESSION & KDS TICKET VIEW  */
            /* ======================================================== */
            <>
              {/* Header: Table Session Bar */}
              <div className="bg-[#18181b] px-3.5 py-2.5 flex items-center justify-between border-b border-white/10 z-20 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                  <div>
                    <div className="text-amber-400 font-black text-xs font-mono">
                      Table #4 • In Service
                    </div>
                    <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                      <Users className="w-2.5 h-2.5 text-blue-400" /> 3 Guests Connected
                    </div>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/40">
                  Shared Ticket
                </span>
              </div>

              {/* Collaborative Activity Stream */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-zinc-950 scrollbar-none text-xs">
                {/* Active Kitchen Ticket Card */}
                <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5 shadow-md">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <div className="flex items-center gap-1.5">
                      <ChefHat className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-extrabold text-white">Kitchen Ticket #104</span>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400">
                      <Clock className="w-3 h-3" /> 5m elapsed
                    </span>
                  </div>

                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-800/60">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-zinc-200 font-medium">2x Steamed Chicken Momo</span>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Ready
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-800/60">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-spin" />
                        <span className="text-zinc-200 font-medium">1x Double Smash Burger</span>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Grilling
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-800/60">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-zinc-200 font-medium">2x Blueberry Mint Mojito</span>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Served
                      </span>
                    </div>
                  </div>
                </div>

                {/* Real-Time Table Bill Summary */}
                <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                    <span>Items Subtotal (4 items)</span>
                    <span className="font-mono text-zinc-200 font-semibold">Rs. 1,520.00</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                    <span>VAT (13% Inclusive)</span>
                    <span className="font-mono text-zinc-200 font-semibold">Rs. 174.87</span>
                  </div>
                  <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-sm font-black text-white">
                    <span>Table Balance</span>
                    <span className="text-amber-400 font-mono">Rs. 1,520.00</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-center text-[11px] font-bold flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>All devices synced via WebSockets</span>
                </div>
              </div>

              {/* Bottom Action Footer */}
              <div className="p-2.5 bg-gradient-to-t from-black via-zinc-950 to-transparent shrink-0">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 py-2 px-3 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg"
                  >
                    <Plus className="w-3.5 h-3.5" /> Order More
                  </button>
                  <button
                    type="button"
                    className="py-2 px-3 rounded-xl bg-zinc-800 text-zinc-200 border border-zinc-700 font-bold text-xs flex items-center justify-center gap-1.5"
                  >
                    <Receipt className="w-3.5 h-3.5 text-amber-400" /> Request Bill
                  </button>
                </div>

                {/* Bottom Home Indicator */}
                <div className="w-28 h-1 bg-zinc-600/80 rounded-full mx-auto mt-2.5" />
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
};
