import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  description?: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: Option[];
  id: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, id, className = '', ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={id} className="block text-xs font-semibold text-zinc-700">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative rounded-xl shadow-2xs">
          <select
            id={id}
            ref={ref}
            className={`block w-full appearance-none rounded-xl border bg-white px-3.5 py-2.5 pr-10 text-sm text-zinc-900 transition duration-150 focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:bg-zinc-50 disabled:text-zinc-500 cursor-pointer ${
              error
                ? 'border-red-400 text-red-900 focus:border-red-500 focus:ring-red-200 bg-red-50/20'
                : 'border-zinc-300 focus:border-amber-500 focus:ring-amber-200 hover:border-zinc-400'
            } ${className}`}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} {opt.description ? `(${opt.description})` : ''}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-400">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
        {error ? (
          <p id={`${id}-error`} className="text-xs text-red-600 font-medium mt-1">
            {error}
          </p>
        ) : helperText ? (
          <p id={`${id}-helper`} className="text-xs text-zinc-500 mt-1">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = 'Select';

