import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { countryCodes } from '../../utils/countryCodes';

interface PhoneNumberInputProps {
  countryCode: string;
  phoneNumber: string;
  onCountryCodeChange: (code: string) => void;
  onPhoneNumberChange: (phone: string) => void;
  error?: string;
  label?: string;
  id?: string;
  required?: boolean;
}

export const PhoneNumberInput: React.FC<PhoneNumberInputProps> = ({
  countryCode,
  phoneNumber,
  onCountryCodeChange,
  onPhoneNumberChange,
  error,
  label = 'Contact Phone Number',
  id = 'phone-number',
  required = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedCountry =
    countryCodes.find((c) => c.dialCode === countryCode) || countryCodes[0];

  const filteredCountries = countryCodes.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.dialCode.includes(search) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only keep numeric digits and spaces
    const cleaned = e.target.value.replace(/[^0-9\s]/g, '');
    onPhoneNumberChange(cleaned);
  };

  return (
    <div className="w-full space-y-1.5" ref={dropdownRef}>
      {label && (
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="block text-xs font-semibold text-zinc-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        </div>
      )}

      <div className="relative flex rounded-xl shadow-2xs">
        {/* Country Code Trigger */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="relative inline-flex items-center gap-1.5 px-3 py-2.5 rounded-l-xl border border-r-0 border-zinc-300 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors shrink-0 cursor-pointer"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span className="text-base leading-none">{selectedCountry.flag}</span>
          <span className="font-semibold text-zinc-800">{selectedCountry.dialCode}</span>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
        </button>

        {/* Phone Number Input */}
        <input
          id={id}
          type="tel"
          value={phoneNumber}
          onChange={handlePhoneInputChange}
          placeholder="9851170688"
          className={`block w-full rounded-r-xl border bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition duration-150 focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:bg-zinc-50 ${
            error
              ? 'border-red-400 text-red-900 focus:border-red-500 focus:ring-red-200 bg-red-50/20'
              : 'border-zinc-300 focus:border-amber-500 focus:ring-amber-200 hover:border-zinc-400'
          }`}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${id}-error` : undefined}
          required={required}
        />

        {/* Country Code Dropdown Menu */}
        {isOpen && (
          <div className="absolute top-full left-0 z-50 mt-1.5 w-72 max-h-60 overflow-auto rounded-xl bg-white p-2 shadow-xl border border-zinc-200 focus:outline-none animate-in fade-in zoom-in-95 duration-100">
            <div className="p-1 pb-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country..."
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-800 focus:outline-none focus:border-amber-500 focus:bg-white"
                autoFocus
              />
            </div>
            <div className="space-y-0.5">
              {filteredCountries.map((c) => (
                <button
                  key={`${c.code}-${c.dialCode}`}
                  type="button"
                  onClick={() => {
                    onCountryCodeChange(c.dialCode);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
                    c.dialCode === countryCode
                      ? 'bg-amber-50 text-amber-900 font-semibold'
                      : 'text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{c.flag}</span>
                    <span className="truncate">{c.name}</span>
                  </div>
                  <span className={`font-mono text-xs ${c.dialCode === countryCode ? 'text-amber-700' : 'text-zinc-500'}`}>
                    {c.dialCode}
                  </span>
                </button>
              ))}
              {filteredCountries.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-zinc-400">
                  No countries found
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p id={`${id}-error`} className="text-xs text-red-600 font-medium mt-1">
          {error}
        </p>
      )}
      <p className="text-[11px] text-zinc-500">
        E.164 standard format: <span className="font-mono font-medium text-zinc-700">{countryCode}{phoneNumber.replace(/\s+/g, '') || '__________'}</span>
      </p>
    </div>
  );
};

