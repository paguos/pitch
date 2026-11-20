import {
  FormEvent, forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { api, Match, Participant } from '../lib/api';
import { Button } from './ui';
import { TeamCrest } from './TeamCrest';

// ScoreEntry — "which match is this?" without scrolling the fixture list.
//
// FIFA plays its own order, so the draw order in the list is rarely the order
// a result comes in. Instead of hunting for the row, pick the two sides (by
// club or by player, search matches both) and the app finds the match. Picking
// one side narrows the other to its opponents, so a wrong pairing can't be
// built. Works for league fixtures and for the playable knockout matches.

type Mode = 'club' | 'player';
type SideKey = 'a' | 'b';
type FocusTarget = SideKey | 'score';

type Entrant = { id: string; team: string; player: string; logo: string | null };
type PickOption = Entrant & { hint?: string; muted?: boolean };
type PickerHandle = { focus: () => void };

const MODE_KEY = 'pitch.scoreEntry.mode';

function readMode(): Mode {
  try { return localStorage.getItem(MODE_KEY) === 'player' ? 'player' : 'club'; } catch { return 'club'; }
}
function writeMode(m: Mode) {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* storage unavailable: keep it for this visit only */ }
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
const isScored = (m: Match) => m.status === 'REPORTED' || m.status === 'COMPLETED';
const primary = (e: Entrant, mode: Mode) => (mode === 'club' ? e.team : e.player);
const secondary = (e: Entrant, mode: Mode) => (mode === 'club' ? e.player : e.team);
const clampGoals = (n: number) => (Number.isFinite(n) ? Math.min(99, Math.max(0, n)) : 0);

export function ScoreEntry({
  participants, matches, onSaved,
}: {
  participants: Participant[];
  matches: Match[];
  /** Called after a save (and after a failed save, so the page picks up a newer version). */
  onSaved: () => void;
}) {
  const [mode, setModeState] = useState<Mode>(readMode);
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);
  const [goalsA, setGoalsA] = useState(0);
  const [goalsB, setGoalsB] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const [focusReq, setFocusReq] = useState<{ target: FocusTarget; n: number } | null>(null);

  const pickerA = useRef<PickerHandle>(null);
  const pickerB = useRef<PickerHandle>(null);
  const scoreA = useRef<HTMLInputElement>(null);

  function setMode(m: Mode) { setModeState(m); writeMode(m); }

  const entrantById = useMemo(() => {
    const map = new Map<string, Entrant>();
    for (const p of participants) {
      map.set(p.id, { id: p.id, team: p.team_name, player: p.player_name, logo: p.team_logo_url });
    }
    return map;
  }, [participants]);

  // Matches that can take a score right now: both sides known. Knockout
  // matches still waiting on an earlier round are PENDING and stay out.
  const scoreable = useMemo(
    () => matches.filter(m => m.home_participant_id && m.away_participant_id && m.status !== 'PENDING'),
    [matches],
  );
  const pairs = useMemo(() => {
    const map = new Map<string, Match>();
    for (const m of scoreable) map.set(pairKey(m.home_participant_id!, m.away_participant_id!), m);
    return map;
  }, [scoreable]);
  const opponents = useMemo(() => {
    const map = new Map<string, { id: string; match: Match }[]>();
    const add = (from: string, to: string, match: Match) => {
      const list = map.get(from);
      if (list) list.push({ id: to, match }); else map.set(from, [{ id: to, match }]);
    };
    for (const m of scoreable) {
      add(m.home_participant_id!, m.away_participant_id!, m);
      add(m.away_participant_id!, m.home_participant_id!, m);
    }
    return map;
  }, [scoreable]);

  const remaining = scoreable.filter(m => !isScored(m)).length;
  const a = aId ? entrantById.get(aId) ?? null : null;
  const b = bId ? entrantById.get(bId) ?? null : null;
  const match = aId && bId ? pairs.get(pairKey(aId, bId)) ?? null : null;
  const aIsHome = !!match && match.home_participant_id === aId;
  const alreadyScored = !!match && isScored(match);

  // What each side's list offers. With the other side picked it is that
  // side's opponents (unplayed first); otherwise everyone with a match.
  function optionsFor(otherId: string | null): PickOption[] {
    if (otherId) {
      return (opponents.get(otherId) ?? [])
        .map(({ id, match: m }) => {
          const e = entrantById.get(id);
          if (!e) return null;
          const scored = isScored(m);
          const otherIsHome = m.home_participant_id === otherId;
          const og = otherIsHome ? m.home_goals : m.away_goals;
          const tg = otherIsHome ? m.away_goals : m.home_goals;
          return { ...e, hint: scored ? `played ${og}–${tg}` : 'to play', muted: scored } as PickOption;
        })
        .filter((o): o is PickOption => !!o)
        .sort((x, y) => Number(!!x.muted) - Number(!!y.muted) || primary(x, mode).localeCompare(primary(y, mode)));
    }
    return Array.from(opponents.keys())
      .map(id => {
        const e = entrantById.get(id);
        if (!e) return null;
        const left = (opponents.get(id) ?? []).filter(o => !isScored(o.match)).length;
        return { ...e, hint: left === 0 ? 'done' : `${left} left`, muted: left === 0 } as PickOption;
      })
      .filter((o): o is PickOption => !!o)
      .sort((x, y) => primary(x, mode).localeCompare(primary(y, mode)));
  }
  const optionsA = useMemo(() => optionsFor(bId), [bId, opponents, entrantById, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const optionsB = useMemo(() => optionsFor(aId), [aId, opponents, entrantById, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function setSides(nextA: string | null, nextB: string | null) {
    setAId(nextA);
    setBId(nextB);
    const m = nextA && nextB ? pairs.get(pairKey(nextA, nextB)) : null;
    if (m && isScored(m)) {
      const aHome = m.home_participant_id === nextA;
      setGoalsA(clampGoals((aHome ? m.home_goals : m.away_goals) ?? 0));
      setGoalsB(clampGoals((aHome ? m.away_goals : m.home_goals) ?? 0));
    } else {
      setGoalsA(0);
      setGoalsB(0);
    }
  }

  function choose(side: SideKey, id: string | null) {
    setErr(null);
    setSaved(null);
    let nextA = aId;
    let nextB = bId;
    if (side === 'a') nextA = id; else nextB = id;
    let target: FocusTarget | null = null;
    if (id) {
      if (nextA && nextB) {
        target = 'score';
      } else {
        // One unplayed opponent left (always the case in a knockout round):
        // there is only one match this could be, so fill the other side in.
        const open = (opponents.get(id) ?? []).filter(o => !isScored(o.match));
        if (open.length === 1) {
          if (side === 'a') nextB = open[0]!.id; else nextA = open[0]!.id;
          target = 'score';
        } else {
          target = side === 'a' ? 'b' : 'a';
        }
      }
    }
    setSides(nextA, nextB);
    if (target) setFocusReq({ target, n: Date.now() });
  }

  useEffect(() => {
    if (!focusReq) return;
    if (focusReq.target === 'a') pickerA.current?.focus();
    else if (focusReq.target === 'b') pickerB.current?.focus();
    else { scoreA.current?.focus(); scoreA.current?.select(); }
  }, [focusReq]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!match || !a || !b || busy) return;
    setErr(null);
    setBusy(true);
    const home = aIsHome ? goalsA : goalsB;
    const away = aIsHome ? goalsB : goalsA;
    try {
      await api.submitScore(match.id, home, away, match.version);
      setSaved(`${primary(a, mode)} ${goalsA}–${goalsB} ${primary(b, mode)}`);
      setSides(null, null);
      setFlash(n => n + 1);
      setFocusReq({ target: 'a', n: Date.now() });
      onSaved();
    } catch (ex: any) {
      setErr(ex.message);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const chipFor = aId && !bId ? aId : bId && !aId ? bId : null;
  const chipEntrant = chipFor ? entrantById.get(chipFor) ?? null : null;
  const chipOpen = chipFor ? (opponents.get(chipFor) ?? []).filter(o => !isScored(o.match)) : [];

  return (
    <section
      aria-labelledby="score-entry-title"
      data-testid="score-entry"
      className="relative mt-8 border border-hairline bg-ash/40 p-5 sm:p-6"
    >
      {flash > 0 && <span key={flash} aria-hidden className="score-saved-flash pointer-events-none absolute inset-0" />}

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-4">
          <h2 id="score-entry-title" className="font-display text-3xl leading-none text-bone">Score a match</h2>
          <span className="font-mono text-[12px] text-bone/60 number-display">
            {remaining === 0 ? 'all scored' : `${remaining} left`}
          </span>
        </div>
        <div role="radiogroup" aria-label="Show matches by" className="flex items-center gap-1 font-mono text-[12px]">
          <span className="mr-1 text-bone/60">Show</span>
          {(['club', 'player'] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 border transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-pitch ${
                mode === m ? 'border-pitch/60 text-pitch' : 'border-hairline text-bone/65 hover:text-bone'
              }`}
            >
              {m === 'club' ? 'Club' : 'Player'}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="mt-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_minmax(0,1fr)] sm:items-center sm:gap-x-4">
          <div className="col-start-1 row-start-1">
            <SidePicker
              ref={pickerA}
              label="First side"
              testId="score-entry-a"
              mode={mode}
              value={a}
              options={optionsA}
              onPick={id => choose('a', id)}
              onClear={() => choose('a', null)}
            />
          </div>
          <div className="col-start-2 row-start-1">
            <ScoreBox
              ref={scoreA}
              label={`${a ? primary(a, mode) : 'First side'} goals`}
              testId="score-entry-goals-a"
              value={goalsA}
              onChange={setGoalsA}
              disabled={!match}
            />
          </div>
          <span aria-hidden className="hidden sm:block sm:col-start-3 sm:row-start-1 font-display text-4xl leading-none text-bone/40">:</span>
          <div className="col-start-2 row-start-2 sm:col-start-4 sm:row-start-1">
            <ScoreBox
              label={`${b ? primary(b, mode) : 'Second side'} goals`}
              testId="score-entry-goals-b"
              value={goalsB}
              onChange={setGoalsB}
              disabled={!match}
            />
          </div>
          <div className="col-start-1 row-start-2 sm:col-start-5 sm:row-start-1">
            <SidePicker
              ref={pickerB}
              label="Second side"
              testId="score-entry-b"
              mode={mode}
              value={b}
              options={optionsB}
              onPick={id => choose('b', id)}
              onClear={() => choose('b', null)}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1 font-mono text-[12px]" aria-live="polite">
            {err ? (
              <span role="alert" className="text-coral">{err}</span>
            ) : alreadyScored ? (
              <span className="text-coral">Already scored. Saving replaces the result.</span>
            ) : chipEntrant ? (
              chipOpen.length === 0 ? (
                <span className="text-bone/60">{primary(chipEntrant, mode)} has played everyone. Pick an opponent to correct a score.</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-bone/60">{primary(chipEntrant, mode)} still plays</span>
                  {chipOpen.map(o => {
                    const e = entrantById.get(o.id);
                    if (!e) return null;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => choose(aId ? 'b' : 'a', o.id)}
                        className="inline-flex items-center gap-2 border border-hairline px-2 py-1 text-bone/85 transition-colors hover:border-pitch/60 hover:text-bone focus-visible:outline focus-visible:outline-1 focus-visible:outline-pitch"
                      >
                        <TeamCrest name={e.team} logoUrl={e.logo} size="xs" />
                        {primary(e, mode)}
                      </button>
                    );
                  })}
                </div>
              )
            ) : saved ? (
              <span data-testid="score-entry-saved" className="text-pitch">Saved {saved}</span>
            ) : !match ? (
              <span className="text-bone/60">Pick either side. The other list only shows who they can still play.</span>
            ) : null}
          </div>
          <Button type="submit" data-testid="score-entry-submit" disabled={!match || busy}>
            {busy ? 'Saving…' : alreadyScored ? 'Update score' : 'Save score'}
          </Button>
        </div>
      </form>
    </section>
  );
}

// --- Score numeral ---------------------------------------------------------

const ScoreBox = forwardRef<HTMLInputElement, {
  label: string; value: number; onChange: (n: number) => void; disabled: boolean; testId?: string;
}>(function ScoreBox({ label, value, onChange, disabled, testId }, ref) {
  const step = (d: number) => onChange(clampGoals(value + d));
  const stepBtn =
    'h-8 w-8 shrink-0 border border-hairline font-mono text-[16px] leading-none text-bone/70 transition-colors ' +
    'hover:border-pitch/60 hover:text-bone disabled:opacity-30 disabled:hover:border-hairline disabled:hover:text-bone/70 ' +
    'focus-visible:outline focus-visible:outline-1 focus-visible:outline-pitch';
  return (
    <div className={`flex items-center gap-1.5 ${disabled ? 'opacity-40' : ''}`}>
      <button type="button" tabIndex={-1} aria-label={`Remove a goal: ${label}`} disabled={disabled} onClick={() => step(-1)} className={stepBtn}>−</button>
      <input
        ref={ref}
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        value={value}
        onChange={e => onChange(clampGoals(parseInt(e.target.value || '0', 10)))}
        onFocus={e => e.target.select()}
        className="w-14 bg-transparent text-center font-display text-5xl leading-none text-bone outline-none border-b border-hairline focus:border-pitch py-1 sm:w-20 sm:text-6xl [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" tabIndex={-1} aria-label={`Add a goal: ${label}`} disabled={disabled} onClick={() => step(1)} className={stepBtn}>+</button>
    </div>
  );
});

// --- Searchable side picker ------------------------------------------------

const SidePicker = forwardRef<PickerHandle, {
  label: string;
  testId: string;
  mode: Mode;
  value: Entrant | null;
  options: PickOption[];
  onPick: (id: string) => void;
  onClear: () => void;
}>(function SidePicker({ label, testId, mode, value, options, onPick, onClear }, ref) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const showInput = open || !value;

  useImperativeHandle(ref, () => ({
    focus: () => { setOpen(true); inputRef.current?.focus(); },
  }), []);

  // An opened picker always puts the cursor in its search box.
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open, showInput]);

  const filtered = useMemo(() => {
    const tokens = fold(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return options;
    return options
      .filter(o => { const hay = fold(`${o.team} ${o.player}`); return tokens.every(t => hay.includes(t)); })
      .sort((x, y) =>
        Number(!fold(primary(x, mode)).startsWith(tokens[0]!)) - Number(!fold(primary(y, mode)).startsWith(tokens[0]!)));
  }, [options, query, mode]);

  const active = Math.min(hi, Math.max(0, filtered.length - 1));
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLLIElement>(`li[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, filtered]);

  function close(refocusTrigger: boolean) {
    setOpen(false);
    setQuery('');
    if (refocusTrigger && value) requestAnimationFrame(() => triggerRef.current?.focus());
  }
  function pick(o: PickOption) {
    onPick(o.id);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHi(Math.min(active + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi(Math.max(active - 1, 0));
    } else if (e.key === 'Enter') {
      // The picker lives inside the score form: Enter here must choose, not submit.
      e.preventDefault();
      const o = filtered[active];
      if (open && o) pick(o);
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); close(true); }
    }
  }

  const box = 'flex min-h-[4.25rem] w-full items-center gap-3 border bg-ash/60 px-3 text-left transition-colors';

  return (
    <div className="relative" data-testid={testId}>
      {showInput ? (
        <div className={`${box} ${open ? 'border-pitch/60' : 'border-hairline'}`}>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder="Search club or player"
            value={query}
            data-testid={`${testId}-input`}
            onChange={e => { setQuery(e.target.value); setHi(0); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => close(false)}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent py-3 font-sans text-[15px] text-bone outline-none placeholder:text-bone/55"
          />
          <Chevron />
        </div>
      ) : (
        <>
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="listbox"
            aria-label={`${label}: ${value!.team}, ${value!.player}. Change`}
            data-testid={`${testId}-trigger`}
            onClick={() => setOpen(true)}
            className={`${box} border-pitch/40 pr-11 hover:border-pitch/70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-pitch`}
          >
            <TeamCrest name={value!.team} logoUrl={value!.logo} size="md" />
            <span className="min-w-0">
              <span className="block truncate font-display text-2xl leading-none text-bone">{primary(value!, mode)}</span>
              <span className="mt-1.5 block truncate font-mono text-[11px] lowercase tracking-widest2 text-bone/60">
                {secondary(value!, mode).toLowerCase()}
              </span>
            </span>
          </button>
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            data-testid={`${testId}-clear`}
            onClick={onClear}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-bone/55 transition-colors hover:text-coral focus-visible:outline focus-visible:outline-1 focus-visible:outline-pitch"
          >
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
              <path d="M2 2 L10 10 M10 2 L2 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
            </svg>
          </button>
        </>
      )}

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          className="thin-scroll absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto border border-pitch/60 bg-ash py-1 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]"
        >
          {filtered.length === 0 && (
            <li role="presentation" className="px-3 py-3 font-mono text-[12px] text-bone/60">
              {query.trim() ? `No club or player matches “${query.trim()}”.` : 'Nobody to pick here.'}
            </li>
          )}
          {filtered.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input must not lose focus (and close the list) first.
              onMouseDown={e => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setHi(i)}
              className={`relative flex cursor-pointer items-center gap-3 px-3 py-2 ${i === active ? 'bg-ink/60' : ''} ${o.muted ? 'opacity-60' : ''}`}
            >
              {i === active && <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-pitch" />}
              <TeamCrest name={o.team} logoUrl={o.logo} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-xl leading-none text-bone">{primary(o, mode)}</span>
                <span className="mt-1 block truncate font-mono text-[11px] lowercase tracking-widest2 text-bone/60">
                  {secondary(o, mode).toLowerCase()}
                </span>
              </span>
              {o.hint && <span className="shrink-0 font-mono text-[11px] text-bone/60 number-display">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

function Chevron() {
  return (
    <span
      aria-hidden
      className="inline-block h-0 w-0 shrink-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-bone/40"
    />
  );
}
