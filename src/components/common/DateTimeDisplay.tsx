import React, { useState, useEffect } from 'react';
import { formatLocalizedDate, DateFormatMode } from '../../utils/dateFormatter';
import { Clock } from 'lucide-react';

interface DateTimeDisplayProps {
  mode?: DateFormatMode;
  timezone?: string;
}

export const DateTimeDisplay: React.FC<DateTimeDisplayProps> = ({ mode = 'ENGLISH', timezone }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const { localTime12, standardDate, localDate, timezoneLabel, standardFull, localFull } = formatLocalizedDate(now, timezone, mode);

  return (
    <div 
      className="flex items-center gap-1.5 sm:gap-2.5 bg-zinc-100/90 hover:bg-zinc-100 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-zinc-200/70 shadow-2xs transition-colors shrink-0 select-none"
      title={`${standardFull} | ${localFull}`}
    >
      <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 shrink-0" />
      
      {/* 12-hour time and date container: stacked cleanly on mobile, side-by-side on sm+ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 min-w-0">
        <span className="text-[11px] sm:text-xs md:text-sm font-black font-mono text-zinc-900 tracking-tight sm:pr-2 sm:border-r sm:border-zinc-300 leading-none shrink-0">
          {localTime12}
        </span>

        <div className="flex items-center gap-1 min-w-0 text-[9px] sm:text-xs font-bold text-zinc-700 leading-tight">
          {mode === 'LOCAL' || mode === 'NEPALI' ? (
            <span className="truncate">{localDate} {timezoneLabel}</span>
          ) : mode === 'BOTH' ? (
            <>
              <span className="truncate">{standardDate}</span>
              {timezoneLabel && <span className="text-zinc-500 font-normal hidden sm:inline">{timezoneLabel}</span>}
            </>
          ) : (
            <span className="truncate">{standardDate}</span>
          )}
        </div>
      </div>
    </div>
  );
};
