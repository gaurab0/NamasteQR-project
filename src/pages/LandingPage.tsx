import React from 'react';
import { Button } from '../components/ui/Button';
import { 
  UtensilsCrossed, 
  ShieldCheck, 
  Mail, 
  ArrowRight, 
  CheckCircle2, 
  ChefHat, 
  QrCode, 
  Sparkles, 
  Hotel, 
  Coffee, 
  Store, 
  Wine,
  Lock,
  Layers,
  Zap,
  Building2,
  Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Footer } from '../components/layout/Footer';

interface LandingPageProps {
  onNavigate: (route: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const { isAuthenticated, user } = useAuth();

  const businessTypes = [
    { icon: <ChefHat className="w-5 h-5 text-amber-600" />, label: 'Fine Dining & Bistros' },
    { icon: <Hotel className="w-5 h-5 text-amber-600" />, label: 'Hotels & Luxury Resorts' },
    { icon: <Coffee className="w-5 h-5 text-amber-600" />, label: 'Artisan Cafés & Bakeries' },
    { icon: <Wine className="w-5 h-5 text-amber-600" />, label: 'Wine Bars & Lounges' },
    { icon: <Store className="w-5 h-5 text-amber-600" />, label: 'Boutique Food Outlets' },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28 bg-gradient-to-b from-amber-500/10 via-zinc-50 to-zinc-50 border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          {/* Eyebrow Tag */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-semibold mb-6 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-700" />
            <span>Hospitality Management & Authentication Core</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-zinc-900 max-w-4xl mx-auto leading-tight">
            The modern operating system for <span className="text-amber-600">restaurants & hotels</span>.
          </h1>

          <p className="mt-6 text-base sm:text-lg text-zinc-600 max-w-2xl mx-auto leading-relaxed">
            Register verified venue credentials with instant email OTP verification. Purpose-built for single venues, multi-property hotels, and growing restaurant groups.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
            {isAuthenticated && user ? (
              <Button
                variant="primary"
                size="lg"
                onClick={() => onNavigate('/dashboard')}
                rightIcon={<ArrowRight className="w-4 h-4" />}
                className="w-full sm:w-auto"
              >
                Go to Dashboard ({user.business.name})
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => onNavigate('/signup')}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                  className="w-full sm:w-auto"
                >
                  Create Business Account
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => onNavigate('/login')}
                  className="w-full sm:w-auto"
                >
                  Sign In
                </Button>
              </>
            )}
          </div>

          {/* Quick Credential Highlights */}
          <div className="mt-12 pt-8 border-t border-zinc-200/80 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs font-medium text-zinc-600">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Instant Email OTP Verification
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Relational Schema & Audit Logs
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Multi-Role Access Control
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Secure Cookie Sessions
            </span>
          </div>
        </div>
      </section>

      {/* Target Audiences / Venues */}
      <section className="py-12 bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              Engineered For Distinctive Hospitality Venues
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {businessTypes.map((b, i) => (
              <div
                key={i}
                className="flex flex-col items-center justify-center p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-center hover:border-amber-400 hover:bg-amber-50/40 transition-colors"
              >
                <div className="p-2.5 rounded-lg bg-white shadow-2xs border border-zinc-200 mb-2">
                  {b.icon}
                </div>
                <span className="text-xs font-semibold text-zinc-800">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">
            Enterprise Security & Frictionless Onboarding
          </h2>
          <p className="text-zinc-600 text-sm sm:text-base mt-2">
            Every business account is validated through secure email verification to guarantee genuine owners and protect digital ordering assets.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-white border border-zinc-200 shadow-2xs hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
              <Mail className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 mb-2">Instant Email OTP Security</h3>
            <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
              Sends cryptographically random 6-digit verification codes directly to the owner's email address. Backed by rate limiters, 5-minute expiry, and hashed persistence.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-zinc-200 shadow-2xs hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mb-4">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 mb-2">Google Firebase Cloud Core</h3>
            <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
              Managed Firestore schema separating businesses, multi-role staff, phone verifications, and live audit trails. Scalable for multi-venue chains and staff roles.
            </p>

          </div>

          <div className="p-6 rounded-2xl bg-white border border-zinc-200 shadow-2xs hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-4">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 mb-2">Encrypted Session Security</h3>
            <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
              Secure cookie sessions with Argon2/bcrypt password hashing, sliding-window rate limiters across all auth endpoints, and seamless session restoration.
            </p>
          </div>
        </div>
      </section>

      {/* Phase 2 Roadmap Section */}
      <section className="py-16 bg-zinc-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-10">
            <div className="space-y-3 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold">
                <Zap className="w-3.5 h-3.5" /> Next Release
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Full-Service Menu, QR & Dining Operations
              </h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Once onboarded, your portal will support food catalogs, item modifiers, contactless table QR dining, live kitchen display status, and real-time sales reporting.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full lg:w-auto">
              <div className="p-4 rounded-xl bg-zinc-800/80 border border-zinc-700">
                <ChefHat className="w-5 h-5 text-amber-400 mb-2" />
                <div className="text-sm font-semibold text-white">Menu Builder</div>
                <div className="text-xs text-zinc-400">Categories & modifiers</div>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/80 border border-zinc-700">
                <QrCode className="w-5 h-5 text-amber-400 mb-2" />
                <div className="text-sm font-semibold text-white">Table QR Codes</div>
                <div className="text-xs text-zinc-400">Contactless ordering</div>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/80 border border-zinc-700">
                <UtensilsCrossed className="w-5 h-5 text-amber-400 mb-2" />
                <div className="text-sm font-semibold text-white">Kitchen Display (KDS)</div>
                <div className="text-xs text-zinc-400">Live ticket routing</div>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/80 border border-zinc-700">
                <ShieldCheck className="w-5 h-5 text-amber-400 mb-2" />
                <div className="text-sm font-semibold text-white">Staff Roles</div>
                <div className="text-xs text-zinc-400">Granular permissions</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer with About & Contact Us Info */}
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

