import React, { useState, useEffect } from 'react';
import { Logo } from '../ui/Logo';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { UserCheck, LogOut, ArrowRight, User, CheckCircle2 } from 'lucide-react';
import { StaffRoleLoginModal } from '../team/StaffRoleLoginModal';
import { rbacService } from '../../services/rbac.service';
import { StaffAccountSession } from '../../types/rbac';

interface NavbarProps {
  onNavigate: (route: string) => void;
  currentRoute: string;
}

export const Navbar: React.FC<NavbarProps> = ({ onNavigate, currentRoute }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [staffSession, setStaffSession] = useState<StaffAccountSession | null>(() => rbacService.getCurrentStaffSession());

  useEffect(() => {
    const handleSessionChange = () => {
      setStaffSession(rbacService.getCurrentStaffSession());
    };
    window.addEventListener('serveflow:staff-session-changed', handleSessionChange);
    return () => {
      window.removeEventListener('serveflow:staff-session-changed', handleSessionChange);
    };
  }, []);

  const currentUserName = staffSession?.name || user?.name || user?.email?.split('@')[0] || 'User';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/80 bg-white/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Logo onClick={() => onNavigate(isAuthenticated ? '/dashboard' : '/')} />

        <div className="hidden md:flex items-center gap-6 text-xs font-semibold text-zinc-500">
          <button
            type="button"
            onClick={() => onNavigate('/#about')}
            className="hover:text-amber-600 transition-colors cursor-pointer"
          >
            About
          </button>
          <span className="text-zinc-300">•</span>
          <button
            type="button"
            onClick={() => onNavigate('/#contact')}
            className="hover:text-amber-600 transition-colors cursor-pointer"
          >
            Contact Us
          </button>
        </div>

        <nav className="flex items-center gap-3">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-2.5">
              {/* User Name & Verified status in place of Franchise box */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs select-none">
                  <User className="w-3.5 h-3.5 text-amber-700" />
                  <span>{currentUserName}</span>
                </span>

                <span 
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs select-none"
                  title="Verified Business Account"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Verified</span>
                </span>
              </div>

              <button
                type="button"
                id="btn-switch-user-navbar"
                onClick={() => setIsRoleModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs transition-colors cursor-pointer"
                title="Switch User / Staff Role"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Switch User</span>
              </button>

              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                leftIcon={<LogOut className="w-3.5 h-3.5 text-zinc-500" />}
                className="text-zinc-600 hover:text-red-600"
              >
                <span className="hidden sm:inline">Sign Out</span>
              </Button>

              <StaffRoleLoginModal
                isOpen={isRoleModalOpen}
                onClose={() => setIsRoleModalOpen(false)}
                onSuccess={(session) => {
                  rbacService.setCurrentStaffSession(session);
                  setIsRoleModalOpen(false);
                }}
                businessName={user?.business?.name || 'ServeFlow'}
                businessId={user?.business?.id || ''}
                businessOwnerEmail={user?.email}
              />
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2.5">
              {currentRoute !== '/login' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate('/login')}
                  className="text-zinc-700 font-semibold"
                >
                  Sign In
                </Button>
              )}
              {currentRoute !== '/signup' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onNavigate('/signup')}
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Create Account
                </Button>
              )}
            </div>
          )}
        </nav>
      </div>
    </header>
  );
};

