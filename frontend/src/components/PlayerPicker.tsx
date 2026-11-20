import { Player } from '../lib/api';

/**
 * PlayerPicker — who is in this draw.
 *
 * Same ticked-tile language as the team grid so the two steps read as one
 * flow. Each player gets a chalk monogram plate (the competition plates'
 * little sibling); unticked players fall back, ticked ones light up.
 */
export function PlayerPicker({
  players, excludedIds, onToggle, onToggleAll,
}: {
  players: Player[];
  /** Players left out of the draw. Everyone starts in. */
  excludedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const allIn = players.every(p => !excludedIds.has(p.id));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-4">
        <span className="font-display text-3xl leading-none text-bone">Who&apos;s playing?</span>
        <button
          type="button"
          onClick={onToggleAll}
          className="ml-auto font-mono text-[12px] text-bone/60 underline underline-offset-4 decoration-bone/30 hover:text-pitch focus-visible:outline focus-visible:outline-1 focus-visible:outline-pitch"
        >
          {allIn ? 'Clear' : 'Select all'}
        </button>
      </div>

      <div role="group" aria-label="Players" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {players.map(p => {
          const on = !excludedIds.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onToggle(p.id)}
              className={`flex items-center gap-3 border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-pitch ${
                on ? 'border-pitch/60 bg-pitch/[0.04]' : 'border-hairline opacity-60 hover:opacity-100 hover:border-pitch/50'
              }`}
            >
              <span
                aria-hidden
                className={`flex h-8 w-8 shrink-0 items-center justify-center bg-chalk font-display text-xl leading-none text-ink transition-opacity ${
                  on ? 'opacity-100' : 'opacity-50'
                }`}
              >
                {p.display_name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 truncate font-display text-2xl leading-none text-bone">{p.display_name}</span>
              <span
                aria-hidden
                className={`w-4 h-4 border flex items-center justify-center shrink-0 ${on ? 'border-pitch bg-pitch' : 'border-bone/40'}`}
              >
                {on && <span className="text-ink text-[10px] font-bold leading-none">✓</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
