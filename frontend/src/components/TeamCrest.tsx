import React from 'react';

/**
 * TeamCrest — a club/national crest treated as part of the page chrome.
 *
 * Design intent: in this dark/mono palette, full-colour club crests would feel
 * pasted-on. We seat them in a tiny circular slot with a hairline ring and a
 * faint ash backdrop, and dial the saturation/contrast a touch so they read
 * as the one warm pop in an otherwise monochrome row.
 *
 * Fallback: no logo_url → a mono monogram with the team's first 2 letters,
 * laid out exactly like the crest slot. Layout never shifts.
 */

export type CrestSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZES: Record<CrestSize, { box: string; pad: string; mono: string; ring: string }> = {
  // 16px slot — for dense fixture rows and standings cells
  xs: { box: 'h-4 w-4',  pad: 'p-[1.5px]', mono: 'text-[8px]',  ring: 'ring-[0.5px]' },
  // 24px slot — for participant pills, secondary lines
  sm: { box: 'h-6 w-6',  pad: 'p-[2px]',   mono: 'text-[9px]',  ring: 'ring-[0.5px]' },
  // 32px slot — for bracket cards
  md: { box: 'h-8 w-8',  pad: 'p-[3px]',   mono: 'text-[11px]', ring: 'ring-1' },
  // 48px slot — for participant cards / hero treatments
  lg: { box: 'h-12 w-12', pad: 'p-[4px]',  mono: 'text-[14px]', ring: 'ring-1' },
};

function initials(name: string): string {
  const cleaned = name
    .replace(/^(AC|AS|AFC|FC|SC|RC|VfB|VfL|TSG|RB|1\.\s*FC|1\.\s*FSV)\s+/i, '')
    .replace(/[^\p{L}\p{N}\s&-]/gu, '')
    .trim();
  const parts = cleaned.split(/[\s&-]+/).filter(Boolean);
  if (parts.length === 0) return name.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export function TeamCrest({
  name,
  logoUrl,
  size = 'sm',
  className = '',
  title,
}: {
  name: string;
  logoUrl: string | null | undefined;
  size?: CrestSize;
  className?: string;
  title?: string;
}) {
  const s = SIZES[size];
  const tooltip = title ?? name;

  // Shared slot: round, hairline ring, faint inset, subtle backdrop tint.
  // The slot is what makes the crest feel "set into" the row rather than dropped on top.
  const slotBase =
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden ' +
    'rounded-full bg-ink/60 ' +
    `${s.ring} ring-hairline ` +
    'shadow-[inset_0_0_0_0.5px_rgba(234,229,216,0.04)]';

  if (!logoUrl) {
    return (
      <span
        className={`${slotBase} ${s.box} ${className}`}
        title={tooltip}
        aria-label={name}
      >
        <span
          className={`font-mono ${s.mono} text-bone/70 tracking-[0.06em] leading-none select-none`}
        >
          {initials(name)}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`${slotBase} ${s.box} ${className}`}
      title={tooltip}
      aria-label={name}
    >
      <img
        src={logoUrl}
        alt=""
        aria-hidden="true"
        decoding="async"
        draggable={false}
        className={`${s.pad} h-full w-full object-contain select-none crest-img`}
      />
      {/* Inner ring + soft inner shadow so the crest sits in the slot. */}
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          boxShadow:
            'inset 0 0 0 0.5px rgba(234,229,216,0.06), inset 0 0 6px rgba(0,0,0,0.35)',
        }}
      />
    </span>
  );
}

/**
 * TeamLabel — the canonical "crest + team name" row used everywhere a team
 * name appears next to a crest. Keeps the gap, alignment and truncation rules
 * consistent across fixtures / standings / bracket / participants.
 */
export function TeamLabel({
  name,
  logoUrl,
  size = 'sm',
  className = '',
  nameClassName = '',
  align = 'left',
}: {
  name: string;
  logoUrl: string | null | undefined;
  size?: CrestSize;
  className?: string;
  nameClassName?: string;
  align?: 'left' | 'right';
}) {
  const row =
    align === 'right'
      ? 'flex-row-reverse text-right'
      : 'flex-row text-left';
  return (
    <span className={`inline-flex items-center gap-2 ${row} ${className}`}>
      <TeamCrest name={name} logoUrl={logoUrl} size={size} />
      <span className={`min-w-0 truncate ${nameClassName}`}>{name}</span>
    </span>
  );
}
