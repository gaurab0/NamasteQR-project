import React, { useState, forwardRef } from 'react';
import { Eye, EyeOff, Check, X } from 'lucide-react';

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  showStrengthMeter?: boolean;
  id: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label = 'Password', error, helperText, showStrengthMeter = false, id, className = '', value, onChange, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const passwordStr = typeof value === 'string' ? value : '';

    const requirements = [
      { id: 'len', label: '8+ characters', test: passwordStr.length >= 8 },
      { id: 'upper', label: 'Uppercase letter (A-Z)', test: /[A-Z]/.test(passwordStr) },
      { id: 'lower', label: 'Lowercase letter (a-z)', test: /[a-z]/.test(passwordStr) },
      { id: 'num', label: 'Number (0-9)', test: /[0-9]/.test(passwordStr) },
      { id: 'spec', label: 'Special character (!@#$...)', test: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(passwordStr) },
    ];

    const passedCount = requirements.filter((r) => r.test).length;
    const strengthScore = passwordStr ? Math.min(Math.floor((passedCount / requirements.length) * 100), 100) : 0;

    const getStrengthColor = () => {
      if (passedCount <= 2) return 'bg-red-500';
      if (passedCount <= 4) return 'bg-amber-500';
      return 'bg-emerald-500';
    };

    const getStrengthLabel = () => {
      if (passedCount <= 2) return 'Weak';
      if (passedCount <= 4) return 'Good';
      return 'Strong / Secure';
    };

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <div className="flex items-center justify-between">
            <label htmlFor={id} className="block text-xs font-semibold text-zinc-700">
              {label}
              {props.required && <span className="text-red-500 ml-1">*</span>}
            </label>
          </div>
        )}
        <div className="relative rounded-xl shadow-2xs">
          <input
            id={id}
            ref={ref}
            type={showPassword ? 'text' : 'password'}
            value={value}
            onChange={onChange}
            className={`block w-full rounded-xl border bg-white px-3.5 py-2.5 pr-11 text-sm text-zinc-900 placeholder:text-zinc-400 transition duration-150 focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:bg-zinc-50 disabled:text-zinc-500 ${
              error
                ? 'border-red-400 text-red-900 focus:border-red-500 focus:ring-red-200 bg-red-50/20'
                : 'border-zinc-300 focus:border-amber-500 focus:ring-amber-200 hover:border-zinc-400'
            } ${className}`}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-600 focus:outline-none transition-colors cursor-pointer"
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {error && (
          <p id={`${id}-error`} className="text-xs text-red-600 font-medium mt-1">
            {error}
          </p>
        )}

        {showStrengthMeter && passwordStr.length > 0 && (
          <div className="pt-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Password Strength:</span>
              <span className={`font-semibold ${passedCount === 5 ? 'text-emerald-600' : passedCount >= 3 ? 'text-amber-600' : 'text-red-500'}`}>
                {getStrengthLabel()}
              </span>
            </div>
            <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${getStrengthColor()}`}
                style={{ width: `${strengthScore}%` }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
              {requirements.map((req) => (
                <div key={req.id} className="flex items-center gap-1.5 text-xs">
                  {req.test ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                  )}
                  <span className={req.test ? 'text-zinc-700 font-medium' : 'text-zinc-400'}>{req.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';

