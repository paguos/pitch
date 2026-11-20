import { Competition } from '../lib/competitions';

export type CompetitionOption = Competition & {
  /** Teams still free for this competition. */
  count: number;
};

/**
 * CompetitionPicker — which teams go in the draw.
 *
 * The logos are dark on transparent (Premier League purple, Champions League
 * navy), so each one sits on a chalk plate, like a lit match-day board in an
 * otherwise dark room.
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
    <div role="group" aria-label="Competitions" className="grid grid-cols-3 sm:grid-cols-5 gap-3">
      {options.map(o => {
        const short = o.count < need;
        const selected = o.key === selectedKey;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={selected}
            disabled={short}
            title={short ? `Only ${o.count} free teams` : undefined}
            onClick={() => onPick(o.key)}
            className={`flex flex-col bg-chalk text-ink text-left transition-[transform,outline-color] motion-safe:hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed outline outline-2 outline-offset-2 focus-visible:outline-pitch ${
              selected ? 'outline-pitch' : 'outline-transparent'
            }`}
          >
            <span className="flex h-16 items-center justify-center p-2.5">
              {o.logo && (
                <img
                  src={o.logo}
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  draggable={false}
                  className="h-full w-full object-contain select-none"
                />
              )}
            </span>
            <span className="block truncate border-t border-ink/15 px-3 py-2 text-[12px] font-semibold leading-tight">
              {o.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
