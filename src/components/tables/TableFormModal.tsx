import React, { useState, useEffect } from 'react';
import { X, Plus, Edit2, Layers, Building2, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import { RestaurantTable, TableStatus } from '../../types/rbac';
import { Button } from '../ui/Button';

interface TableFormModalProps {
  table?: RestaurantTable | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    table_number: string;
    floor: string | null;
    building: string | null;
    capacity: number;
    status: TableStatus; pay_first_enabled?: boolean;
  }) => Promise<void>;
  existingFloors?: string[];
  existingBuildings?: string[];
  nextSuggestedNumber?: number;
}

export const TableFormModal: React.FC<TableFormModalProps> = ({
  table,
  isOpen,
  onClose,
  onSave,
  existingFloors = ['Ground Floor', '1st Floor', '2nd Floor', 'Rooftop', 'Garden/Outdoor'],
  existingBuildings = ['Main Building', 'Garden Courtyard', 'Terrace Annex', 'Poolside Cabana'],
  nextSuggestedNumber = 1,
}) => {
  const isEditing = Boolean(table);

  const [tableNumber, setTableNumber] = useState('');
  const [floorOption, setFloorOption] = useState<string>('none');
  const [customFloor, setCustomFloor] = useState('');
  const [buildingOption, setBuildingOption] = useState<string>('none');
  const [customBuilding, setCustomBuilding] = useState('');
  const [capacity, setCapacity] = useState<number>(4);
  const [status, setStatus] = useState<TableStatus>('ACTIVE');
  const [payFirstEnabled, setPayFirstEnabled] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (table) {
      setTableNumber(table.table_number);
      if (table.floor) {
        if (existingFloors.includes(table.floor)) {
          setFloorOption(table.floor);
          setCustomFloor('');
        } else {
          setFloorOption('custom');
          setCustomFloor(table.floor);
        }
      } else {
        setFloorOption('none');
        setCustomFloor('');
      }

      if (table.building) {
        if (existingBuildings.includes(table.building)) {
          setBuildingOption(table.building);
          setCustomBuilding('');
        } else {
          setBuildingOption('custom');
          setCustomBuilding(table.building);
        }
      } else {
        setBuildingOption('none');
        setCustomBuilding('');
      }

      setCapacity(table.capacity || 4);
      setStatus(table.status || 'ACTIVE');
    } else {
      setTableNumber(`Table ${nextSuggestedNumber}`);
      setFloorOption('none');
      setCustomFloor('');
      setBuildingOption('none');
      setCustomBuilding('');
      setCapacity(4);
      setStatus('ACTIVE');
    }
    setErrorMsg(null);
  }, [table, isOpen, nextSuggestedNumber]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber.trim()) {
      setErrorMsg('Please provide a table number or identifier.');
      return;
    }

    let finalFloor: string | null = null;
    if (floorOption === 'custom' && customFloor.trim()) {
      finalFloor = customFloor.trim();
    } else if (floorOption !== 'none' && floorOption !== 'custom') {
      finalFloor = floorOption;
    }

    let finalBuilding: string | null = null;
    if (buildingOption === 'custom' && customBuilding.trim()) {
      finalBuilding = customBuilding.trim();
    } else if (buildingOption !== 'none' && buildingOption !== 'custom') {
      finalBuilding = buildingOption;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await onSave({
        table_number: tableNumber.trim(),
        floor: finalFloor,
        building: finalBuilding,
        capacity: Number(capacity) || 4,
        status,
      pay_first_enabled: payFirstEnabled,
    });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save table details');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/70 backdrop-blur-xs p-3 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="min-h-full flex items-center justify-center py-4">
        <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-zinc-200 animate-in fade-in zoom-in-95 duration-200 my-auto">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-100 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
                {isEditing ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-900">
                  {isEditing ? 'Edit Restaurant Table' : 'Add New Table'}
                </h3>
                <p className="text-xs text-zinc-500">
                  Configure table identifier, floor, building location, and capacity.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-zinc-100 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Table Number */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 mb-1.5">
              Table Identifier / Number <span className="text-red-500">*</span>
            </label>
            <input
              id="input-table-number"
              type="text"
              required
              placeholder="e.g. Table 1, T-04, VIP-2, Rooftop Lounge 1"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-semibold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
            />
            <p className="text-[11px] text-zinc-400 mt-1">
              This name will be printed on the table QR stand card.
            </p>
          </div>

          {/* Floor Selection (Optional / Nullable) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 mb-1.5 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-zinc-500" />
                Floor (Optional)
              </label>
              <select
                id="select-table-floor"
                value={floorOption}
                onChange={(e) => setFloorOption(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              >
                <option value="none">— No Floor (Single Level) —</option>
                {existingFloors.map((fl) => (
                  <option key={fl} value={fl}>
                    {fl}
                  </option>
                ))}
                <option value="custom">+ Add Custom Floor...</option>
              </select>

              {floorOption === 'custom' && (
                <input
                  type="text"
                  placeholder="Enter floor name (e.g. 3rd Floor)"
                  value={customFloor}
                  onChange={(e) => setCustomFloor(e.target.value)}
                  className="w-full mt-2 px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-medium text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              )}
            </div>

            {/* Building Selection (Optional / Nullable) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 mb-1.5 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-zinc-500" />
                Building / Section
              </label>
              <select
                id="select-table-building"
                value={buildingOption}
                onChange={(e) => setBuildingOption(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              >
                <option value="none">— None / Single Hall —</option>
                {existingBuildings.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
                <option value="custom">+ Add Custom Section...</option>
              </select>

              {buildingOption === 'custom' && (
                <input
                  type="text"
                  placeholder="Enter building (e.g. Garden Pavilion)"
                  value={customBuilding}
                  onChange={(e) => setCustomBuilding(e.target.value)}
                  className="w-full mt-2 px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-medium text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              )}
            </div>
          </div>

          {/* Capacity & Initial Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 mb-1.5 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-zinc-500" />
                Seating Capacity
              </label>
              <input
                id="input-table-capacity"
                type="number"
                min="1"
                max="50"
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 mb-1.5">
                Initial Status
              </label>
              <select
                id="select-table-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TableStatus)}
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              >
                <option value="ACTIVE">🟢 Active (Available)</option>
                <option value="OCCUPIED">🔵 Occupied (In Use)</option>
                <option value="RESERVED">🟡 Reserved</option>
                <option value="INACTIVE">⚪ Inactive (Maintenance / Off)</option>
              </select>
            </div>


            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 mb-1.5 flex items-center gap-1.5">
                <span className="text-zinc-500">💳</span>
                Pay First Policy
              </label>
              <label className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-200 rounded-xl cursor-pointer hover:bg-zinc-100 transition">
                <div>
                  <div className="text-sm font-bold text-zinc-900">Require Payment First</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Orders won't go to the kitchen until the cashier confirms payment.</div>
                </div>
                <div className="relative inline-block w-10 shrink-0 select-none transition duration-200 ease-in">
                  <input
                    type="checkbox"
                    checked={payFirstEnabled}
                    onChange={(e) => setPayFirstEnabled(e.target.checked)}
                    className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer"
                  />
                  <label className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${payFirstEnabled ? 'bg-amber-500' : 'bg-zinc-300'}`}></label>
                </div>
              </label>
            </div>

          </div>

          {/* Footer Actions */}
          <div className="pt-4 mt-6 flex items-center justify-end gap-3 border-t border-zinc-100">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button
              id="submit-table-btn"
              type="submit"
              variant="primary"
              size="md"
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs px-5"
            >
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Table' : 'Create Table'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
  );
};
