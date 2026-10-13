import React, { useState, useEffect } from 'react';
import { formatDualDate, DateFormatMode } from '../../utils/dateFormatter';
import { Clock } from 'lucide-react';

interface DateTimeDisplayProps {
  mode?: DateFormatMode;
}

export const DateTimeDisplay: React.FC<DateTimeDisplayProps> = ({ mode = 'ENGLISH' }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const { time12, englishDate, nepaliDate } = formatDualDate(now, mode);

  return (
    <div className="flex items-center gap-2.5 sm:gap-3 bg-zinc-100/90 hover:bg-zinc-100 px-3.5 py-1.5 rounded-xl border border-zinc-200/70 shadow-2xs transition-colors">
      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
      
      {/* 12-hour time format kept only before the dates */}
      <span className="text-xs sm:text-sm font-black font-mono text-zinc-900 tracking-tight shrink-0 pr-2.5 border-r border-zinc-300">
        {time12}
      </span>

      {/* Nav bar dates: both dates are in Bold and same styled */}
      <div className="flex flex-col justify-center">
        {(mode === 'ENGLISH' || mode === 'BOTH') && (
          <span className="text-[11px] sm:text-xs font-bold text-zinc-800 tracking-tight leading-tight">
            {englishDate}
          </span>
        )}
        {(mode === 'NEPALI' || mode === 'BOTH') && (
          <span className="text-[11px] sm:text-xs font-bold text-zinc-800 tracking-tight leading-tight">
            {nepaliDate} (BS)
          </span>
        )}
      </div>
    </div>
  );
};
