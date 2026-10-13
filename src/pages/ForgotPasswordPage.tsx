import React, { useState } from 'react';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { authApi } from '../api/authApi';
import { Mail, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';

interface ForgotPasswordPageProps {
  onNavigate: (route: string) => void;
}

export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [devResetLink, setDevResetLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    try {
      const res = await authApi.forgotPassword(email);
      setSubmitted(true);
      if (res.data?.devResetLink) {
        setDevResetLink(res.data.devResetLink);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your account email to receive a password reset link."
      onNavigate={onNavigate}
    >
      {submitted ? (
        <div className="space-y-5">
          <Alert
            type="success"
            title="Instructions Dispatched"
            message="If an account exists with this email address, you will receive password-reset instructions."
          />

          {devResetLink && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-950 space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>[DEV MODE] Password Reset Link:</span>
              </div>
              <p className="text-amber-800 font-mono text-[11px] break-all bg-white p-2.5 rounded-lg border border-amber-200">
                {devResetLink}
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onNavigate(devResetLink)}
                rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
              >
                Proceed to Reset Form
              </Button>
            </div>
          )}

          <div className="text-center pt-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => onNavigate('/login')}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
              className="w-full"
            >
              Back to Sign In
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <Alert
              type="error"
              message={error}
              onClose={() => setError(null)}
            />
          )}

          <Input
            id="forgot-email"
            type="email"
            label="Account Email Address"
            placeholder="owner@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="w-4 h-4" />}
            helperText="We will send a cryptographically secure single-use reset link."
            required
          />

          <div className="pt-2 space-y-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              loadingText="Sending link..."
              rightIcon={<ArrowRight className="w-4 h-4" />}
              className="w-full"
            >
              Send Reset Link
            </Button>

            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="w-full py-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 flex items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Sign In
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};
