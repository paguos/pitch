import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

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

const NAV_LINKS = [
  { to: '/', label: 'Tournaments', exact: true },
  { to: '/players', label: 'Players', exact: false },
];

export function Shell({ children }: { children: ReactNode }) {
  const [hhmm, setHhmm] = useState<string>('');
  const [stamp, setStamp] = useState<string>('');
  const [tz, setTz] = useState<string>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

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

  // Close drawer on navigation.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

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
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden flex flex-col justify-center gap-[5px] p-1 text-bone/75 hover:text-pitch"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
          >
            <span className="block w-5 h-px bg-current" />
            <span className="block w-5 h-px bg-current" />
            <span className="block w-5 h-px bg-current" />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      <div className="md:hidden">
        {/* Backdrop */}
        <div
          className={`fixed inset-0 z-40 bg-ink/70 transition-opacity duration-200 ${drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
        {/* Panel */}
        <div
          className={`fixed top-0 right-0 z-50 h-full w-64 bg-ink border-l border-hairline flex flex-col transition-transform duration-200 ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
          <div className="flex items-center justify-between px-6 py-5 border-b border-hairline">
            <Link to="/" className="flex items-baseline gap-2">
              <span className="font-display text-2xl text-bone leading-none">PITCH</span>
              <span className="font-mono text-[11px] uppercase tracking-widest2 text-pitch">/ console</span>
            </Link>
            <button
              className="text-bone/55 hover:text-pitch p-1"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="2" y1="2" x2="14" y2="14" />
                <line x1="14" y1="2" x2="2" y2="14" />
              </svg>
            </button>
          </div>
          <nav className="flex flex-col px-6 pt-6 gap-1">
            {NAV_LINKS.map(({ to, label, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  `font-mono text-[13px] uppercase tracking-widest2 py-3 border-b border-hairline last:border-0 transition-colors ${isActive ? 'text-pitch' : 'text-bone/70 hover:text-pitch'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

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
