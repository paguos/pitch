import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const ITEM =
  'block w-full text-left px-4 py-3 font-mono text-[12px] uppercase tracking-widest2 text-bone/80 hover:bg-ink hover:text-pitch focus-visible:bg-ink focus-visible:text-pitch outline-none';

// Header icon that opens a two-item menu: view the profile or sign out.
export function AccountMenu() {
  const { user, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const who = user?.player_name ?? user?.username ?? '';

  // Close on navigation, outside click and Escape.
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); button.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // Land on the first item so the menu is usable from the keyboard.
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Arrow keys move between the two items.
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div ref={wrap} className="relative" data-testid="session-chip">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        data-testid="account-menu"
        className={`flex h-9 w-9 items-center justify-center border transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch ${
          open ? 'border-pitch text-pitch' : 'border-hairline text-bone/75 hover:border-pitch/50 hover:text-pitch'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <circle cx="9" cy="6.5" r="3" />
          <path d="M2.5 16c.6-3.2 3.2-5 6.5-5s5.9 1.8 6.5 5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKey}
          className="account-menu absolute right-0 top-full mt-2 z-30 w-56 bg-ash border border-hairline shadow-xl"
        >
          <div className="px-4 py-3 border-b border-hairline">
            <div className="font-mono text-[12px] text-bone truncate">{who}</div>
            <div className={`mt-1 font-mono text-[11px] uppercase tracking-widest2 ${isAdmin ? 'text-coral' : 'text-bone/60'}`}>
              {isAdmin ? 'admin' : 'viewer'}
            </div>
          </div>
          <Link to="/profile" role="menuitem" className={ITEM} data-testid="view-profile">
            View profile
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut()}
            data-testid="sign-out"
            className={`${ITEM} border-t border-hairline`}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
