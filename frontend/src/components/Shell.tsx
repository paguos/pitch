import { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function getLocalTzLabel(d: Date): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(d);
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    return tz.toUpperCase();
  } catch {
    return '';
  }
}

export function Shell({ children }: { children: ReactNode }) {
  const [hhmm, setHhmm] = useState<string>('');
  const [stamp, setStamp] = useState<string>('');
  const [tz, setTz] = useState<string>('');

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setHhmm(
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }),
      );
      setStamp(`${WEEKDAYS[d.getDay()]} ${pad(d.getDate())} ${MONTHS[d.getMonth()]}`);
      setTz(getLocalTzLabel(d));
    };
    tick();
    // Minute-resolution clock: re-tick every 15s so the minute rolls over promptly without flicker.
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-hairline">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-6">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="font-display text-3xl text-bone leading-none">PITCH</span>
            <span className="font-mono text-[11px] uppercase tracking-widest2 text-pitch">/ console</span>
          </Link>
          <nav className="hidden md:flex gap-5 ml-6 font-mono text-[12px] uppercase tracking-widest2 text-bone/75">
            <Link to="/" className="hover:text-pitch">Tournaments</Link>
            <Link to="/players" className="hover:text-pitch">Players</Link>
          </nav>
          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-hairline">
            <span
              aria-hidden="true"
              className="relative inline-block h-1.5 w-1.5 rounded-full bg-pitch"
            >
              <span className="absolute inset-0 rounded-full bg-pitch animate-ping opacity-60" />
            </span>
            <div className="flex flex-col items-end leading-none gap-1">
              <span className="font-mono text-[11px] uppercase tracking-widest2 text-bone/60">
                {tz ? (<>{tz} <span className="text-bone/40">·</span> </>) : null}<span className="text-bone/75">{stamp}</span>
              </span>
              <span className="font-mono text-[14px] text-bone/90 number-display tabular-nums">
                {hhmm}
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10">{children}</main>
      <footer className="border-t border-hairline">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="font-mono text-[11px] uppercase tracking-widest2 text-bone/55">
            v0.3 — local edition · no auth
          </div>
          <div className="font-mono text-[11px] uppercase tracking-widest2 text-bone/55">
            league + knockout
          </div>
        </div>
      </footer>
    </div>
  );
}
