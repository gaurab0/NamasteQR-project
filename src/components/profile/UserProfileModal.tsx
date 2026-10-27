import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  User as UserIcon,
  Mail,
  Calendar,
  Building2,
  ShieldCheck,
  CheckCircle2,
  X,
  Save,
  RotateCcw,
  LogOut,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user, activeBusiness, updateProfile, logout } = useAuth();
  
  const currentName = user?.name || (user?.email ? user.email.split('@')[0] : 'User');
  const [displayNameInput, setDisplayNameInput] = useState(currentName);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDisplayNameInput(user?.name || (user?.email ? user.email.split('@')[0] : 'User'));
      setSaveSuccess(null);
      setSaveError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatRoleLabel = (role?: string) => {
    if (!role) return 'Staff Member';
    switch (role) {
      case 'HOTEL_OWNER':
        return 'Hotel Owner';
      case 'RESTAURANT_OWNER':
        return 'Restaurant Owner';
      case 'OWNER':
        return 'Business Owner';
      case 'ADMIN':
        return 'System Administrator';
      case 'MANAGER':
        return 'General Manager';
      case 'KITCHEN_STAFF':
        return 'Kitchen Staff & Chef';
      case 'FRONT_DESK':
        return 'Front Desk & Reception';
      case 'CASHIER':
        return 'Cashier & Billing';
      case 'HOUSEKEEPING':
        return 'Housekeeping Staff';
      case 'STAFF':
        return 'Staff Member';
      default:
        return role.replace(/_/g, ' ');
    }
  };

  const formatCreatedDate = (dateVal?: string | Date) => {
    const raw = dateVal || user?.business?.created_at || activeBusiness?.created_at;
    if (!raw) {
      return new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) {
        return new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  };

  const getInitials = (nameStr: string) => {
    const trimmed = (nameStr || '').trim();
    if (!trimmed) return 'SF';
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = Array.from(parts[0])[0] || '';
      const second = Array.from(parts[1])[0] || '';
      return (first + second).toUpperCase();
    }
    return Array.from(trimmed).slice(0, 2).join('').toUpperCase();
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayNameInput.trim();
    if (!trimmed) {
      setSaveError('Display name cannot be empty.');
      return;
    }
    if (trimmed.length > 80) {
      setSaveError('Display name cannot exceed 80 characters.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const res = await updateProfile({ name: trimmed });
    setIsSaving(false);

    if (res.success) {
      setDisplayNameInput(trimmed);
      setSaveSuccess('Display name updated successfully!');
      setTimeout(() => setSaveSuccess(null), 4000);
    } else {
      setSaveError(res.error || 'Failed to update display name.');
    }
  };

  const businessName = user?.business?.name || activeBusiness?.name || '7 SPICES HQ';
  const userRole = formatRoleLabel(user?.role);
  const createdDate = formatCreatedDate(user?.created_at);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl max-w-xl w-full max-h-[92vh] flex flex-col border border-zinc-200 shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 text-white p-5 sm:p-6 shrink-0 relative">
          <button
            type="button"
            id="btn-close-profile-modal"
            onClick={onClose}
            className="absolute top-4 right-4 sm:top-5 sm:right-5 text-zinc-400 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition cursor-pointer"
            title="Close profile modal"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white">
                User Profile
              </h2>
              <p className="text-xs text-zinc-300 mt-0.5">
                Account details and identity settings
              </p>
            </div>
          </div>
        </div>

        {/* Modal Content - Scrollable */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 overscroll-contain">
          {/* Avatar and Identity Hero */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-50 border border-zinc-200/80">
            <div className="w-14 h-14 rounded-2xl bg-amber-600 text-white font-extrabold text-lg flex items-center justify-center shrink-0 shadow-sm ring-4 ring-amber-100">
              {getInitials(currentName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-zinc-900 truncate">
                  {currentName}
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span>Verified</span>
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-amber-100/80 text-amber-900 border border-amber-200">
                  <ShieldCheck className="w-3 h-3 text-amber-700 shrink-0" />
                  <span>{userRole}</span>
                </span>
                <span className="text-xs text-zinc-500 truncate">
                  {businessName}
                </span>
              </div>
            </div>
          </div>

          {/* User Details Information Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Email Address */}
            <div className="p-3.5 rounded-xl border border-zinc-200 bg-white shadow-2xs space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                <Mail className="w-3.5 h-3.5 text-amber-600" />
                <span>Email Address</span>
              </div>
              <div className="text-xs font-bold text-zinc-900 truncate" title={user?.email}>
                {user?.email || 'Not provided'}
              </div>
            </div>

            {/* Account Created Date */}
            <div className="p-3.5 rounded-xl border border-zinc-200 bg-white shadow-2xs space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                <Calendar className="w-3.5 h-3.5 text-amber-600" />
                <span>Account Created</span>
              </div>
              <div className="text-xs font-bold text-zinc-900">
                {createdDate}
              </div>
            </div>

            {/* Business Organization */}
            <div className="p-3.5 rounded-xl border border-zinc-200 bg-white shadow-2xs space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                <Building2 className="w-3.5 h-3.5 text-amber-600" />
                <span>Business Organization</span>
              </div>
              <div className="text-xs font-bold text-zinc-900 truncate" title={businessName}>
                {businessName}
              </div>
            </div>

            {/* Role / Designation */}
            <div className="p-3.5 rounded-xl border border-zinc-200 bg-white shadow-2xs space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                <span>Role / Designation</span>
              </div>
              <div className="text-xs font-bold text-zinc-900 truncate">
                {userRole}
              </div>
            </div>
          </div>

          {/* Change Display Name Section */}
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  Change Display Name
                </h4>
                <p className="text-[11px] text-zinc-600 mt-0.5">
                  Update your display name visible across the header, order records, and reports.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveName} className="space-y-2.5">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  id="input-profile-display-name"
                  aria-label="Display Name"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  placeholder="Enter full or display name"
                  maxLength={80}
                  className="flex-1 px-3 py-2 text-xs font-semibold text-zinc-900 bg-white border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                />
                {displayNameInput !== currentName && (
                  <button
                    type="button"
                    onClick={() => {
                      setDisplayNameInput(currentName);
                      setSaveError(null);
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-100 transition shadow-2xs shrink-0 cursor-pointer"
                    title="Reset to current name"
                  >
                    Reset
                  </button>
                )}
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  isLoading={isSaving}
                  disabled={isSaving || !displayNameInput.trim()}
                  leftIcon={<Save className="w-3.5 h-3.5" />}
                  className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 font-bold"
                >
                  Save Name
                </Button>
              </div>

              {saveSuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{saveSuccess}</span>
                </div>
              )}

              {saveError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              id="btn-profile-signout"
              onClick={async () => {
                onClose();
                await logout();
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-700 hover:text-rose-800 hover:bg-rose-50 transition cursor-pointer"
              title="Sign out of ServeFlow"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>

          <button
            type="button"
            id="btn-profile-close"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-1.5 rounded-xl text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white transition shadow-2xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
