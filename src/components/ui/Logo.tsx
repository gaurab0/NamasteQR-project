import React from 'react';
import { UtensilsCrossed } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  className?: string;
  dark?: boolean;
  onClick?: () => void;
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  showSubtitle = true,
  className = '',
  dark = false,
  onClick,
}) => {
  const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';
  const containerSize = size === 'sm' ? 'p-1.5 rounded-lg' : size === 'lg' ? 'p-2.5 rounded-2xl' : 'p-2 rounded-xl';
  const titleSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <div
      id="serveflow-brand-logo"
      onClick={onClick}
      className={`flex items-center gap-2.5 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      <div
        className={`flex items-center justify-center ${containerSize} transition-transform ${
          dark
            ? 'bg-amber-500 text-zinc-950 shadow-sm ring-1 ring-amber-400/40'
            : 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-500/30'
        }`}
      >
        <UtensilsCrossed className={iconSize} />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-2 leading-none">
          <span
            className={`font-extrabold tracking-tight ${
              dark ? 'text-white' : 'text-zinc-900'
            } ${titleSize}`}
          >
            ServeFlow
          </span>
          <span
            className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded-full ${
              dark
                ? 'text-amber-300 bg-amber-400/10 border border-amber-400/20'
                : 'text-amber-800 bg-amber-50 border border-amber-200'
            }`}
          >
            Portal
          </span>
        </div>
        {showSubtitle && (
          <span
            className={`text-xs font-medium ${
              dark ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            Restaurant & Hotel Management
          </span>
        )}
      </div>
    </div>
  );
};

