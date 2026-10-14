import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Shield, 
  Lock, 
  Mail, 
  UserCheck, 
  AlertCircle, 
  X, 
  Sparkles, 
  CheckCircle2, 
  KeyRound,
  ShieldCheck,
  Building2,
  ChefHat,
  Utensils,
  Laptop
} from 'lucide-react';
import { Button } from '../ui/Button';
import { AppRole, StaffAccountSession } from '../../types/rbac';
import { rbacService } from '../../services/rbac.service';
import { isBusinessOwner } from '../../utils/tabAccess';
import { authApi } from '../../api/authApi';

interface StaffRoleLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (session: StaffAccountSession) => void;
  businessName: string;
  businessId: string;
  businessOwnerEmail?: string;
}

export const StaffRoleLoginModal: React.FC<StaffRoleLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  businessName,
  businessId,
  businessOwnerEmail,
}) => {
  const [selectedRole, setSelectedRole] = useState<AppRole>('HOTEL_OWNER');
  const [email, setEmail] = useState('');
  const [pinOrPassword, setPinOrPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const roleOptions: { role: AppRole; title: string; category: string; description: string; badge: string }[] = [
    {
      role: 'HOTEL_OWNER',
      title: 'Business Owner (Restaurant / Hotel / Resort)',
      category: 'Executive & Ownership',
      description: 'Full ownership and administrative authority, role allocations, menu design, guest check-ins, financial controls, and staff management.',
      badge: 'Executive',
    },
    {
      role: 'ADMIN',
      title: 'System Administrator',
      category: 'Governance & Security',
      description: 'Full system maintenance, RBAC role distribution, audit configuration, and complete data management.',
      badge: 'System Admin',
    },
    {
      role: 'MANAGER',
      title: 'General Manager',
      category: 'Operations Management',
      description: 'Manage menus, pricing, customer categories, staff permissions, and front-of-house operations.',
      badge: 'Management',
    },
    {
      role: 'KITCHEN_STAFF',
      title: 'Kitchen Staff & Chef',
      category: 'Kitchen & Fulfillment',
      description: 'View orders, manage recipe prep times, and toggle dish availability (Available / Out of Stock).',
      badge: 'Kitchen & Ops',
    },
    {
      role: 'FRONT_DESK',
      title: 'Front Desk & Reception',
      category: 'Guest Services',
      description: 'Process guest check-ins, room/table reservations, and guest hospitality requests.',
      badge: 'Front Desk',
    },
    {
      role: 'HOUSEKEEPING',
      title: 'Housekeeping Staff',
      category: 'Facility & Cleanliness',
      description: 'Monitor room cleanliness, update inspection logs, and room maintenance status.',
      badge: 'Service',
    },
    {
      role: 'CASHIER',
      title: 'Cashier & Billing Clerk',
      category: 'Finance & Point of Sale',
      description: 'View order summaries, register payments, bill settlements, and receipt generation.',
      badge: 'Billing',
    },
    {
      role: 'WAITER',
      title: 'Waiter & Service Staff',
      category: 'Floor & Delivery',
      description: 'View and claim tables, receive delivery pings, and handle active orders.',
      badge: 'Operations',
    },
    {
      role: 'BAR_STAFF',
      title: 'Bartender & Bar Staff',
      category: 'Kitchen & Preparation',
      description: 'Manage beverage orders, drinks queue, and bar inventory operations.',
      badge: 'Preparation',
    },
  ];

  const handleRoleSelect = (role: AppRole) => {
    setSelectedRole(role);
    setErrorMsg(null);
    if ((role === 'HOTEL_OWNER' || role === 'RESTAURANT_OWNER') && businessOwnerEmail) {
      if (!email) setEmail(businessOwnerEmail);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const enteredEmail = email.trim() || (businessOwnerEmail || `${selectedRole.toLowerCase()}@${businessId}.com`);
    const name = displayName.trim() || enteredEmail.split('@')[0];

    if (!pinOrPassword.trim()) {
      setErrorMsg('Please enter your staff PIN or account password to verify your identity.');
      return;
    }

    setLoading(true);

    try {
      // Call actual backend login to verify credentials and fetch real staff role & allowed_tabs
      const res = await authApi.login({
        email: enteredEmail,
        password: pinOrPassword.trim(),
      });

                  if (res.success && res.data?.user) {
        const user = res.data.user;

        // Check if user belongs to the current business context
        const userBizId = user.business?.id || user.business_id;
        if (userBizId && userBizId !== businessId) {
           setErrorMsg(`This account does not belong to ${businessName}. Please use credentials designated for this specific branch/business.`);
           setLoading(false);
           return;
        }

        const dbRole = (user.role || '').toUpperCase();
        const selRole = selectedRole.toUpperCase();
        
        const match = 
          (dbRole === selRole) ||
          (isBusinessOwner(dbRole) && isBusinessOwner(selRole));

        if (!match) {
           const selectedTitle = roleOptions.find(r => r.role === selectedRole)?.title || selectedRole;
           setErrorMsg(`The credentials do not match with the ${selectedTitle} designation.`);
           return;
        }
        const session: StaffAccountSession = {
          id: user.id,
          role: user.role as AppRole,
          email: user.email,
          name: name.charAt(0).toUpperCase() + name.slice(1),
          authenticatedAt: new Date().toISOString(),
          businessId: user.business?.id || businessId,
          allowed_tabs: user.allowed_tabs,
        };

        // Save to rbac service session state
        rbacService.setCurrentStaffSession(session);
        onSuccess(session);
        onClose();
      } else {
        setErrorMsg('Authentication failed. Please verify credentials.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div 
      id="staff-role-login-modal-overlay" 
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
    >
      <div 
        id="staff-role-login-modal-container" 
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-zinc-200 shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 text-white p-4 sm:p-6 shrink-0 relative">
          <button
            id="btn-close-role-modal"
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 sm:top-5 sm:right-5 text-zinc-400 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition cursor-pointer"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold text-amber-400 block">
                Role-Based Authentication
              </span>
              <h2 className="text-lg sm:text-xl font-extrabold text-white">
                Sign In to Perform Operations
              </h2>
            </div>
          </div>
          <p className="text-xs text-zinc-300 max-w-lg mt-0.5 leading-relaxed">
            Select your assigned role to unlock your operational tools for <strong>{businessName}</strong>.
          </p>
        </div>

        {/* Modal Body - Scrollable Container */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 overscroll-contain">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Role Selection Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-900 uppercase tracking-wide flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                Select Your Assigned Designation
              </label>
              <span className="text-[11px] text-zinc-500 font-medium">
                Scroll to view all roles
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 max-h-52 sm:max-h-60 overflow-y-auto pr-1 p-0.5 border border-zinc-100 rounded-xl bg-zinc-50/50">
              {roleOptions.map((opt) => {
                const isSelected = selectedRole === opt.role;
                return (
                  <div
                    key={opt.role}
                    id={`role-option-${opt.role.toLowerCase()}`}
                    onClick={() => handleRoleSelect(opt.role)}
                    className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all cursor-pointer relative ${
                      isSelected
                        ? 'border-amber-600 bg-amber-50 shadow-xs ring-1 ring-amber-500'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white hover:bg-zinc-50/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="font-bold text-xs text-zinc-900 leading-snug">
                        {opt.title}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                        isSelected ? 'bg-amber-600 text-white' : 'bg-zinc-100 text-zinc-600'
                      }`}>
                        {opt.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1 leading-normal line-clamp-2">
                      {opt.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Credentials Section */}
          <div className="bg-zinc-50 p-3.5 sm:p-4 rounded-xl border border-zinc-200 space-y-3.5">
            <div className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
              Verify Account Credentials for: <span className="text-amber-700">{selectedRole.replace(/_/g, ' ')}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Staff Email / Username
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    id="input-staff-email"
                    type="text"
                    required
                    placeholder="e.g., owner@namasteqr.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs font-medium text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Security PIN / Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    id="input-staff-password"
                    type="password"
                    required
                    placeholder="Enter PIN or password"
                    value={pinOrPassword}
                    onChange={(e) => setPinOrPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs font-medium text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Your Full Name or Staff Tag (Optional)
              </label>
              <input
                id="input-staff-displayname"
                type="text"
                placeholder="e.g., Alex Johnson (Head Chef) or Receptionist"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs font-medium text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-zinc-200 sticky bottom-0 bg-white pb-1">
            <button
              id="btn-cancel-role-login"
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 py-2 text-center cursor-pointer"
            >
              Continue in View-Only Mode
            </button>

            <Button
              id="btn-submit-staff-login"
              type="submit"
              variant="primary"
              size="md"
              disabled={loading}
              className="flex items-center justify-center gap-2"
            >
              <UserCheck className="w-4 h-4" />
              <span>{loading ? 'Authenticating Role...' : `Sign In as ${selectedRole.replace(/_/g, ' ')}`}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
