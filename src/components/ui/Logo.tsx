import React from 'react';
import namasteQrIcon from '../../assets/namasteqr-icon.png';

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
  const iconSize = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9';
  const titleSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <div
      id="namasteqr-brand-logo"
      onClick={onClick}
      className={`flex items-center gap-2.5 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      <img
        src={namasteQrIcon}
        alt="NamasteQR"
        className={`${iconSize} object-contain shrink-0 transition-transform`}
      />
      <div className="flex flex-col">
        <div className="flex items-center gap-2 leading-none">
          <span
            className={`font-black tracking-tight ${
              dark ? 'text-white' : 'text-zinc-950'
            } ${titleSize}`}
          >
            Namaste<span className="text-blue-600">QR</span>
          </span>
          <span
            className={`inline-block px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full ${
              dark
                ? 'text-blue-300 bg-blue-500/20 border border-blue-400/30'
                : 'text-blue-700 bg-blue-50 border border-blue-200'
            }`}
          >
            Portal
          </span>
        </div>
        {showSubtitle && (
          <span
            className={`text-xs font-semibold ${
              dark ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            Restaurant & Dining Management
          </span>
        )}
      </div>
    </div>
  );
};

