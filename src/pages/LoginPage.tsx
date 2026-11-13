import React, { useState, useEffect } from 'react';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Input } from '../components/ui/Input';
import { PasswordInput } from '../components/ui/PasswordInput';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { useAuth } from '../context/AuthContext';
import { Mail, ArrowRight, Sparkles } from 'lucide-react';

interface LoginPageProps {
  onNavigate: (route: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login, setPendingVerification } = useAuth();

  const searchParams = new URLSearchParams(window.location.search);
  const isVerifiedParam = searchParams.get('verified') === 'true';
  const queryEmail = searchParams.get('email') || '';

  const [email, setEmail] = useState(queryEmail);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    isVerifiedParam ? 'Account verified successfully! Please enter your password to sign in.' : null
  );
  const [unverifiedState, setUnverifiedState] = useState<{ email: string; phoneE164?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qEmail = params.get('email');
    if (qEmail) {
      setEmail(qEmail);
    }
    if (params.get('verified') === 'true') {
      setSuccessMessage('Account verified successfully! Please enter your password to sign in.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUnverifiedState(null);

    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await login({ email, password, rememberMe });
      if (res.success) {
        onNavigate('/dashboard');
      } else if (res.verificationRequired) {
        setUnverifiedState({ email });
      }
    } catch (err: any) {
      if (err.code === 'ACCOUNT_NOT_VERIFIED') {
        setUnverifiedState({ email, phoneE164: err.data?.phoneE164 });
      } else {
        setError(err.message || 'Invalid email or password. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToVerify = () => {
    if (unverifiedState) {
      setPendingVerification({
        email: unverifiedState.email,
        phoneE164: unverifiedState.phoneE164 || '',
      });
    }
    onNavigate('/verify-email');
  };

  return (
    <AuthLayout
      title="Sign in to your portal"
      subtitle="Access your restaurant, café, and dining operations portal."
      onNavigate={onNavigate}
    >

      {successMessage && (
        <Alert
          type="success"
          message={successMessage}
          onClose={() => setSuccessMessage(null)}
          className="mb-5"
        />
      )}

      {error && (
        <Alert
          type="error"
          message={error}
          onClose={() => setError(null)}
          className="mb-5"
        />
      )}

      {unverifiedState && (
        <div className="mb-5 p-4 rounded-xl bg-amber-50 border border-amber-300 text-sm text-amber-950 space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <Mail className="w-4 h-4 text-amber-700" />
            <span>Email verification required</span>
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">
            Your account exists but your email address has not been verified yet.
          </p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleGoToVerify}
            rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
          >
            Verify Email Address
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Email */}
        <Input
          id="login-email"
          type="email"
          label="Email Address"
          placeholder="owner@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail className="w-4 h-4" />}
          required
        />

        {/* Password */}
        <PasswordInput
          id="login-password"
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {/* Remember me & Forgot Password */}
        <div className="flex items-center justify-between text-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500 accent-amber-600"
            />
            <span className="text-zinc-600">Remember session</span>
          </label>

          <button
            type="button"
            onClick={() => onNavigate('/forgot-password')}
            className="font-medium text-amber-600 hover:text-amber-700 hover:underline focus:outline-none cursor-pointer"
          >
            Forgot password?
          </button>
        </div>

        {/* Submit */}
        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            loadingText="Authenticating..."
            rightIcon={<ArrowRight className="w-4 h-4" />}
            className="w-full"
          >
            Sign In
          </Button>
        </div>

        {/* Register Link */}
        <div className="text-center pt-3 border-t border-zinc-100 mt-6">
          <p className="text-xs text-zinc-500">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => onNavigate('/signup')}
              className="font-semibold text-amber-600 hover:text-amber-700 hover:underline focus:outline-none cursor-pointer"
            >
              Register your business
            </button>
          </p>
        </div>
      </form>
    </AuthLayout>
  );
};
