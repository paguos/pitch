import { Competition, CUSTOM_KEY } from '../lib/competitions';

export type CompetitionOption = Competition & {
  /** Teams still free for this competition. */
  count: number;
};

/**
 * CompetitionPicker — the Quick draw "which teams?" starting point.
 *
 * The logos are dark on transparent (Premier League purple, Champions League
 * navy), so each one sits on a chalk plate, like a lit match-day board in an
 * otherwise dark room. Custom is the one tile that stays dark.
 */
export function CompetitionPicker({
  options, selectedKey, need, onPick,
}: {
  options: CompetitionOption[];
  selectedKey: string | null;
  /** Players waiting for a team. A pool smaller than this can't be drawn. */
  need: number;
  onPick: (key: string) => void;
}) {
  return (
    <div role="group" aria-label="Competitions" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {options.map(o => {
        const custom = o.key === CUSTOM_KEY;
        const short = o.count < need;
        const selected = o.key === selectedKey;
        const countText = short
          ? `${o.count} free, need ${need}`
          : custom
            ? 'Pick teams yourself'
            : `${o.count} teams`;

        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={selected}
            disabled={short}
            onClick={() => onPick(o.key)}
            className={`group flex flex-col text-left transition-[transform,outline-color] motion-safe:hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed outline outline-2 outline-offset-2 focus-visible:outline-pitch ${
              selected ? 'outline-pitch' : 'outline-transparent'
            } ${custom ? 'border border-dashed border-bone/30 text-bone enabled:hover:border-pitch/60' : 'bg-chalk text-ink'}`}
          >
            <span className="flex h-[7.5rem] items-center justify-center p-3">
              {o.logo ? (
                <img
                  src={o.logo}
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  draggable={false}
                  className="h-full w-full object-contain select-none"
                />
              ) : (
                <span aria-hidden className="relative block h-9 w-9">
                  <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-bone/70" />
                  <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-bone/70" />
                </span>
              )}
            </span>
            <span className={`block border-t px-3 py-2 ${custom ? 'border-bone/15' : 'border-ink/15'}`}>
              <span className="block truncate text-[13px] font-semibold leading-tight">{o.name}</span>
              <span
                className={`mt-0.5 block truncate font-mono text-[11px] ${
                  short ? 'text-rust font-semibold' : custom ? 'text-bone/60' : 'text-ink/60'
                }`}
              >
                {countText}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
