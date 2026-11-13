import React, { useState } from 'react';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Input } from '../components/ui/Input';
import { PasswordInput } from '../components/ui/PasswordInput';
import { PhoneNumberInput } from '../components/ui/PhoneNumberInput';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { useAuth } from '../context/AuthContext';
import { BusinessType, SignupFormData } from '../types/auth';
import { Building2, Mail, Lock, ArrowRight, MapPin } from 'lucide-react';

interface SignupPageProps {
  onNavigate: (route: string) => void;
}

export const SignupPage: React.FC<SignupPageProps> = ({ onNavigate }) => {
  const { signup } = useAuth();

  const [formData, setFormData] = useState<SignupFormData>({
    businessName: '',
    businessType: 'RESTAURANT',
    address: '',
    email: '',
    countryCode: '+977',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const businessTypeOptions = [
    { value: 'RESTAURANT', label: 'Restaurant', description: 'Dine-in, casual, fine dining' },
    { value: 'CAFE', label: 'Café & Bakery', description: 'Coffee shop, bakery, bistro' },
    { value: 'BAR', label: 'Bar & Lounge', description: 'Pub, lounge, nightlife' },
    { value: 'OTHER', label: 'Other', description: 'Food truck, cloud kitchen, catering' },
  ];

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};

    if (!formData.businessName.trim() || formData.businessName.trim().length < 2) {
      errs.businessName = 'Business name must be at least 2 characters';
    } else if (formData.businessName.length > 100) {
      errs.businessName = 'Business name cannot exceed 100 characters';
    }

    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errs.email = 'Please enter a valid email address';
    }

    const cleanPhone = formData.phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 6 || cleanPhone.length > 15) {
      errs.phoneNumber = 'Please enter a valid phone number (6-15 digits)';
    }

    if (!formData.password) {
      errs.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errs.password = 'Password must be at least 8 characters';
    } else if (!/[A-Z]/.test(formData.password)) {
      errs.password = 'Password must contain at least one uppercase letter (A-Z)';
    } else if (!/[a-z]/.test(formData.password)) {
      errs.password = 'Password must contain at least one lowercase letter (a-z)';
    } else if (!/[0-9]/.test(formData.password)) {
      errs.password = 'Password must contain at least one number (0-9)';
    } else if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(formData.password)) {
      errs.password = 'Password must contain at least one special character';
    }

    if (formData.password !== formData.confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }

    if (!formData.termsAccepted) {
      errs.termsAccepted = 'You must accept the Terms of Service & Privacy Policy';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const res = await signup(formData);
      if (res.success && res.verificationRequired) {
        onNavigate('/verify-email');
      }
    } catch (err: any) {
      setServerError(err.message || 'Failed to create business account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your business account"
      subtitle="Join restaurants, cafés, and dining venues using NamasteQR for modern order management."
      onNavigate={onNavigate}
    >
      {serverError && (
        <Alert
          type="error"
          message={serverError}
          onClose={() => setServerError(null)}
          className="mb-5"
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Business Name */}
        <Input
          id="business-name"
          label="Company / Business Name"
          placeholder="e.g. Namaste Bistro"
          value={formData.businessName}
          onChange={(e) => {
            setFormData({ ...formData, businessName: e.target.value });
            if (errors.businessName) setErrors({ ...errors, businessName: '' });
          }}
          error={errors.businessName}
          leftIcon={<Building2 className="w-4 h-4" />}
          required
        />

        {/* Business Type */}
        <Select
          id="business-type"
          label="Business Type"
          options={businessTypeOptions}
          value={formData.businessType}
          onChange={(e) => setFormData({ ...formData, businessType: e.target.value as BusinessType })}
          required
        />

        {/* Business Address */}
        <Input
          id="business-address"
          label="Business Address / Location (Optional)"
          placeholder="e.g. Lakeside Ward 6, Pokhara"
          value={formData.address || ''}
          onChange={(e) => {
            setFormData({ ...formData, address: e.target.value });
          }}
          leftIcon={<MapPin className="w-4 h-4" />}
        />

        {/* Email Address */}
        <Input
          id="signup-email"
          type="email"
          label="Owner Email Address"
          placeholder="owner@example.com"
          value={formData.email}
          onChange={(e) => {
            setFormData({ ...formData, email: e.target.value });
            if (errors.email) setErrors({ ...errors, email: '' });
          }}
          error={errors.email}
          leftIcon={<Mail className="w-4 h-4" />}
          required
        />

        {/* International Phone */}
        <PhoneNumberInput
          id="signup-phone"
          countryCode={formData.countryCode}
          phoneNumber={formData.phoneNumber}
          onCountryCodeChange={(code) => setFormData({ ...formData, countryCode: code })}
          onPhoneNumberChange={(phone) => {
            setFormData({ ...formData, phoneNumber: phone });
            if (errors.phoneNumber) setErrors({ ...errors, phoneNumber: '' });
          }}
          error={errors.phoneNumber}
          required
        />

        {/* Password */}
        <PasswordInput
          id="signup-password"
          label="Create Password"
          placeholder="Min. 8 characters"
          value={formData.password}
          onChange={(e) => {
            setFormData({ ...formData, password: e.target.value });
            if (errors.password) setErrors({ ...errors, password: '' });
          }}
          error={errors.password}
          showStrengthMeter
          required
        />

        {/* Confirm Password */}
        <PasswordInput
          id="signup-confirm-password"
          label="Confirm Password"
          placeholder="Re-enter your password"
          value={formData.confirmPassword}
          onChange={(e) => {
            setFormData({ ...formData, confirmPassword: e.target.value });
            if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
          }}
          error={errors.confirmPassword}
          required
        />

        {/* Terms and Privacy Checkboxes */}
        <div className="pt-1">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              id="terms-accepted-checkbox"
              checked={formData.termsAccepted}
              onChange={(e) => {
                setFormData({ ...formData, termsAccepted: e.target.checked });
                if (errors.termsAccepted) setErrors({ ...errors, termsAccepted: '' });
              }}
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500 accent-amber-600"
            />
            <span className="text-xs text-zinc-600 leading-relaxed">
              I agree to the{' '}
              <span className="font-semibold text-zinc-900 underline cursor-pointer">Terms & Conditions</span> and{' '}
              <span className="font-semibold text-zinc-900 underline cursor-pointer">Privacy Policy</span>. I agree to receive verification codes via email.
            </span>
          </label>
          {errors.termsAccepted && (
            <p className="text-xs text-red-600 font-medium mt-1">{errors.termsAccepted}</p>
          )}
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            loadingText="Transmitting verification code..."
            rightIcon={<ArrowRight className="w-4 h-4" />}
            className="w-full"
          >
            Create Business Account
          </Button>
        </div>

        {/* Login Link */}
        <div className="text-center pt-3 border-t border-zinc-100 mt-6">
          <p className="text-xs text-zinc-500">
            Already registered?{' '}
            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="font-semibold text-amber-600 hover:text-amber-700 hover:underline focus:outline-none cursor-pointer"
            >
              Sign In
            </button>
          </p>
        </div>
      </form>
    </AuthLayout>
  );
};
