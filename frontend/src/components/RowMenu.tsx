import { KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  testId?: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  // Small explanation shown under the label, e.g. why an item is disabled.
  hint?: string;
};

const ITEM_BASE =
  'block w-full text-left px-4 py-3 font-mono text-[12px] uppercase tracking-widest2 outline-none disabled:cursor-not-allowed disabled:opacity-45';
const ITEM_TONE = {
  default: 'text-bone/80 hover:bg-ink hover:text-pitch focus-visible:bg-ink focus-visible:text-pitch',
  danger: 'text-coral/90 hover:bg-coral/10 hover:text-coral focus-visible:bg-coral/10 focus-visible:text-coral',
} as const;

// Kebab ("three dots") button that opens a small action menu for a list row.
// Mirrors AccountMenu: closes on outside click, Escape and selection; arrow
// keys move between items; opens upward when there is no room below.
export function RowMenu({
  label, items, testId,
}: {
  label: string;
  items: RowMenuItem[];
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

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
    // Land on the first enabled item so the menu is usable from the keyboard.
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Flip above the button when the menu would run off the bottom of the screen.
  useLayoutEffect(() => {
    if (!open || !menu.current || !button.current) return;
    const need = menu.current.offsetHeight + 8;
    const below = window.innerHeight - button.current.getBoundingClientRect().bottom;
    setUp(below < need);
  }, [open]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const els = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
    );
    if (els.length === 0) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
    els[next]?.focus();
  };

  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        data-testid={testId}
        className={`flex h-9 w-9 items-center justify-center border transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch ${
          open
            ? 'border-pitch text-pitch bg-ink'
            : 'border-transparent text-bone/70 hover:border-hairline hover:text-pitch'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
          <circle cx="9" cy="3.5" r="1.5" />
          <circle cx="9" cy="9" r="1.5" />
          <circle cx="9" cy="14.5" r="1.5" />
        </svg>
      </button>

      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={`account-menu absolute right-0 z-30 w-48 bg-ash border border-hairline shadow-xl ${
            up ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          {items.map((it, i) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              data-testid={it.testId}
              onClick={() => { setOpen(false); it.onSelect(); }}
              className={`${ITEM_BASE} ${ITEM_TONE[it.tone ?? 'default']} ${i > 0 ? 'border-t border-hairline' : ''}`}
            >
              {it.label}
              {it.hint && (
                <span className="mt-1 block font-sans text-[11px] normal-case tracking-normal text-bone/55">
                  {it.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
