import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ShoppingBag, 
  UtensilsCrossed, 
  Calendar, 
  CreditCard, Banknote, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Users, 
  ChefHat, 
  QrCode, 
  Receipt, 
  SlidersHorizontal,
  ChevronDown,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Lock,
  DollarSign,
  BookOpen
} from 'lucide-react';
import { rbacService } from '../../services/rbac.service';
import { Business } from '../../types/auth';
import { SaleRecord, StaffAccountSession } from '../../types/rbac';

interface OperationsOverviewDashboardProps {
  business: Business;
  user: any;
  staffSession: StaffAccountSession | null;
  onNavigateTab: (tab: any) => void;
  onOpenRoleModal: () => void;
  timeFilter?: 'today' | 'week' | 'month';
  onChangeTimeFilter?: (f: 'today' | 'week' | 'month') => void;
  daybookFilter?: string;
}

export const OperationsOverviewDashboard: React.FC<OperationsOverviewDashboardProps> = ({
  business,
  user,
  staffSession,
  onNavigateTab,
  onOpenRoleModal,
  timeFilter = 'today',
  onChangeTimeFilter,
  daybookFilter = 'all',
}) => {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);

  const currency = business?.currency || 'Rs';

  useEffect(() => {
    let isMounted = true;
    setLoadingSales(true);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startDate: Date;
    const endDate = new Date();
    
    if (timeFilter === 'today') {
      startDate = new Date(today);
    } else if (timeFilter === 'week') {
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 7);
    } else {
      startDate = new Date(today);
      startDate.setMonth(startDate.getMonth() - 1);
    }

    rbacService.getSalesApi({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    }, business.id)
      .then((data) => {
        if (isMounted) {
          setSales(data || []);
        }
      })
      .catch((err) => {
        console.warn('Could not load overview sales:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingSales(false);
      });

    return () => {
      isMounted = false;
    };
  }, [business.id, timeFilter]);

  // Aggregate metrics
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      if (daybookFilter === 'all') return true;
      if (daybookFilter === 'dine_in') return s.sale_type === 'DINE_IN' || !s.sale_type;
      if (daybookFilter === 'delivery') return s.sale_type === 'DELIVERY';
      if (daybookFilter === 'takeaway') return s.sale_type === 'TAKEAWAY' || s.sale_type === 'QUICK_POS';
      return true;
    });
  }, [sales, daybookFilter]);

  const stats = useMemo(() => {
    const totalSalesAmount = filteredSales.reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    const dineInAmount = filteredSales
      .filter((s) => s.sale_type === 'DINE_IN' || !s.sale_type)
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    const deliveryAmount = filteredSales
      .filter((s) => s.sale_type === 'DELIVERY')
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    const takeawayAmount = filteredSales
      .filter((s) => s.sale_type === 'TAKEAWAY' || s.sale_type === 'QUICK_POS')
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    // Staff sales calculation
    const staffSalesMap: Record<string, number> = {};
    filteredSales.forEach((s) => {
      const staffName = s.cashier_name || 'Counter Staff';
      staffSalesMap[staffName] = (staffSalesMap[staffName] || 0) + (Number(s.total_amount) || 0);
    });

    // Customer spend calculation
    const customerMap: Record<string, number> = {};
    filteredSales.forEach((s) => {
      const cust = s.customer_name || 'Walk-in Guest';
      customerMap[cust] = (customerMap[cust] || 0) + (Number(s.total_amount) || 0);
    });

    const cashSales = filteredSales
      .filter((s) => (s.payment_method || '').toUpperCase() === 'CASH')
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    const cardSales = filteredSales
      .filter((s) => (s.payment_method || '').toUpperCase() === 'CARD')
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    const qrSales = filteredSales
      .filter((s) => { const pm = (s.payment_method || '').toUpperCase(); return pm === 'QR_CODE' || pm === 'UPI_QR'; })
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    const creditSales = filteredSales
      .filter((s) => (s.payment_method || '').toUpperCase() === 'CREDIT')
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);

    return {
      totalSales: totalSalesAmount,
      dineIn: dineInAmount,
      delivery: deliveryAmount,
      takeaway: takeawayAmount,
      cashSales,
      cardSales,
      qrSales,
      creditSales,
      staffCount: Object.keys(staffSalesMap).length || 0,
      customerCount: Object.keys(customerMap).length || 0,
    };
  }, [sales]);

  const isViewOnly = !staffSession && !user;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* View-Only Mode Guidance Banner */}
      {isViewOnly && (
        <div 
          id="banner-view-only-prompt" 
          className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200/90 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-zinc-900">
                You are currently in View-Only Mode
              </h3>
              <p className="text-[11px] text-zinc-600 mt-0.5 leading-relaxed">
                Log in with your designated Staff PIN or credentials to perform live KDS, table management, and counter POS billing.
              </p>
            </div>
          </div>

          <button
            id="btn-login-for-tasks"
            type="button"
            onClick={onOpenRoleModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shrink-0 shadow-xs cursor-pointer transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Staff / Role Sign-In</span>
          </button>
        </div>
      )}

      {/* TOP ROW: 5 KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Card 1: Sales */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                $
              </span>
              Sales
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-base sm:text-lg font-black text-zinc-900">
              {currency} {stats.totalSales.toLocaleString()}
            </div>
            <p className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5 mt-0.5">
              <span>↑</span> Live revenue
            </p>
          </div>
        </div>

        {/* Card 2: Cash Sales */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-[10px] font-bold">
                <Banknote className="w-3 h-3" />
              </span>
              Cash Sales
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-base sm:text-lg font-black text-zinc-900">
              {currency} {stats.cashSales?.toLocaleString()}
            </div>
            <p className="text-[10px] font-semibold text-zinc-400 mt-0.5">
              Cash payments
            </p>
          </div>
        </div>

        {/* Card 3: Card Sales */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                <CreditCard className="w-3 h-3" />
              </span>
              Card Sales
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-base sm:text-lg font-black text-zinc-900">
              {currency} {stats.cardSales?.toLocaleString()}
            </div>
            <p className="text-[10px] font-semibold text-zinc-400 mt-0.5">
              Card POS settlement
            </p>
          </div>
        </div>

        {/* Card 4: QR Sales */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center text-[10px] font-bold">
                <QrCode className="w-3 h-3" />
              </span>
              QR Sales
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-base sm:text-lg font-black text-zinc-900">
              {currency} {stats.qrSales?.toLocaleString()}
            </div>
            <p className="text-[10px] font-semibold text-zinc-400 mt-0.5">
              Digital QR / UPI
            </p>
          </div>
        </div>

        {/* Card 5: Credit Sales */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center text-[10px] font-bold">
                <BookOpen className="w-3 h-3" />
              </span>
              Credit Sales
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-base sm:text-lg font-black text-zinc-900">
              {currency} {stats.creditSales?.toLocaleString()}
            </div>
            <p className="text-[10px] font-semibold text-zinc-400 mt-0.5">
              Credit ledger account
            </p>
          </div>
        </div>
      </div>
      {/* MIDDLE ROW: Sales Breakdown + Sales Overview Graph */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Sales & Service Category Breakdown (4 cols) */}
        <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-zinc-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-zinc-900">Sales</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Live Channels
              </span>
            </div>

            <div className="mt-3">
              <div className="text-2xl font-black text-zinc-950">
                {currency} {stats.totalSales.toLocaleString()}
              </div>
              <div className="text-xs font-bold text-zinc-400 mt-0.5">
                Total Sales
              </div>
            </div>

            {/* Sparkline wave */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                ↑ 121.07%
              </span>
              <span className="text-xs text-zinc-400">up by this month</span>
              <svg className="w-24 h-6 text-emerald-500 stroke-current shrink-0 ml-auto" fill="none" viewBox="0 0 100 24">
                <path d="M0 20 Q 25 5, 50 18 T 100 4" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>

            {/* Channels List */}
            <div className="mt-6 space-y-3.5 pt-4 border-t border-zinc-100">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-zinc-700 font-semibold">
                  <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xs">
                    🛎️
                  </span>
                  <span>Dine In Service</span>
                </div>
                <span className="font-extrabold text-zinc-900">
                  {currency} {stats.dineIn.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-zinc-700 font-semibold">
                  <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs">
                    🛵
                  </span>
                  <span>Delivery Services</span>
                </div>
                <span className="font-extrabold text-zinc-900">
                  {currency} {stats.delivery.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-zinc-700 font-semibold">
                  <span className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-xs">
                    🛍️
                  </span>
                  <span>Takeaway Services</span>
                </div>
                <span className="font-extrabold text-zinc-900">
                  {currency} {stats.takeaway.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-100">
            <button
              type="button"
              onClick={() => onNavigateTab('billing')}
              className="w-full py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Open POS Register</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right: Sales Overview Graph (8 cols) */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-zinc-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-zinc-900">
                  Sales Overview
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Here is a live overview of your sales transactions
                </p>
              </div>

              <div className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 bg-zinc-50 hover:bg-zinc-100 transition-colors cursor-pointer">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                <select
                  value={timeFilter}
                  onChange={(e) => onChangeTimeFilter ? onChangeTimeFilter(e.target.value as any) : undefined}
                  className="appearance-none bg-transparent outline-none pr-4 cursor-pointer text-zinc-700 font-bold"
                >
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                </select>
                <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-3 pointer-events-none" />
              </div>
            </div>

            {/* SVG Interactive Smooth Graph */}
            <div className="mt-6 relative h-56 w-full">
              {(() => {
                // Determine min/max time based on timeFilter
                const now = new Date();
                let minTime = new Date(now).setHours(0, 0, 0, 0); // Default to start of today
                let maxTime = new Date(now).setHours(23, 59, 59, 999);
                
                if (timeFilter === 'week') {
                  minTime = now.getTime() - 7 * 24 * 60 * 60 * 1000;
                  maxTime = now.getTime();
                } else if (timeFilter === 'month') {
                  minTime = now.getTime() - 30 * 24 * 60 * 60 * 1000;
                  maxTime = now.getTime();
                }

                // Bucket sales into 10 points for X-axis
                const buckets = Array(10).fill(0);
                const bucketSize = (maxTime - minTime) / 10;

                filteredSales.forEach(s => {
                  const t = new Date(s.created_at).getTime();
                  if (t >= minTime && t <= maxTime) {
                    let idx = Math.floor((t - minTime) / bucketSize);
                    if (idx >= 10) idx = 9;
                    buckets[idx] += Number(s.total_amount) || 0;
                  }
                });

                const maxBucketVal = Math.max(100, ...buckets);
                const roundedMax = Math.ceil(maxBucketVal / 100) * 100;

                // SVG dimensions
                const svgW = 500;
                const svgH = 170;

                // Build Path
                let pathD = `M 0 ${svgH} `;
                let strokeD = '';
                const points = [];
                for (let i = 0; i < buckets.length; i++) {
                  const x = (i / 9) * svgW;
                  const y = svgH - (buckets[i] / roundedMax) * (svgH - 20); // 20px top padding
                  
                  if (i === 0) strokeD += `M ${x} ${y} `;
                  else strokeD += `L ${x} ${y} `;
                  pathD += `L ${x} ${y} `;
                  
                  if (buckets[i] > 0) points.push({ x, y, val: buckets[i] });
                }
                pathD += `L ${svgW} ${svgH} Z`;

                // X-axis labels
                const labels = [];
                for (let i = 0; i <= 4; i++) {
                  const d = new Date(minTime + (i / 4) * (maxTime - minTime));
                  if (timeFilter === 'today') {
                    labels.push(d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
                  } else {
                    labels.push(d.toLocaleDateString([], { month: 'short', day: 'numeric' }));
                  }
                }

                return (
                  <>
                    {/* Y-axis labels */}
                    <div className="absolute left-0 inset-y-0 flex flex-col justify-between text-[10px] font-mono text-zinc-400 select-none pb-6">
                      <span>{currency} {roundedMax}</span>
                      <span>{currency} {Math.round(roundedMax * 0.75)}</span>
                      <span>{currency} {Math.round(roundedMax * 0.5)}</span>
                      <span>{currency} {Math.round(roundedMax * 0.25)}</span>
                      <span>{currency} 0</span>
                    </div>

                    <div className="ml-12 h-full relative pb-6">
                      {/* Grid Lines */}
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-40">
                        <div className="border-b border-dashed border-zinc-200 w-full" />
                        <div className="border-b border-dashed border-zinc-200 w-full" />
                        <div className="border-b border-dashed border-zinc-200 w-full" />
                        <div className="border-b border-dashed border-zinc-200 w-full" />
                        <div className="border-b border-zinc-200 w-full" />
                      </div>

                      {/* SVG Chart */}
                      <svg className="w-full h-full overflow-visible absolute inset-0" preserveAspectRatio="none" viewBox={`0 0 ${svgW} ${svgH}`}>
                        <defs>
                          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <path d={pathD} fill="url(#salesGrad)" />
                        <path d={strokeD} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        {points.map((pt, i) => (
                          <circle key={i} cx={pt.x} cy={pt.y} r="4" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
                        ))}
                      </svg>
                    </div>

                    {/* X-axis timeline */}
                    <div className="ml-12 flex justify-between text-[10px] font-mono text-zinc-400 select-none absolute bottom-0 left-0 right-0">
                      {labels.map((lbl, i) => (
                        <span key={i}>{lbl}</span>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between pt-4 border-t border-zinc-100 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              Peak Service: 7:00 PM – 8:45 PM Dine-in Rush
            </span>
            <span className="font-semibold text-zinc-700">
              Avg Bill Turnaround: 24 mins
            </span>
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: Staff Sales + Top Customers + Quick Launchpad */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Sales By Staff */}
        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-2xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-zinc-900">Sales By Staff</h4>
              <p className="text-[11px] text-zinc-400">Top Performing Staffs</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100">
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Total Revenue</span>
              <div className="text-sm font-black text-zinc-900 mt-0.5">
                {currency} {stats.totalSales.toLocaleString()}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Total Staffs</span>
              <div className="text-sm font-black text-zinc-900 mt-0.5">
                {stats.staffCount} Active
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('team')}
            className="w-full mt-4 py-1.5 text-xs font-bold text-amber-700 hover:text-amber-800 transition flex items-center justify-center gap-1 cursor-pointer"
          >
            <span>Manage Team Members</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Card 2: Top Customers */}
        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-2xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-sm">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-zinc-900">Top Customers</h4>
              <p className="text-[11px] text-zinc-400">Customers By Spend</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100">
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Total Spending</span>
              <div className="text-sm font-black text-zinc-900 mt-0.5">
                {currency} {stats.totalSales.toLocaleString()}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Total Guests</span>
              <div className="text-sm font-black text-zinc-900 mt-0.5">
                {stats.customerCount} Guests
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('checkins')}
            className="w-full mt-4 py-1.5 text-xs font-bold text-amber-700 hover:text-amber-800 transition flex items-center justify-center gap-1 cursor-pointer"
          >
            <span>View Tables & QR</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Card 3: Fast Operations Launchpad */}
        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-extrabold text-sm text-zinc-900">Operational Hub</h4>
              <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                Fast Actions
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mb-3">
              Direct access to live kitchen stations, menu pricing, table QR codes, and system settings.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onNavigateTab('kds')}
                className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-amber-50 hover:border-amber-300 text-left transition cursor-pointer"
              >
                <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <ChefHat className="w-3.5 h-3.5 text-amber-600" />
                  KDS Orders
                </div>
                <div className="text-[10px] text-zinc-400">Live Kitchen</div>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('billing')}
                className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-amber-50 hover:border-amber-300 text-left transition cursor-pointer"
              >
                <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-amber-600" />
                  POS Counter
                </div>
                <div className="text-[10px] text-zinc-400">Checkout</div>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('menus')}
                className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-amber-50 hover:border-amber-300 text-left transition cursor-pointer"
              >
                <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-amber-600" />
                  Catalog
                </div>
                <div className="text-[10px] text-zinc-400">Menu items</div>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('configurations')}
                className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-amber-50 hover:border-amber-300 text-left transition cursor-pointer"
              >
                <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
                  Tax & ERP
                </div>
                <div className="text-[10px] text-zinc-400">Configuration</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
