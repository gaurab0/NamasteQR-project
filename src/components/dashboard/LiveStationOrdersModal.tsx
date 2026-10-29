import React, { useState, useEffect } from 'react';
import { 
  ChefHat, 
  Bell, 
  Clock, 
  X, 
  ArrowRight, 
  UtensilsCrossed, 
  CheckCircle2, 
  Activity,
  Sparkles,
  Layers,
  Wine
} from 'lucide-react';
import { TableOrder } from '../../types/rbac';

interface LiveStationOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  kitchenOrders: TableOrder[];
  totalKitchenOrdersCount?: number;
  waiterOrders: TableOrder[];
  totalWaiterOrdersCount?: number;
  initialTab?: 'kitchen' | 'waiter' | 'all';
  onNavigateToKDS: () => void;
  onNavigateToWaiter: () => void;
  currency?: string;
}

export const LiveStationOrdersModal: React.FC<LiveStationOrdersModalProps> = ({
  isOpen,
  onClose,
  kitchenOrders,
  totalKitchenOrdersCount,
  waiterOrders,
  totalWaiterOrdersCount,
  initialTab = 'all',
  onNavigateToKDS,
  onNavigateToWaiter,
  currency = 'Rs.',
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'kitchen' | 'waiter'>(initialTab);
  const [, setTick] = useState(0);

  const kitchenCount = totalKitchenOrdersCount ?? kitchenOrders.length;
  const waiterCount = totalWaiterOrdersCount ?? waiterOrders.length;

  // Live timer tick every 10 seconds to keep elapsed time accurate
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatTimeTaken = (createdDate: string | Date) => {
    const elapsedMs = Math.max(0, Date.now() - new Date(createdDate).getTime());
    const totalMinutes = Math.floor(elapsedMs / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);

    if (totalMinutes === 0) {
      return `${seconds}s taken`;
    }
    return `${totalMinutes}m ${seconds}s taken`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'READY':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
            READY
          </span>
        );
      case 'PREPARING':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-orange-100 text-orange-800 border border-orange-200">
            PREPARING
          </span>
        );
      case 'RECEIVED':
      case 'PENDING':
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
            PENDING
          </span>
        );
    }
  };

  const renderOrderCard = (order: TableOrder, idx: number, stationType: 'kitchen' | 'waiter') => {
    const tableName = order.table_number || (order.table_id ? `Table ${order.table_id}` : 'Counter Order');
    const orderNum = order.order_number || `#${order.id.slice(-4)}`;

    const hasDrinks = (order.items || []).some(i => {
      const name = (i.name || '').toLowerCase();
      const cat = (i.category || '').toLowerCase();
      return ['drink', 'beverage', 'bar', 'cocktail', 'beer', 'wine', 'juice', 'coffee', 'tea', 'soda'].some(k => name.includes(k) || cat.includes(k));
    });
    const hasFood = (order.items || []).some(i => {
      const name = (i.name || '').toLowerCase();
      const cat = (i.category || '').toLowerCase();
      return !['drink', 'beverage', 'bar', 'cocktail', 'beer', 'wine', 'juice', 'coffee', 'tea', 'soda'].some(k => name.includes(k) || cat.includes(k));
    });

    return (
      <div 
        key={order.id || idx}
        className="p-3.5 bg-zinc-50 hover:bg-zinc-100/80 rounded-xl border border-zinc-200 transition-colors space-y-2.5"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-zinc-900 text-white text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
              #{idx + 1}
            </span>
            <div className="font-extrabold text-xs text-zinc-900 truncate">
              {tableName}
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              {orderNum}
            </span>
            {stationType === 'kitchen' && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                {hasDrinks && !hasFood ? (
                  <>
                    <Wine className="w-2.5 h-2.5 text-purple-600" />
                    <span>Bar</span>
                  </>
                ) : hasFood && !hasDrinks ? (
                  <>
                    <ChefHat className="w-2.5 h-2.5 text-amber-600" />
                    <span>Kitchen</span>
                  </>
                ) : (
                  <>
                    <UtensilsCrossed className="w-2.5 h-2.5 text-amber-600" />
                    <span>Kitch/Bar</span>
                  </>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {getStatusBadge(order.status)}
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-zinc-700 border border-zinc-200 shrink-0">
              <Clock className="w-2.5 h-2.5 text-amber-600" />
              {formatTimeTaken(order.created_at)}
            </span>
          </div>
        </div>

        {/* Order Items Preview */}
        <div className="space-y-1 pl-7">
          <div className="text-[11px] text-zinc-700 font-medium">
            {(order.items || []).slice(0, 3).map((item, itIdx) => (
              <span key={itIdx} className="inline-block mr-2 text-zinc-800">
                <span className="font-bold text-amber-800">{item.quantity}x</span> {item.name}
                {itIdx < Math.min((order.items || []).length, 3) - 1 ? ',' : ''}
              </span>
            ))}
            {(order.items || []).length > 3 && (
              <span className="text-[10px] text-zinc-400 font-normal">
                +{(order.items || []).length - 3} more
              </span>
            )}
          </div>

          {order.order_notes && (
            <p className="text-[10px] text-zinc-500 italic">
              Note: {order.order_notes}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl space-y-4 border border-zinc-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-base text-zinc-900 flex items-center gap-2">
                Live Station Notifications
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
                  Ascending Order by Time Taken
                </span>
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Top 3 orders each for Kitchen/Bar and Waiter Service Station sorted from lowest to highest turnaround duration.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Filter Control */}
        <div className="flex items-center gap-2 p-1 bg-zinc-100 rounded-xl max-w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-white text-zinc-900 shadow-2xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Both Stations</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('kitchen')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'kitchen'
                ? 'bg-white text-zinc-900 shadow-2xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <ChefHat className="w-3.5 h-3.5 text-amber-600" />
            <span>Kitchen & Bar ({kitchenCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('waiter')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'waiter'
                ? 'bg-white text-zinc-900 shadow-2xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-blue-600" />
            <span>Waiter Station ({waiterCount})</span>
          </button>
        </div>

        {/* Station Orders Content */}
        <div className={`grid gap-5 ${activeTab === 'all' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {/* Column 1: Kitchen / Bar */}
          {(activeTab === 'all' || activeTab === 'kitchen') && (
            <div className="space-y-3 bg-white p-4 rounded-xl border border-zinc-200/90 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                      <ChefHat className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="font-extrabold text-sm text-zinc-900">Kitchen & Bar Station</h4>
                      <p className="text-[10px] text-zinc-500">Fastest turnaround queue (ascending)</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                    {kitchenCount} {kitchenCount === 1 ? 'order' : 'orders'}
                  </span>
                </div>

                <div className="space-y-2 mt-3">
                  {kitchenOrders.length === 0 ? (
                    <div className="py-8 text-center text-zinc-400 space-y-1">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                      <p className="text-xs font-semibold text-zinc-700">All kitchen & bar orders completed</p>
                      <p className="text-[10px]">No active orders currently pending preparation.</p>
                    </div>
                  ) : (
                    kitchenOrders.map((order, idx) => renderOrderCard(order, idx, 'kitchen'))
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToKDS();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Open Full Kitchen Display (KDS)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Column 2: Waiter Service Station */}
          {(activeTab === 'all' || activeTab === 'waiter') && (
            <div className="space-y-3 bg-white p-4 rounded-xl border border-zinc-200/90 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                      <Bell className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="font-extrabold text-sm text-zinc-900">Waiter Service Station</h4>
                      <p className="text-[10px] text-zinc-500">Ready table deliveries (ascending)</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                    {waiterCount} {waiterCount === 1 ? 'order' : 'orders'}
                  </span>
                </div>

                <div className="space-y-2 mt-3">
                  {waiterOrders.length === 0 ? (
                    <div className="py-8 text-center text-zinc-400 space-y-1">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                      <p className="text-xs font-semibold text-zinc-700">No pending table deliveries</p>
                      <p className="text-[10px]">All prepared orders have been served to guests.</p>
                    </div>
                  ) : (
                    waiterOrders.map((order, idx) => renderOrderCard(order, idx, 'waiter'))
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToWaiter();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Open Full Waiter Station</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-2 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-100">
          <span className="flex items-center gap-1 text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Showing up to 3 live orders per station sorted ascending by duration
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-zinc-300 font-bold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
