import React from 'react';
import { MenuStatus } from '../../types/rbac';
import { ChevronDown, Loader2 } from 'lucide-react';

interface AvailabilityStatusBadgeProps {
  status?: MenuStatus;
  isAvailable?: boolean;
  canEdit?: boolean;
  isKitchenStaff?: boolean;
  onStatusChange?: (newStatus: MenuStatus) => void;
  loading?: boolean;
}

export const AvailabilityStatusBadge: React.FC<AvailabilityStatusBadgeProps> = ({
  status = 'available',
  isAvailable = true,
  canEdit = false,
  onStatusChange,
  loading = false,
}) => {
  const currentStatus: MenuStatus = (status as MenuStatus) || (isAvailable ? 'available' : 'unavailable');

  const getStatusConfig = (st: MenuStatus) => {
    switch (st) {
      case 'available':
        return {
          label: 'Available',
          dotBg: 'bg-emerald-500',
          textColor: 'text-emerald-700',
          bgColor: 'bg-emerald-50/80 hover:bg-emerald-100/80',
          borderColor: 'border-emerald-200/90',
        };
      case 'out_of_stock':
        return {
          label: 'Out of Stock',
          dotBg: 'bg-amber-500',
          textColor: 'text-amber-700',
          bgColor: 'bg-amber-50/80 hover:bg-amber-100/80',
          borderColor: 'border-amber-200/90',
        };
      case 'unavailable':
      default:
        return {
          label: 'Unavailable',
          dotBg: 'bg-zinc-400',
          textColor: 'text-zinc-600',
          bgColor: 'bg-zinc-100/80 hover:bg-zinc-200/60',
          borderColor: 'border-zinc-200',
        };
    }
  };

  const config = getStatusConfig(currentStatus);

  if (canEdit && onStatusChange) {
    return (
      <div className="relative inline-flex items-center">
        <label htmlFor="status-select-badge" className="sr-only">Availability Status</label>
        <div
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-all duration-150 ${config.bgColor} ${config.textColor} ${config.borderColor}`}
        >
          {loading ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin text-current" />
          ) : (
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dotBg}`} />
          )}
          <select
            id="status-select-badge"
            aria-label="Change Status"
            disabled={loading}
            value={currentStatus}
            onChange={(e) => onStatusChange(e.target.value as MenuStatus)}
            className="bg-transparent text-[11px] font-semibold focus:outline-hidden cursor-pointer pr-3.5 appearance-none leading-none py-0.5"
          >
            <option value="available">Available</option>
            <option value="out_of_stock">Out of Stock</option>
            <option value="unavailable">Unavailable</option>
          </select>
          <ChevronDown className="w-2.5 h-2.5 text-current opacity-60 pointer-events-none absolute right-1.5" />
        </div>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${config.bgColor} ${config.textColor} ${config.borderColor}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dotBg}`} />
      <span>{config.label}</span>
    </span>
  );
};
