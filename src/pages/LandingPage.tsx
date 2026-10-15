import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { 
  QrCode, 
  ChefHat, 
  UtensilsCrossed, 
  ArrowRight, 
  CheckCircle2, 
  ShieldCheck, 
  Smartphone, 
  Receipt, 
  FileSpreadsheet, 
  Users, 
  Sparkles, 
  Clock, 
  CreditCard, 
  TrendingUp, 
  HelpCircle, 
  ChevronDown, 
  Mail, 
  Hotel, 
  Coffee, 
  Wine, 
  Store, 
  Laptop,
  Check,
  Zap,
  Printer,
  ShoppingBag,
  Bell,
  MessageCircleQuestion,
  Calendar
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Footer } from '../components/layout/Footer';
import { CustomerMenuPhoneMockup } from '../components/landing/CustomerMenuPhoneMockup';
import { BookDemoModal } from '../components/landing/BookDemoModal';
import { HeroShaderGradient } from '../components/landing/HeroShaderGradient';

interface LandingPageProps {
  onNavigate: (route: string) => void;
  onBookDemo?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, onBookDemo }) => {
  const { isAuthenticated, user } = useAuth();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<number>(0);
  const [internalDemoModalOpen, setInternalDemoModalOpen] = useState(false);

  const handleOpenDemo = () => {
    if (onBookDemo) {
      onBookDemo();
    } else {
      setInternalDemoModalOpen(true);
    }
  };

  const toggleFaq = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  };

  const workflowSteps = [
    {
      step: '01',
      title: 'Generate & Place Table QRs',
      shortDesc: 'Print branded, waterproof tent cards or sticker tags with unique table IDs in seconds.',
      badge: 'Step 1: Setup',
      preview: {
        headline: 'Instant Table QR Generator',
        badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
        content: (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-zinc-200 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  T4
                </div>
                <div>
                  <div className="text-sm font-bold text-zinc-900">Table 4 — Balcony</div>
                  <div className="text-xs text-zinc-500">Capacity: 4 Guests • Zone A</div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                Active QR
              </span>
            </div>
            <div className="p-4 rounded-xl bg-zinc-50 border border-dashed border-zinc-300 text-center space-y-2">
              <div className="w-20 h-20 mx-auto rounded-lg bg-white p-2 border border-zinc-200 shadow-2xs flex items-center justify-center">
                <QrCode className="w-16 h-16 text-zinc-800" />
              </div>
              <div className="text-xs font-bold text-zinc-800">Scan to Order • Table 4</div>
              <p className="text-[11px] text-zinc-500">Direct camera scan with instant live menu routing</p>
            </div>
          </div>
        ),
      },
    },
    {
      step: '02',
      title: 'Guests Scan & Order Together',
      shortDesc: 'No app download. Diners view rich photos, dietary tags, and collaborate on a shared cart.',
      badge: 'Step 2: Dining',
      preview: {
        headline: 'Interactive Mobile Digital Menu',
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
        content: (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
              <span className="text-xs font-bold text-zinc-500 uppercase">Shared Table Cart</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                2 Diners Connected
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-zinc-200 shadow-2xs">
                <div>
                  <div className="text-xs font-bold text-zinc-900">2x Himalayan Chicken Momo</div>
                  <div className="text-[11px] text-zinc-500">Steamed • Spicy Sauce</div>
                </div>
                <span className="text-xs font-bold text-zinc-900">Rs. 640</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-zinc-200 shadow-2xs">
                <div>
                  <div className="text-xs font-bold text-zinc-900">1x Virgin Mojito Pitcher</div>
                  <div className="text-[11px] text-zinc-500">Extra mint • Less ice</div>
                </div>
                <span className="text-xs font-bold text-zinc-900">Rs. 420</span>
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-600 text-white flex items-center justify-between text-xs font-bold shadow-md">
              <span>Send Order to Kitchen</span>
              <span>Rs. 1,060 →</span>
            </div>
          </div>
        ),
      },
    },
    {
      step: '03',
      title: 'Live Kitchen Display (KDS)',
      shortDesc: 'Chefs and baristas receive tickets instantly with visual color-coded preparation timers.',
      badge: 'Step 3: Cooking',
      preview: {
        headline: 'Real-Time Kitchen Ticket Hub',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        content: (
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold text-amber-900">Ticket #104 • Table 4</span>
                <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700">
                  <Clock className="w-3.5 h-3.5" /> 4m elapsed
                </span>
              </div>
              <div className="text-xs font-medium text-zinc-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span>• 2x Himalayan Chicken Momo</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 font-bold text-amber-900">Prep</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>• 1x Virgin Mojito</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-200 font-bold text-emerald-900">Ready</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="flex-1 py-1.5 text-center text-xs font-bold rounded-lg bg-emerald-600 text-white shadow-2xs">
                Mark Ready
              </button>
              <button type="button" className="px-3 py-1.5 text-center text-xs font-bold rounded-lg bg-zinc-200 text-zinc-700">
                Print Chit
              </button>
            </div>
          </div>
        ),
      },
    },
    {
      step: '04',
      title: 'Instant POS & Bill Settlement',
      shortDesc: 'Calculate inclusive/exclusive VAT, apply discounts, accept cash or QR, and print tax receipts.',
      badge: 'Step 4: Billing',
      preview: {
        headline: 'Fast Cashier & Receipt Engine',
        badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
        content: (
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-white border border-zinc-200 shadow-2xs space-y-2">
              <div className="flex justify-between text-xs text-zinc-600">
                <span>Subtotal (Net)</span>
                <span className="font-semibold text-zinc-900">Rs. 1,060.00</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-600">
                <span>VAT (13% Inclusive)</span>
                <span className="font-semibold text-zinc-900">Rs. 121.95</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-600">
                <span>Service Charge (0%)</span>
                <span className="font-semibold text-zinc-900">Rs. 0.00</span>
              </div>
              <div className="pt-2 border-t border-zinc-200 flex justify-between text-sm font-extrabold text-zinc-900">
                <span>Grand Total</span>
                <span className="text-blue-600">Rs. 1,060.00</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="flex-1 py-2 text-center text-xs font-bold rounded-lg bg-emerald-600 text-white shadow-2xs flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Settle & Conclude
              </button>
              <button type="button" className="p-2 rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-700 hover:bg-zinc-200">
                <Printer className="w-4 h-4" />
              </button>
            </div>
          </div>
        ),
      },
    },
  ];

  const venueTypes = [
    { icon: <ChefHat className="w-5 h-5 text-blue-600" />, label: 'Fine Dining & Bistros' },
    { icon: <Coffee className="w-5 h-5 text-amber-600" />, label: 'Artisan Cafés & Bakeries' },
    { icon: <Hotel className="w-5 h-5 text-emerald-600" />, label: 'Hotels & Resort Dining' },
    { icon: <Wine className="w-5 h-5 text-purple-600" />, label: 'Rooftops, Pubs & Bars' },
    { icon: <Store className="w-5 h-5 text-rose-600" />, label: 'Food Courts & Multi-Outlet' },
  ];

  const faqs = [
    {
      q: 'Do customers need to download an app to order from their phones?',
      a: 'Never. Customers simply open their standard phone camera (iOS or Android) and scan the QR code at their table. The full dynamic menu opens instantly in mobile Safari or Chrome with zero downloads and zero app store friction.',
    },
    {
      q: 'Can multiple people at the same table order together?',
      a: 'Yes! NamasteQR features real-time collaborative table sessions. All guests dining at Table 4 can view the menu simultaneously, add their favorite dishes to the shared table cart, and submit orders together or in rounds.',
    },
    {
      q: 'Do I need expensive or proprietary POS hardware?',
      a: 'Not at all. NamasteQR runs in any modern web browser on laptops, iPads, Android tablets, or smartphones you already own. You can also connect standard thermal ESC/POS receipt and kitchen printers over LAN or USB.',
    },
    {
      q: 'How does the Kitchen Display System (KDS) work?',
      a: 'Place any tablet, monitor, or laptop in your kitchen or barista station. As soon as a guest or waiter submits an order, it appears on the screen in real-time with acoustic chimes, order timers, item notes, and one-click status updates.',
    },
    {
      q: 'Does NamasteQR support VAT, service charges, and Excel exports?',
      a: 'Yes. You can switch between VAT-inclusive and VAT-exclusive tax modes, apply custom service charges, offer table discounts, and export complete audit-ready Sales Registers and General Ledger summaries to Microsoft Excel with a single click.',
    },
    {
      q: 'How long does it take to get started?',
      a: 'You can create your account, configure your venue branding, build your digital menu, and print your first set of table QR cards in under 5 minutes.',
    },
  ];

  return (
    <div className="min-h-screen bg-transparent text-zinc-900 selection:bg-blue-100 selection:text-blue-900 relative">
      {/* Full-page fixed 3D moving shader gradient canvas (sits behind all content; physically concealed by sticky header navbar z-40 and footer z-20) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <HeroShaderGradient />
      </div>

      {/* ======================================================== */}
      {/* 1. HERO SECTION (Inspired by Shelf's Layered Hero Canvas) */}
      {/* ======================================================== */}
      <section className="relative z-10 overflow-hidden pt-8 pb-14 sm:pt-10 sm:pb-20 border-b border-zinc-200/80 bg-gradient-to-b from-blue-50/20 via-white/30 to-zinc-50/20 backdrop-blur-xs">
        {/* Subtle background tech grid */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.035] z-1"
          style={{
            backgroundImage: `radial-gradient(#1e3a8a 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          {/* Eyebrow Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-[11px] sm:text-xs font-semibold mb-3.5 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Smart Hospitality OS & Contactless Dining Infrastructure</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-4xl lg:text-[46px] font-extrabold tracking-tight text-zinc-900 max-w-3xl mx-auto leading-[1.12]">
            Transform Dining with <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700">
              Smart QR Menus & Real-Time POS
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mt-3 sm:mt-3.5 text-xs sm:text-sm lg:text-[15px] text-zinc-700 font-medium max-w-xl mx-auto leading-relaxed">
            Replace paper menus, slow order taking, and clunky hardware. Contactless table ordering, live kitchen display (KDS), split billing, and multi-venue management in one unified cloud system.
          </p>

          {/* Dual Action Buttons (Guaranteed working navigation) */}
          <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            {isAuthenticated && user ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => onNavigate('/dashboard')}
                rightIcon={<ArrowRight className="w-4 h-4" />}
                className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-bold shadow-md bg-blue-600 hover:bg-blue-700"
              >
                Go to Dashboard ({user.business?.name || 'Venue'})
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => onNavigate('/signup')}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                  className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-bold shadow-md bg-blue-600 hover:bg-blue-700"
                >
                  Create Business Account
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => onNavigate('/login')}
                  className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-bold bg-white hover:bg-zinc-100 border-zinc-300"
                >
                  Sign In to Portal
                </Button>
              </>
            )}
          </div>

          {/* Trust Highlights - Frosted glass pill badges for crystal-clear readability against gradient */}
          <div className="mt-4 sm:mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 text-xs font-semibold">
            {[
              'No App Download for Guests',
              'Instant Setup in 5 Minutes',
              'Any Tablet, Phone or PC',
              'Zero Hardware Lock-In',
            ].map((item, idx) => (
              <div
                key={idx}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-zinc-200/90 text-zinc-900 font-bold shadow-2xs whitespace-nowrap select-none"
              >
                <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>

          {/* ======================================================== */}
          {/* HERO PRODUCT MOCKUP COMPOSITION (Shelf-inspired visual)   */}
          {/* ======================================================== */}
          <div className="mt-7 sm:mt-9 relative max-w-5xl mx-auto">
            {/* Ambient Back Glow */}
            <div className="absolute -inset-1.5 bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-amber-500/10 rounded-3xl blur-2xl opacity-70 -z-10" />

            {/* Desktop / Tablet Dashboard Frame */}
            <div className="rounded-2xl sm:rounded-3xl border border-zinc-200/90 bg-white shadow-2xl overflow-hidden p-2 sm:p-3.5 backdrop-blur-md">
              {/* Window Controls */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 bg-zinc-50/70 rounded-t-xl mb-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <div className="px-3 py-0.5 rounded-md bg-white border border-zinc-200 text-[11px] font-mono text-zinc-500 truncate max-w-xs sm:max-w-md">
                  https://portal.namasteqr.com/dashboard/tables
                </div>
                <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live System
                </div>
              </div>

              {/* Inside Dashboard Preview Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-2 sm:p-4 text-left bg-zinc-50/40 rounded-xl">
                {/* Left Metrics & Table Layout */}
                <div className="md:col-span-7 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white rounded-xl border border-zinc-200 shadow-2xs">
                    <div>
                      <div className="text-xs text-zinc-500 font-semibold">NamasteQR Main Dining Room</div>
                      <div className="text-base font-extrabold text-zinc-900">Floor 1 • 14 Active Tables</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                        Orders Synced
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                        KDS Connected
                      </span>
                    </div>
                  </div>

                  {/* Visual Table Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                      <div className="text-xs font-bold text-emerald-900">Table 1</div>
                      <div className="text-[10px] font-semibold text-emerald-700 mt-0.5">Dining (3 Guests)</div>
                      <div className="mt-2 text-xs font-extrabold text-emerald-900">Rs. 2,150</div>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-center">
                      <div className="text-xs font-bold text-amber-900">Table 2</div>
                      <div className="text-[10px] font-semibold text-amber-700 mt-0.5">Kitchen Prep</div>
                      <div className="mt-2 text-xs font-extrabold text-amber-900">Rs. 1,480</div>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-center">
                      <div className="text-xs font-bold text-blue-900">Table 4</div>
                      <div className="text-[10px] font-semibold text-blue-700 mt-0.5">QR Scanned</div>
                      <div className="mt-2 text-xs font-extrabold text-blue-900">Rs. 860</div>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-100 border border-zinc-200 text-center text-zinc-500">
                      <div className="text-xs font-bold text-zinc-700">Table 5</div>
                      <div className="text-[10px] font-medium text-zinc-500 mt-0.5">Available</div>
                      <div className="mt-2 text-xs font-medium text-zinc-400">Ready</div>
                    </div>
                  </div>

                  {/* Recent Live Ticket Snippet */}
                  <div className="p-3 bg-white rounded-xl border border-zinc-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-zinc-700">
                      <span>Live KDS Stream</span>
                      <span className="text-blue-600 text-[11px]">Auto-Refreshing (WebSockets)</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 border border-zinc-100 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="font-bold text-zinc-900">Order #104</span>
                        <span className="text-zinc-500">• Table 2</span>
                        <span className="text-zinc-700 font-medium">Chicken Tikka, Garlic Naan (x2)</span>
                      </div>
                      <span className="text-[11px] font-semibold text-amber-700">Cooking (6m)</span>
                    </div>
                  </div>
                </div>

                {/* Right Quick POS Register Preview - Shifted More Left */}
                <div className="md:col-span-5 p-3.5 bg-white rounded-xl border border-zinc-200 shadow-2xs space-y-3 max-w-[310px] transform -translate-x-3 md:-translate-x-6 lg:-translate-x-10 xl:-translate-x-14">
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                    <span className="text-xs font-bold text-zinc-900">Quick POS Register</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">
                      Cashier Mode
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-zinc-600">
                      <span>Today's Total Sales</span>
                      <span className="font-bold text-zinc-900">Rs. 48,250</span>
                    </div>
                    <div className="flex justify-between text-zinc-600">
                      <span>Completed Invoices</span>
                      <span className="font-bold text-zinc-900">38 Bills</span>
                    </div>
                    <div className="flex justify-between text-zinc-600">
                      <span>Avg Turnover Time</span>
                      <span className="font-bold text-emerald-600">32 mins</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-zinc-100 space-y-2">
                    <div className="text-[11px] font-bold text-zinc-500 uppercase">One-Click Exports</div>
                    <div className="flex items-center gap-1.5">
                      <span className="flex-1 py-1.5 px-2 rounded-lg bg-zinc-50 border border-zinc-200 text-[11px] font-semibold text-zinc-700 text-center flex items-center justify-center gap-1">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Excel GL
                      </span>
                      <span className="flex-1 py-1.5 px-2 rounded-lg bg-zinc-50 border border-zinc-200 text-[11px] font-semibold text-zinc-700 text-center flex items-center justify-center gap-1">
                        <Printer className="w-3.5 h-3.5 text-zinc-600" /> ESC/POS
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Overlapping Realistic Smartphone (Front Layer) - Desktop & Tablet */}
            <div className="hidden lg:block absolute -bottom-10 -right-20 lg:-right-28 xl:-right-38 2xl:-right-46 -translate-x-3 z-30 transform-gpu rotate-[5deg] origin-bottom-right hover:rotate-[3deg] transition-all duration-300 [backface-visibility:hidden] [transform:rotate(5deg)_translateZ(0)]">
              {/* Minimalist Professional "Book a Demo" with Diagonal Alignment */}
              <div className="absolute -top-11 left-1/2 -translate-x-1/2 z-40 whitespace-nowrap">
                <button
                  type="button"
                  onClick={handleOpenDemo}
                  className="group inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-900/95 hover:bg-black text-white border border-zinc-700/80 hover:border-amber-400 shadow-2xl backdrop-blur-md text-xs font-bold tracking-tight transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer select-none"
                >
                  <Calendar className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-12 transition-transform" />
                  <span>Book a Demo</span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              <CustomerMenuPhoneMockup variant="hero" />
            </div>

            {/* Floating QR Tag Badge (Left) - Exactly where it was before */}
            <div className="hidden md:flex items-center gap-3 p-3 rounded-2xl bg-white/95 backdrop-blur-md border border-zinc-200/90 shadow-xl absolute -top-6 -left-6 z-20 text-left select-none">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center p-1.5 shrink-0">
                <QrCode className="w-full h-full text-blue-700" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-zinc-900">Table Tent Card #12</div>
                <div className="text-[11px] text-zinc-500">Scanned via Camera • 0 Apps</div>
                <div className="text-[10px] font-bold text-emerald-600 mt-0.5">● Connected Live</div>
              </div>
            </div>
          </div>

          {/* Centered Realistic Smartphone for Mobile & Tablet screens (< lg) */}
          <div className="mt-10 flex flex-col items-center justify-center lg:hidden relative z-20">
            <button
              type="button"
              onClick={handleOpenDemo}
              className="mb-3.5 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 hover:bg-black text-white border border-zinc-700/80 text-xs font-bold shadow-md transition-all duration-200 cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Book a Demo</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
            </button>
            <CustomerMenuPhoneMockup variant="hero" />
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 2. PHILOSOPHY / VALUE PROPOSITION STATEMENT (Shelf-style) */}
      {/* ======================================================== */}
      <section className="relative z-10 py-12 bg-white/40 backdrop-blur-xs border-b border-zinc-200/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-base sm:text-lg font-medium text-zinc-700 leading-relaxed">
            Why modernize your venue with <span className="font-bold text-zinc-900">NamasteQR</span>? 
            Because guests order <span className="text-blue-600 font-bold">20% more</span> when menus are visual, kitchens prepare <span className="text-emerald-600 font-bold">30% faster</span> with real-time tickets, and tables turn over <span className="text-amber-600 font-bold">35% quicker</span>.
          </p>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 3. SYMMETRICAL 6-FEATURE GRID WITH CENTER PHONE MOCKUP   */}
      {/*    (Directly inspired by Shelf Tile 2 & Tile 3 layout)   */}
      {/* ======================================================== */}
      <section className="relative z-10 py-20 sm:py-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
            Built for Hospitality
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900">
            Powerful restaurant operations, without the bulky hardware.
          </h2>
          <p className="mt-3 text-base text-zinc-600">
            Give your staff, kitchen chefs, and dining guests modern digital tools that work smoothly from any web browser.
          </p>
        </div>

        {/* 3-Column Layout: Left Features | Center Device | Right Features */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column (3 Features) */}
          <div className="lg:col-span-4 space-y-8 text-left">
            {/* Feature 1 */}
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-blue-100/70 text-blue-700 flex items-center justify-center shadow-2xs">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900">Instant Dynamic QR Menus</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Guests scan and browse full visual menus with food photos, dietary tags, and spice levels without installing any mobile app.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-100/70 text-amber-700 flex items-center justify-center shadow-2xs">
                <ChefHat className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900">Real-Time Kitchen Display (KDS)</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Replace noisy thermal chits with live kitchen screens. Tickets route directly to chefs with color-coded preparation timers.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shadow-2xs">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900">Multi-Guest Shared Cart</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Friends dining together at Table 6 can all add items simultaneously from their own phones into one unified table ticket.
              </p>
            </div>
          </div>

          {/* Center Column: Realistic Smartphone Mockup Frame */}
          <div className="lg:col-span-4 flex justify-center py-4">
            <CustomerMenuPhoneMockup variant="grid" className="transform hover:scale-[1.01] transition-transform" />
          </div>

          {/* Right Column (3 Features) */}
          <div className="lg:col-span-4 space-y-8 text-left">
            {/* Feature 4 */}
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-purple-100/70 text-purple-700 flex items-center justify-center shadow-2xs">
                <Receipt className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900">Smart Billing & Inclusive VAT</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Full VAT calculation (inclusive and exclusive modes), custom discounts, split billing, and thermal printer receipt engine.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100/70 text-indigo-700 flex items-center justify-center shadow-2xs">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900">Role-Based Team Control</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Dedicated views and permission barriers for Owners, Managers, Cashiers, Waiters, and Kitchen staff with fast PIN/user switching.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-rose-100/70 text-rose-700 flex items-center justify-center shadow-2xs">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900">Automated Excel GL Register</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Export audit-ready General Ledger sales registers, daily tax books, and multi-venue analytics straight into clean Excel files.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 4. INTERACTIVE 4-STEP WORKFLOW SHOWCASE                  */}
      {/*    (Inspired by Shelf's Tabbed Feature Section)          */}
      {/* ======================================================== */}
      <section className="relative z-10 py-20 bg-white/40 backdrop-blur-xs border-y border-zinc-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              Frictionless Workflow
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900">
              Scan, Order, Cook, and Settle in Four Simple Steps
            </h2>
            <p className="mt-3 text-base text-zinc-600">
              See how NamasteQR connects front-of-house hospitality with back-of-house kitchen efficiency.
            </p>
          </div>

          {/* Interactive Step Card Container */}
          <div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-md border border-zinc-200/90 rounded-3xl p-6 sm:p-10 shadow-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              {/* Left: Step Description */}
              <div className="space-y-4 text-left">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${workflowSteps[activeWorkflowTab].preview.badgeColor}`}>
                  {workflowSteps[activeWorkflowTab].badge}
                </span>
                <h3 className="text-2xl font-extrabold text-zinc-900">
                  {workflowSteps[activeWorkflowTab].title}
                </h3>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  {workflowSteps[activeWorkflowTab].shortDesc}
                </p>
                <div className="pt-2 flex items-center gap-2 text-xs font-bold text-blue-600">
                  <span>Explore this workflow step</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Right: Step Interactive Preview */}
              <div className="p-4 rounded-2xl bg-white border border-zinc-200/80 shadow-md">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
                  {workflowSteps[activeWorkflowTab].preview.headline}
                </div>
                {workflowSteps[activeWorkflowTab].preview.content}
              </div>
            </div>

            {/* Bottom 4 Tabs Navigation */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-8 pt-6 border-t border-zinc-200">
              {workflowSteps.map((ws, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveWorkflowTab(i)}
                  className={`p-3 rounded-xl text-left transition-all cursor-pointer ${
                    activeWorkflowTab === i
                      ? 'bg-white border-2 border-blue-600 shadow-sm'
                      : 'bg-zinc-100/70 border border-transparent hover:bg-white text-zinc-600'
                  }`}
                >
                  <div className={`text-xs font-extrabold ${activeWorkflowTab === i ? 'text-blue-600' : 'text-zinc-500'}`}>
                    Step {ws.step}
                  </div>
                  <div className="text-xs font-bold text-zinc-900 truncate mt-0.5">
                    {ws.title}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 5. VENUE AUDIENCES                                       */}
      {/* ======================================================== */}
      <section className="relative z-10 py-16 bg-white/40 backdrop-blur-xs border-b border-zinc-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
            Engineered For Modern Hospitality Properties
          </span>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {venueTypes.map((v, i) => (
              <div
                key={i}
                className="flex flex-col items-center justify-center p-5 rounded-2xl bg-white/90 backdrop-blur-sm border border-zinc-200 text-center hover:border-blue-400 hover:shadow-xs transition-all"
              >
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100 mb-2.5">
                  {v.icon}
                </div>
                <span className="text-xs font-bold text-zinc-800">{v.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 6. CONVERSION / VALUE CALLOUT (Shelf-inspired Card)       */}
      {/* ======================================================== */}
      <section className="relative z-10 py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-r from-zinc-900 via-zinc-900 to-blue-950 text-white p-8 sm:p-14 shadow-2xl border border-zinc-800">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Content */}
            <div className="lg:col-span-8 space-y-4 text-left">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold border border-blue-400/30">
                <Zap className="w-3.5 h-3.5 text-blue-400" /> Instant Activation
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
                Ready to elevate your guest experience with NamasteQR?
              </h2>
              <p className="text-sm sm:text-base text-zinc-300 max-w-xl leading-relaxed">
                Join restaurants, cafés, and hotels taking contactless orders, boosting turnover, and streamlining kitchen operations. Zero setup fees or credit cards needed.
              </p>
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => onNavigate('/signup')}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                  className="w-full sm:w-auto px-6 py-3 font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                >
                  Create Free Account
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => onNavigate('/login')}
                  className="w-full sm:w-auto px-6 py-3 font-bold text-white border-zinc-700 hover:bg-zinc-800"
                >
                  Sign In to Venue
                </Button>
              </div>
            </div>

            {/* Right Graphic Stats Card */}
            <div className="lg:col-span-4 bg-zinc-800/80 rounded-2xl p-6 border border-zinc-700 space-y-4 text-left">
              <div className="space-y-1">
                <div className="text-2xl font-black text-amber-400">+35%</div>
                <div className="text-xs font-semibold text-zinc-300">Faster Table Turnover</div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-black text-emerald-400">0%</div>
                <div className="text-xs font-semibold text-zinc-300">Order Miscommunication</div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-black text-blue-400">&lt; 5 Mins</div>
                <div className="text-xs font-semibold text-zinc-300">Fast Setup & Menu Launch</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 7. ACCORDION FAQ SECTION (Shelf Tile 5 Inspiration)      */}
      {/* ======================================================== */}
      <section className="relative z-10 py-20 bg-white/40 backdrop-blur-xs border-t border-zinc-200/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Centered Question Badge */}
          <div className="text-center mb-12">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 shadow-2xs border border-blue-100">
              <MessageCircleQuestion className="w-6 h-6" />
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900">
              Frequently asked questions
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Everything you need to know about setting up and running NamasteQR.
            </p>
          </div>

          {/* Accordion List */}
          <div className="space-y-3 text-left">
            {faqs.map((faq, i) => {
              const isOpen = openFaqIndex === i;
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-zinc-200 bg-white/80 backdrop-blur-sm overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(i)}
                    className="w-full p-5 flex items-center justify-between text-left font-bold text-zinc-900 hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    <span className="text-sm sm:text-base pr-4">{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-blue-600' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-sm text-zinc-600 leading-relaxed border-t border-zinc-100 bg-white">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 8. PRE-FOOTER "STILL HAVE QUESTIONS?" BOX (Shelf Tile 6) */}
      {/* ======================================================== */}
      <section className="relative z-10 py-16 bg-white/40 backdrop-blur-xs border-t border-zinc-200/80">
        <div className="max-w-2xl mx-auto px-4 text-center space-y-4">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mx-auto">
            <Mail className="w-5 h-5" />
          </div>
          <h3 className="text-xl font-extrabold text-zinc-900">Still have questions?</h3>
          <p className="text-sm text-zinc-600">
            Can't find the answer you are looking for? Book a 1-on-1 personalized live demo or reach out to our solutions team directly.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleOpenDemo}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 font-bold text-xs sm:text-sm text-white transition-colors shadow-2xs cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              <span>Book a Live Demo</span>
            </button>
            <a
              href="mailto:info@namasteqr.com"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-zinc-300 font-bold text-xs sm:text-sm text-zinc-800 hover:bg-zinc-100 transition-colors shadow-2xs"
            >
              <Mail className="w-4 h-4 text-zinc-500" />
              <span>Contact Team (info@namasteqr.com)</span>
            </a>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 9. COMPLETE GLOBAL FOOTER                                 */}
      {/* ======================================================== */}
      <Footer onNavigate={onNavigate} onBookDemo={handleOpenDemo} />

      {/* Demo Booking Dialog Modal */}
      <BookDemoModal
        isOpen={internalDemoModalOpen}
        onClose={() => setInternalDemoModalOpen(false)}
      />

    </div>
  );
};
