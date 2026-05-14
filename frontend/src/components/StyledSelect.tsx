import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TeamCrest } from './TeamCrest';

// StyledSelect — a button-triggered listbox that matches the dark/pitch
// aesthetic of the rest of the app. We deliberately avoid native <select>
// because it can't be styled with the coral/pitch hairline panel and the
// per-item checkmark the design calls for.
//
// Behaviour:
//   - Click the trigger to toggle the panel.
//   - Esc closes the panel.
//   - ArrowUp/ArrowDown move the highlight; Enter selects; Home/End jump.
//   - Clicking outside closes the panel.
//   - When `disabled`, the trigger is dimmed and non-interactive.
//   - Optional `groupBy` builds <ul role="group"> sections with a label.
//
// The checkmark is rendered as a coral/pitch dot+tick on the selected row,
// matching the player-picker reference in the screenshot.

export type StyledOption = {
  value: string;
  label: string;
  hint?: string;            // optional small right-side hint (e.g. league)
  group?: string;           // optional group key for sectioning
  disabled?: boolean;
  iconUrl?: string | null;  // optional 16px leading icon (e.g. team crest)
};

export function StyledSelect({
  value,
  onChange,
  options,
  placeholder = '— pick —',
  disabled = false,
  ariaLabel,
  testId,
  accent = 'pitch',
  width = 'min-w-[14rem]',
}: {
  value: string;
  onChange: (v: string) => void;
  options: StyledOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  testId?: string;
  accent?: 'pitch' | 'coral';
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const accentBorder = accent === 'coral' ? 'border-coral/60' : 'border-pitch/60';
  const accentText   = accent === 'coral' ? 'text-coral' : 'text-pitch';
  const accentBg     = accent === 'coral' ? 'bg-coral'   : 'bg-pitch';

  const selected = options.find(o => o.value === value) || null;

  // Flatten enabled options into the order shown in the panel so keyboard
  // navigation tracks visible row indices correctly.
  const flat = useMemo(() => {
    const out: { opt: StyledOption; index: number }[] = [];
    options.forEach((opt, i) => {
      if (!opt.disabled) out.push({ opt, index: i });
    });
    return out;
  }, [options]);

  // Group options for rendering. If no `group` field is set, everything goes
  // into a single unnamed bucket.
  const grouped = useMemo(() => {
    const map = new Map<string, StyledOption[]>();
    for (const opt of options) {
      const key = opt.group || '';
      const bucket = map.get(key);
      if (bucket) bucket.push(opt);
      else map.set(key, [opt]);
    }
    return Array.from(map.entries());
  }, [options]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Reset highlight to the selected row whenever the panel opens.
  useLayoutEffect(() => {
    if (!open) return;
    const idx = flat.findIndex(f => f.opt.value === value);
    setHighlight(idx >= 0 ? idx : 0);
  }, [open, flat, value]);

  // Scroll highlighted item into view.
  useEffect(() => {
    if (!open || highlight < 0 || !listRef.current) return;
    const li = listRef.current.querySelector<HTMLLIElement>(
      `li[data-row-index="${highlight}"]`,
    );
    if (li) li.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  // Focus the listbox on open so arrow keys work without a second click.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  function onTriggerKey(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (flat.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => (h + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => (h - 1 + flat.length) % flat.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHighlight(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setHighlight(flat.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = flat[highlight];
      if (pick) {
        onChange(pick.opt.value);
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
  }

  function indexOf(opt: StyledOption): number {
    return flat.findIndex(f => f.opt === opt);
  }

  return (
    <div ref={rootRef} className={`relative ${width}`} data-testid={testId}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(open ? false : true); }}
        onKeyDown={onTriggerKey}
        data-testid={testId ? `${testId}-trigger` : undefined}
        data-state={open ? 'open' : 'closed'}
        className={[
          'group w-full flex items-center justify-between gap-3 px-3 py-2',
          'bg-ash border text-bone font-mono text-[13px] uppercase tracking-widest2',
          'transition-colors outline-none',
          disabled
            ? 'border-hairline/60 text-bone/30 cursor-not-allowed'
            : open
              ? `${accentBorder} ${accentText}`
              : 'border-hairline hover:border-pitch/40 focus:border-pitch/60',
        ].join(' ')}
      >
        <span className={`flex items-center gap-2 min-w-0 ${selected ? '' : 'text-bone/50'}`}>
          {selected && selected.iconUrl !== undefined && (
            <TeamCrest name={selected.label} logoUrl={selected.iconUrl} size="xs" />
          )}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <span
          aria-hidden="true"
          className={[
            'flex items-center gap-1 text-[10px] transition-transform',
            open ? 'rotate-180' : '',
            disabled ? 'text-bone/20' : open ? accentText : 'text-bone/40',
          ].join(' ')}
        >
          {/* tiny chevron drawn with two stacked bars so it picks up font-mono */}
          <span className="inline-block w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent"
                style={{ borderTopColor: 'currentColor' }} />
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className={`absolute z-30 mt-1 left-0 right-0 bg-ash border ${accentBorder} shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]`}
        >
          {/* hairline header strip — purely decorative, ties to the eyebrow style */}
          <div className="px-3 py-1.5 border-b border-hairline flex items-center justify-between">
            <span className={`label-eyebrow ${accentText}`}>
              / {ariaLabel || 'select'}
            </span>
            <span className="font-mono text-[11px] text-bone/55 number-display">
              {String(flat.length).padStart(2, '0')}
            </span>
          </div>
          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            onKeyDown={onListKey}
            // Keep keyboard focus inside the listbox while open. The effect
            // above calls listRef.current?.focus() on mount.
            data-testid={testId ? `${testId}-listbox` : undefined}
            className="max-h-64 overflow-y-auto py-1 outline-none"
          >
            {grouped.map(([groupName, opts], gi) => (
              <li key={groupName || `__g${gi}`} role="group" aria-label={groupName || undefined}>
                {groupName && (
                  <div className="px-3 pt-2 pb-1 label-eyebrow text-bone/30">
                    {groupName}
                  </div>
                )}
                <ul>
                  {opts.map(opt => {
                    const rowIdx = indexOf(opt);
                    const isSelected = opt.value === value;
                    const isHighlight = rowIdx >= 0 && rowIdx === highlight;
                    return (
                      <li
                        key={opt.value}
                        data-row-index={rowIdx}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={opt.disabled || undefined}
                        onMouseEnter={() => rowIdx >= 0 && setHighlight(rowIdx)}
                        onClick={() => {
                          if (opt.disabled) return;
                          onChange(opt.value);
                          setOpen(false);
                          triggerRef.current?.focus();
                        }}
                        className={[
                          'relative px-3 py-1.5 flex items-center gap-2',
                          'font-mono text-[12px] uppercase tracking-widest2',
                          opt.disabled
                            ? 'text-bone/30 cursor-not-allowed'
                            : 'text-bone/90 cursor-pointer',
                          !opt.disabled && isHighlight ? 'bg-ink/60' : '',
                          isSelected ? accentText : '',
                        ].join(' ')}
                      >
                        {/* Selected checkmark — small coral/pitch tick */}
                        <span className="w-3.5 inline-flex justify-center" aria-hidden="true">
                          {isSelected ? (
                            <svg viewBox="0 0 12 12" width="10" height="10" className={accentText}>
                              <path
                                d="M2 6.5 L5 9.5 L10 3"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="square"
                                strokeLinejoin="miter"
                              />
                            </svg>
                          ) : (
                            <span className="w-1 h-1 inline-block rounded-full bg-bone/15" />
                          )}
                        </span>
                        {opt.iconUrl !== undefined && (
                          <TeamCrest name={opt.label} logoUrl={opt.iconUrl} size="xs" />
                        )}
                        <span className="flex-1 truncate">{opt.label}</span>
                        {opt.hint && (
                          <span className="text-[11px] text-bone/55">{opt.hint}</span>
                        )}
                        {/* edge accent — a thin line on the left when highlighted */}
                        {isHighlight && !opt.disabled && (
                          <span className={`absolute left-0 w-0.5 h-5 ${accentBg}`} aria-hidden="true" />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {flat.length === 0 && (
              <li className="px-3 py-3 font-mono text-[12px] uppercase tracking-widest2 text-bone/50">
                — empty —
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
