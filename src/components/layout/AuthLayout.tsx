import React from 'react';
import { Logo } from '../ui/Logo';
import { ShieldCheck, Mail, Building2, Sparkles, Utensils } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  onNavigate?: (route: string) => void;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  title,
  subtitle,
  onNavigate,
}) => {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col lg:flex-row bg-zinc-50">
      {/* Left Brand & Feature Column (Desktop) */}
      <div className="hidden lg:flex lg:w-5/12 bg-zinc-950 text-white p-12 flex-col justify-between relative overflow-hidden">
        {/* Subtle decorative background pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#d97706_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

        <div className="relative z-10">
          <Logo dark onClick={() => onNavigate?.('/')} />

          <div className="mt-14 space-y-6 max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-400/20 text-amber-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              Unified Hospitality Management
            </div>

            <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Manage your restaurants, cafés, and dining operations with ease.
            </h1>

            <p className="text-zinc-400 text-sm leading-relaxed">
              Complete administrative control, secure email OTP logins, and real-time operational workflows designed for the modern hospitality industry.
            </p>
          </div>
        </div>

        {/* Feature Highlights on Left Column */}
        <div className="relative z-10 space-y-4 pt-8 border-t border-zinc-800/80">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-amber-400 shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-200">Instant Email Verification</h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                Fast, secure OTP verification delivered straight to your inbox.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-amber-400 shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-200">Multi-Property Support</h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                From single boutique cafés to multi-branch restaurant groups.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-amber-400 shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-200">Enterprise Access Control</h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                Role-based permissions with audit logs and active session management.
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-zinc-500 pt-6 border-t border-zinc-800/80">
          <span>© 2026 NamasteQR Inc.</span>
          <span>Security Guaranteed</span>
        </div>
      </div>

      {/* Right Form Container */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 lg:p-12">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 sm:p-10">
          <div className="mb-6 text-center sm:text-left">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs sm:text-sm text-zinc-500 mt-1.5 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>

          {children}
        </div>
      </div>
    </div>
  );
};

