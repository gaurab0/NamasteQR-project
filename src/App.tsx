import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PrinterProvider } from './contexts/PrinterContext';
import { Navbar } from './components/layout/Navbar';
import { LandingPage } from './pages/LandingPage';
import { SignupPage } from './pages/SignupPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { MenuManagementPage } from './pages/MenuManagementPage';
import { CustomerMenuPreviewPage } from './pages/CustomerMenuPreviewPage';
import { BookDemoModal } from './components/landing/BookDemoModal';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { clearGoogleTranslateCookie } from './utils/googleTranslate';

function AppContent() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname || '/';
  });

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const nextPath = window.location.pathname || '/';
      const isGuestCustomerSession = !isAuthenticated && Boolean(
        sessionStorage.getItem('serveflow_customer_table_session') ||
        sessionStorage.getItem('serveflow_customer_active')
      );
      // If unauthenticated customer dining session is active and popstate tries to jump back to admin or auth pages, trap them safely on /menu
      if (
        isGuestCustomerSession &&
        (nextPath.startsWith('/dashboard') ||
          nextPath.startsWith('/menu-management') ||
          nextPath === '/login' ||
          nextPath === '/signup')
      ) {
        window.history.pushState({}, '', '/menu');
        setCurrentPath('/menu');
        return;
      }
      setCurrentPath(nextPath);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAuthenticated]);

  // When an authenticated staff/admin is logged in, ensure customer lock flags are purged
  useEffect(() => {
    if (isAuthenticated) {
      try {
        sessionStorage.removeItem('serveflow_customer_active');
      } catch {}
    }
  }, [isAuthenticated, currentPath]);

  const navigate = (path: string) => {
    if (isAuthenticated && (path.startsWith('/dashboard') || path.startsWith('/menu-management'))) {
      try {
        sessionStorage.removeItem('serveflow_customer_active');
        sessionStorage.removeItem('serveflow_customer_table_session');
      } catch {}
    }
    if (path.startsWith('/#')) {
      const targetId = path.substring(2);
      if (currentPath !== '/') {
        window.history.pushState({}, '', '/');
        setCurrentPath('/');
        setTimeout(() => {
          const el = document.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
          }
        }, 150);
      } else {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }
      return;
    }

    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Route protection guards
  useEffect(() => {
    if (isLoading) return;

    const basePath = currentPath.split('?')[0];
    if (basePath.startsWith('/t/')) return;
    if (!isAuthenticated && (basePath.startsWith('/dashboard') || basePath.startsWith('/menu-management'))) {
      navigate('/login');
    } else if (isAuthenticated && (basePath === '/login' || basePath === '/signup')) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, isLoading, currentPath]);

  const isCustomerMenuRoute =
    currentPath.startsWith('/menu') ||
    currentPath.startsWith('/menu-preview') ||
    currentPath.startsWith('/t/');
  const isDashboardRoute = currentPath.startsWith('/dashboard');

  // Prevent Google Translate from translating admin/staff routes
  useEffect(() => {
    if (!isCustomerMenuRoute) {
      clearGoogleTranslateCookie();
    }
  }, [isCustomerMenuRoute]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 text-zinc-900">
        <Loader2 className="w-7 h-7 animate-spin text-amber-600 mb-3" />
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Restoring NamasteQR Session...</p>
      </div>
    );
  }

  // Parse Reset Password route: /reset-password/:token
  if (currentPath.startsWith('/reset-password/')) {
    const parts = currentPath.split('/');
    const tokenAndQuery = parts.slice(2).join('/');
    const [token, queryStr] = tokenAndQuery.split('?');
    const params = new URLSearchParams(queryStr || window.location.search);
    const email = params.get('email') || '';

    return (
      <div className="min-h-screen flex flex-col bg-zinc-50">
        <Navbar onNavigate={navigate} currentRoute={currentPath} onBookDemo={() => setIsDemoModalOpen(true)} />
        <main className="flex-1">
          <ErrorBoundary onReset={() => navigate('/login')}>
            <ResetPasswordPage
              token={token || ''}
              initialEmail={email}
              onNavigate={navigate}
            />
          </ErrorBoundary>
        </main>
        <BookDemoModal
          isOpen={isDemoModalOpen}
          onClose={() => setIsDemoModalOpen(false)}
        />
      </div>
    );
  }

  // Render matching view with strict synchronous route protection
  const renderCurrentView = () => {
    const basePath = currentPath.split('?')[0];

    // Short table QR URL (/t/:tableId)
    if (basePath.startsWith('/t/')) {
      return <CustomerMenuPreviewPage onNavigate={navigate} />;
    }

    // 1. GUEST LOCK: If an UNAUTHENTICATED customer is dining at a table or active in customer mode, lock strictly to /menu (prevent accidental backdoors into admin or auth)
    const isGuestCustomerSession = !isAuthenticated && Boolean(
      sessionStorage.getItem('serveflow_customer_table_session') ||
      sessionStorage.getItem('serveflow_customer_active')
    );
    if (
      isGuestCustomerSession &&
      (basePath.startsWith('/dashboard') ||
        basePath.startsWith('/menu-management') ||
        basePath === '/login' ||
        basePath === '/signup')
    ) {
      return <CustomerMenuPreviewPage onNavigate={navigate} />;
    }

    switch (basePath) {
      case '/signup':
        return <SignupPage onNavigate={navigate} />;
      case '/verify-email':
        return <VerifyEmailPage onNavigate={navigate} />;
      case '/login':
        return <LoginPage onNavigate={navigate} />;
      case '/forgot-password':
        return <ForgotPasswordPage onNavigate={navigate} />;
      case '/menu-management':
        // Synchronous auth guard: Never render admin panel to unauthorized guests
        if (!isAuthenticated) {
          return <LandingPage onNavigate={navigate} onBookDemo={() => setIsDemoModalOpen(true)} />;
        }
        return (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <MenuManagementPage userRole={user?.role} onNavigate={navigate} />
          </div>
        );
      case '/menu-preview':
      case '/menu':
        return <CustomerMenuPreviewPage onNavigate={navigate} />;
      case '/dashboard':
        // Synchronous auth guard: Never render admin panel to unauthorized guests
        if (!isAuthenticated) {
          return <LandingPage onNavigate={navigate} onBookDemo={() => setIsDemoModalOpen(true)} />;
        }
        return <DashboardPage onNavigate={navigate} />;
      case '/':
      default:
        if (isAuthenticated) {
          return <DashboardPage onNavigate={navigate} />;
        }
        return <LandingPage onNavigate={navigate} onBookDemo={() => setIsDemoModalOpen(true)} />;
    }
  };

  return (
    <div className={`min-h-screen flex flex-col bg-zinc-50 ${!isCustomerMenuRoute ? 'notranslate' : ''}`}>
      {!isCustomerMenuRoute && !isDashboardRoute && (
        <Navbar
          onNavigate={navigate}
          currentRoute={currentPath}
          onBookDemo={() => setIsDemoModalOpen(true)}
        />
      )}
      <main className="flex-1">
        <ErrorBoundary onReset={() => navigate(isAuthenticated ? '/dashboard' : '/login')}>
          {renderCurrentView()}
        </ErrorBoundary>
      </main>
      <BookDemoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PrinterProvider>
        <AppContent />
      </PrinterProvider>
    </AuthProvider>
  );
}
