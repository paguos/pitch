import { useMemo, useState } from 'react';
import type { Team } from '../lib/api';
import { teamOrigin, matchesQuery } from '../lib/competitions';
import { TeamCrest } from './TeamCrest';

const NATIONAL = 'national';

/**
 * AddTeamsPanel — pull teams into the draw from outside the chosen competition.
 *
 * Search-first: the field takes focus on open, Enter adds the top match, and
 * the panel stays open so several teams can go in one visit. The chips narrow
 * the list for people who'd rather browse a league than type.
 */
export function AddTeamsPanel({
  candidates, addedIds, onToggle, onClose,
}: {
  /** Free teams that aren't already in the competition's own list. */
  candidates: Team[];
  addedIds: Set<string>;
  onToggle: (team: Team) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string | null>(null); // a club league, NATIONAL, or all

  // Only offer filters that have something in them.
  const filters = useMemo(() => {
    const leagues = [...new Set(candidates.filter(t => t.kind !== NATIONAL).map(t => t.league))].sort();
    const out = leagues.map(l => ({ key: l, label: l }));
    if (candidates.some(t => t.kind === NATIONAL)) out.push({ key: NATIONAL, label: 'National teams' });
    return out;
  }, [candidates]);

  const results = useMemo(() => {
    return candidates
      .filter(t => (filter === null ? true : filter === NATIONAL ? t.kind === NATIONAL : t.kind !== NATIONAL && t.league === filter))
      .filter(t => matchesQuery(t, query))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [candidates, filter, query]);

  const chip = (active: boolean) =>
    `shrink-0 border px-3 py-1.5 font-mono text-[12px] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-pitch ${
      active ? 'border-pitch text-pitch bg-pitch/[0.06]' : 'border-hairline text-bone/70 hover:border-pitch/50 hover:text-bone'
    }`;

  return (
    <section
      aria-label="Add teams"
      className="add-panel flex flex-col gap-4 border border-hairline bg-ash p-4 sm:p-5"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
    >
      <div className="flex items-end gap-4">
        <input
          autoFocus
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && results[0]) { e.preventDefault(); onToggle(results[0]); }
          }}
          placeholder="Search any team"
          aria-label="Search teams"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 border-b border-hairline bg-transparent pb-2 font-display text-3xl leading-none text-bone placeholder:text-bone/30 focus:border-pitch focus:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          className="pb-2 font-mono text-[13px] text-bone/70 hover:text-pitch focus-visible:outline focus-visible:outline-1 focus-visible:outline-pitch"
        >
          Done
        </button>
      </div>

      <div role="group" aria-label="Filter by league" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <button type="button" aria-pressed={filter === null} onClick={() => setFilter(null)} className={chip(filter === null)}>All</button>
        {filters.map(f => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={chip(filter === f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <p className="sr-only" role="status">{results.length} {results.length === 1 ? 'team' : 'teams'}</p>

      {results.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-bone/60">
          {query.trim()
            ? <>No free team matches “{query.trim()}”. Check the spelling or pick another league.</>
            : 'Every team here is already in the draw or taken.'}
        </p>
      ) : (
        <ul className="thin-scroll -mx-1 max-h-72 overflow-y-auto px-1">
          {results.map(t => {
            const on = addedIds.has(t.id);
            return (
              <li key={t.id} className="border-b border-hairline last:border-b-0">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(t)}
                  className="flex w-full items-center gap-3 px-2 py-2.5 text-left hover:bg-bone/[0.04] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-pitch"
                >
                  <TeamCrest name={t.name} logoUrl={t.logo_url} size="sm" />
                  <span className={`min-w-0 flex-1 truncate text-[14px] ${on ? 'text-bone/60' : 'text-bone'}`}>{t.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-bone/50">{teamOrigin(t)}</span>
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 shrink-0 items-center justify-center border text-[11px] leading-none ${
                      on ? 'border-pitch bg-pitch font-bold text-ink' : 'border-bone/40 text-bone/60'
                    }`}
                  >
                    {on ? '✓' : '+'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
