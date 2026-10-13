import React, { useState, useEffect } from 'react';
import { AuthLayout } from '../components/layout/AuthLayout';
import { OTPInput } from '../components/ui/OTPInput';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { useAuth } from '../context/AuthContext';
import { Mail, RefreshCw, ArrowRight, ArrowLeft, ShieldCheck } from 'lucide-react';

interface VerifyEmailPageProps {
  onNavigate: (route: string) => void;
}

export const VerifyEmailPage: React.FC<VerifyEmailPageProps> = ({ onNavigate }) => {
  const { pendingVerification, verifyEmail, resendOtp } = useAuth();

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(60);

  const emailDisplay = pendingVerification?.email || 'your registered email';

  // Resend Countdown interval
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleVerify = async (codeToVerify?: string) => {
    const finalOtp = codeToVerify || otp;
    if (finalOtp.length !== 6) {
      setError('Please enter all 6 digits of your verification code');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      await verifyEmail({
        email: pendingVerification?.email,
        phone_e164: pendingVerification?.phoneE164,
        otp: finalOtp,
      });

      const targetEmail = pendingVerification?.email || '';
      setSuccessMsg('Account verified successfully! Please sign in with your credentials...');
      setTimeout(() => {
        onNavigate(`/login?verified=true${targetEmail ? `&email=${encodeURIComponent(targetEmail)}` : ''}`);
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Incorrect verification code. Please check and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setError(null);
    setIsResending(true);

    try {
      const res = await resendOtp();
      setCountdown(res.cooldownSeconds || 60);
      setSuccessMsg('A new verification code has been dispatched to your email.');
      setOtp('');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Unable to resend OTP. Please try again in a few moments.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthLayout
      title="Verify your account"
      subtitle="Enter the 6-digit security code sent to activate your business portal."
      onNavigate={onNavigate}
    >
      <div className="text-center space-y-5">
        {/* Verification Badges */}
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100 text-amber-700 mx-auto shadow-2xs">
          <Mail className="w-6 h-6" />
        </div>

        <div className="space-y-1.5">
          <p className="text-xs sm:text-sm text-zinc-600">
            A 6-digit verification code was dispatched to:
          </p>
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200/80 rounded-full text-xs font-semibold">
              <Mail className="w-3.5 h-3.5 text-amber-700" />
              {emailDisplay}
            </span>
          </div>
          <p className="text-xs text-zinc-500 pt-1">
            Enter the 6-digit code below to activate your business portal.
          </p>
        </div>



        {error && (
          <Alert
            type="error"
            message={error}
            onClose={() => setError(null)}
            className="text-left"
          />
        )}

        {successMsg && (
          <Alert
            type="success"
            message={successMsg}
            className="text-left"
          />
        )}

        {/* 6-Digit OTP Input Boxes */}
        <div className="py-1">
          <OTPInput
            value={otp}
            onChange={(val) => {
              setOtp(val);
              if (error) setError(null);
            }}
            onComplete={(fullCode) => handleVerify(fullCode)}
            disabled={isLoading}
            hasError={!!error}
          />
        </div>

        {/* Submit Verification Button */}
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={() => handleVerify()}
          isLoading={isLoading}
          loadingText="Verifying security code..."
          disabled={otp.length !== 6}
          rightIcon={<ArrowRight className="w-4 h-4" />}
          className="w-full"
        >
          Verify & Continue
        </Button>

        {/* Countdown / Resend Section */}
        <div className="pt-4 border-t border-zinc-100 space-y-3">
          <div className="text-xs text-zinc-500">
            {countdown > 0 ? (
              <p>
                Resend security code in <span className="font-semibold text-zinc-900 font-mono">{countdown} seconds</span>
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-zinc-600">Didn't receive the email?</p>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isResending}
                  className="inline-flex items-center gap-1.5 font-semibold text-amber-600 hover:text-amber-700 hover:underline text-xs focus:outline-none cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
                  Resend Verification Code
                </button>
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => onNavigate('/signup')}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" />
              Edit registration details
            </button>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
};
