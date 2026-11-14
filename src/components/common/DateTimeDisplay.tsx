import React, { useState, useEffect } from 'react';
import { formatDualDate, DateFormatMode } from '../../utils/dateFormatter';
import { Clock } from 'lucide-react';

interface DateTimeDisplayProps {
  mode?: DateFormatMode;
  timezone?: string;
}

export const DateTimeDisplay: React.FC<DateTimeDisplayProps> = ({ mode = 'ENGLISH' }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const { time12, englishDate, nepaliDate, englishFull, nepaliFull } = formatDualDate(now, mode);

  return (
    <div 
      className="flex items-center gap-1.5 sm:gap-2.5 bg-zinc-100/90 hover:bg-zinc-100 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-zinc-200/70 shadow-2xs transition-colors shrink-0 select-none"
      title={`${englishFull} | ${nepaliFull}`}
    >
      <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 shrink-0" />
      
      {/* 12-hour time and date container: stacked cleanly on mobile, side-by-side on sm+ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 min-w-0">
        <span className="text-[11px] sm:text-xs md:text-sm font-black font-mono text-zinc-900 tracking-tight sm:pr-2 sm:border-r sm:border-zinc-300 leading-none shrink-0">
          {time12}
        </span>

        <div className="flex items-center gap-1 min-w-0 text-[9px] sm:text-xs font-bold text-zinc-700 leading-tight">
          {mode === 'NEPALI' || mode === 'LOCAL' ? (
            <span className="truncate">{nepaliDate}</span>
          ) : mode === 'BOTH' ? (
            <>
              <span className="truncate">{englishDate}</span>
              <span className="text-zinc-400 hidden sm:inline">•</span>
              <span className="truncate hidden sm:inline">{nepaliDate}</span>
            </>
          ) : (
            <span className="truncate">{englishDate}</span>
          )}
        </div>
      </div>
    </div>
  );
};
