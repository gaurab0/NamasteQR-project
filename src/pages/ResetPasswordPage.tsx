import React, { useState } from 'react';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Input } from '../components/ui/Input';
import { PasswordInput } from '../components/ui/PasswordInput';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { authApi } from '../api/authApi';
import { Mail, CheckCircle2, ArrowRight } from 'lucide-react';

interface ResetPasswordPageProps {
  token: string;
  initialEmail?: string;
  onNavigate: (route: string) => void;
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({
  token,
  initialEmail = '',
  onNavigate,
}) => {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please provide a valid email address.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must contain uppercase, lowercase, and numeric characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.resetPassword({
        token,
        email,
        password,
        confirmPassword,
      });
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create new password"
      subtitle="Choose a strong, secure password for your business portal."
      onNavigate={onNavigate}
    >
      {isSuccess ? (
        <div className="text-center space-y-4 py-4">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center mx-auto shadow-2xs">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>

          <div>
            <h3 className="text-xl font-bold text-zinc-900">Password Updated</h3>
            <p className="text-xs sm:text-sm text-zinc-600 mt-1">
              Your credentials have been securely refreshed. You may now sign in to your business portal.
            </p>
          </div>

          <Button
            variant="primary"
            size="lg"
            onClick={() => onNavigate('/login')}
            rightIcon={<ArrowRight className="w-4 h-4" />}
            className="w-full"
          >
            Continue to Sign In
          </Button>
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
            id="reset-email"
            type="email"
            label="Account Email Address"
            placeholder="owner@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="w-4 h-4" />}
            required
          />

          <PasswordInput
            id="new-password"
            label="New Password"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            showStrengthMeter
            required
          />

          <PasswordInput
            id="confirm-new-password"
            label="Confirm New Password"
            placeholder="Re-enter your new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              loadingText="Updating password..."
              rightIcon={<ArrowRight className="w-4 h-4" />}
              className="w-full"
            >
              Reset Password
            </Button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};
