import { CSSProperties, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Board, CATEGORIES, Category, categoryByKey, loadBoard, ordinal, Ranking, rankCategory, Row, Stats } from '../lib/leaderboard';
import { useAuth } from '../lib/auth';
import { Badge, Card, Eyebrow } from '../components/ui';
import { TeamCrest } from '../components/TeamCrest';

// Overview layout: one hero, two wide cells, then the rest in a grid.
const HERO = 'top-scorer';
const WIDE = ['win-rate', 'best-team'];

export default function LeaderboardPage() {
  const { stat } = useParams();
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadBoard()
      .then(b => live && setBoard(b))
      .catch(e => live && setErr(e.message));
    return () => { live = false; };
  }, []);

  const cat = categoryByKey(stat);
  if (stat && !cat) return <Navigate to="/leaderboard" replace />;

  return (
    <div>
      {cat ? <BackLink /> : null}
      <h1 className={`font-display text-6xl leading-none text-bone ${cat ? 'mt-4' : ''}`}>
        {cat ? cat.title : 'LEADERBOARD'}
      </h1>

      {err && (
        <div role="alert" className="text-coral font-mono text-xs mt-6">
          Couldn&apos;t load the leaderboard: {err}. Reload the page to try again.
        </div>
      )}
      {!board && !err && (
        <p role="status" className="font-mono text-[12px] text-bone/60 mt-6">Loading results…</p>
      )}

      {board && board.players.length === 0 && (
        <Card className="p-10 text-center mt-10">
          <Eyebrow>empty</Eyebrow>
          <p className="font-display text-3xl mt-3 text-bone/70">No results yet.</p>
          <p className="text-bone/70 mt-2 text-[14px] max-w-md mx-auto">
            The leaderboard fills in as soon as a tournament has its first result.
          </p>
        </Card>
      )}

      {board && board.players.length > 0 && (cat ? <StatTable cat={cat} board={board} /> : <Overview board={board} />)}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/leaderboard"
      className="inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-widest2 text-bone/70 hover:text-pitch outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pitch"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M6.5 1.5 3 5l3.5 3.5" />
      </svg>
      Leaderboard
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Who: a player's monogram or a team's crest
// ---------------------------------------------------------------------------

function Who({ s, cat, lead = false }: { s: Stats; cat: Category; lead?: boolean }) {
  if (cat.subject === 'team') return <TeamCrest name={s.name} logoUrl={s.logoUrl} size="md" />;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center border bg-ash/60 font-display text-xl leading-none ${
        lead ? 'border-pitch/60 text-pitch' : 'border-hairline text-bone/75'
      }`}
    >
      {s.name.charAt(0).toUpperCase()}
    </span>
  );
}

function Bar({ share, lead, delay = 0 }: { share: number; lead?: boolean; delay?: number }) {
  return (
    <div aria-hidden="true" className="h-[3px] bg-hairline">
      <div
        className={`bar-grow h-full ${lead ? 'bg-pitch' : 'bg-bone/35'}`}
        style={{ width: `${Math.round(share * 100)}%`, '--bar-delay': `${delay}ms` } as CSSProperties}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function Overview({ board }: { board: Board }) {
  const { user } = useAuth();
  const meId = user?.player_id ?? null;
  const rank = (key: string) => {
    const cat = categoryByKey(key) as Category;
    return { cat, ranking: rankCategory(cat, board) };
  };
  const hero = rank(HERO);
  const wide = WIDE.map(rank);
  const rest = CATEGORIES.filter(c => c.key !== HERO && !WIDE.includes(c.key)).map(c => rank(c.key));

  return (
    <>
      <p className="mt-3 text-[14px] text-bone/70 max-w-md">
        {board.matches} {board.matches === 1 ? 'match' : 'matches'} played across {board.tournaments}{' '}
        {board.tournaments === 1 ? 'tournament' : 'tournaments'}. Open any stat for the full table.
      </p>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-px bg-hairline border border-hairline">
        <Hero {...hero} meId={meId} />
        {wide.map(w => (
          <Cell key={w.cat.key} {...w} meId={meId} wide className="lg:col-span-6" />
        ))}
        {rest.map(r => (
          <Cell key={r.cat.key} {...r} meId={meId} className="lg:col-span-3" />
        ))}
      </div>
    </>
  );
}

const CELL_LINK =
  'group relative block bg-ink hover:bg-ash/70 transition-colors outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pitch';

/** Why a stat has no leader: nobody qualifies yet, or nobody has scored on it. */
function emptyText(cat: Category, ranking: Ranking) {
  if (ranking.idle.length > 0 && cat.noneYet) return cat.noneYet;
  return `Nobody has played ${cat.minPlayed} matches yet.`;
}

function Footer({ cat, ranking, meId }: { cat: Category; ranking: Ranking; meId: string | null }) {
  const mine = cat.subject === 'player' && meId ? ranking.ranked.find(r => r.s.id === meId) : undefined;
  return (
    <div className="mt-auto pt-5 flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-widest2">
      <span className="text-pitch">{mine && mine.rank > 3 ? `You're ${ordinal(mine.rank)}` : ''}</span>
      <span className="text-bone/55 group-hover:text-pitch group-focus-visible:text-pitch transition-colors">
        Full table<span className="sr-only"> for {cat.title}</span>
      </span>
    </div>
  );
}

/** Runner-up rows under a leader. */
function Chasers({ cat, rows, startDelay }: { cat: Category; rows: Row[]; startDelay: number }) {
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.s.id}>
          <div className="flex items-center gap-3">
            <span className="w-5 font-mono text-[12px] text-bone/55 number-display">{r.rank}</span>
            <span className="flex-1 min-w-0 truncate text-[14px] text-bone/85">{r.s.name}</span>
            <span className="font-mono text-[13px] text-bone/85 number-display">{cat.show(r.s)}</span>
          </div>
          <div className="pl-8 mt-1.5">
            <Bar share={r.share} delay={startDelay + i * 70} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function tiedWith(rows: Row[]) {
  const first = rows[0];
  const level = rows.filter(r => first && r !== first && r.rank === first.rank);
  return level.length > 0 ? ` Level with ${level.map(r => r.s.name).join(' and ')}.` : '';
}

function Cell({
  cat, ranking, meId, wide = false, className = '',
}: { cat: Category; ranking: Ranking; meId: string | null; wide?: boolean; className?: string }) {
  const [lead, ...others] = ranking.ranked;
  return (
    <Link to={`/leaderboard/${cat.key}`} className={`${CELL_LINK} ${className}`}>
      <div className={`flex h-full flex-col ${wide ? 'p-6 sm:p-8' : 'p-5 sm:p-6'}`}>
        <h2 className="font-display text-2xl leading-none text-bone/80">{cat.title}</h2>

        {!lead ? (
          <p className="mt-6 mb-2 text-[14px] text-bone/60">{emptyText(cat, ranking)}</p>
        ) : (
          <>
            <div className="mt-5 flex items-center gap-3">
              <Who s={lead.s} cat={cat} lead />
              <span className={`flex-1 min-w-0 truncate font-display leading-none text-bone ${wide ? 'text-5xl' : 'text-4xl'}`}>
                {lead.s.name}
              </span>
              <span className={`font-display leading-none text-pitch number-display ${wide ? 'text-5xl' : 'text-4xl'}`}>
                {cat.show(lead.s)}
              </span>
            </div>
            <div className="mt-3"><Bar share={lead.share} lead /></div>
            <p className="mt-3 mb-6 text-[13px] leading-snug text-bone/70 max-w-[34ch]">
              {cat.fact(lead.s)}{tiedWith(ranking.ranked)}
            </p>
            {others.length > 0 && <Chasers cat={cat} rows={others.slice(0, 2)} startDelay={140} />}
          </>
        )}
        <Footer cat={cat} ranking={ranking} meId={meId} />
      </div>
    </Link>
  );
}

function Hero({ cat, ranking, meId }: { cat: Category; ranking: Ranking; meId: string | null }) {
  const [lead, ...others] = ranking.ranked;
  return (
    <Link to={`/leaderboard/${cat.key}`} className={`${CELL_LINK} overflow-hidden md:col-span-2 lg:col-span-12`}>
      <PitchLines className="pointer-events-none absolute -right-16 -top-[45%] h-[160%] w-auto overflow-visible text-bone/[0.07]" />
      <div className="relative flex h-full flex-col p-6 sm:p-10">
        <h2 className="font-display text-3xl leading-none text-bone/80">{cat.title}</h2>
        {!lead ? (
          <p className="mt-8 mb-4 text-[14px] text-bone/60">{emptyText(cat, ranking)}</p>
        ) : (
          <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-end">
            <div>
              <div className="flex items-end justify-between gap-6">
                <span className="min-w-0 break-words font-display text-7xl sm:text-9xl leading-[0.85] text-bone">
                  {lead.s.name}
                </span>
                <span className="text-right">
                  <span className="block font-display text-7xl sm:text-9xl leading-[0.85] text-pitch number-display">
                    {cat.show(lead.s)}
                  </span>
                  <span className="mt-2 block font-mono text-[11px] uppercase tracking-widest2 text-bone/60">{cat.unit}</span>
                </span>
              </div>
              <div className="mt-6"><Bar share={lead.share} lead /></div>
              <p className="mt-4 text-[15px] leading-relaxed text-bone/80 max-w-[48ch]">
                {cat.fact(lead.s)}{tiedWith(ranking.ranked)}
              </p>
            </div>
            {others.length > 0 && <Chasers cat={cat} rows={others.slice(0, 3)} startDelay={160} />}
          </div>
        )}
        <Footer cat={cat} ranking={ranking} meId={meId} />
      </div>
    </Link>
  );
}

/** Half a pitch in outline: the one decorative thing on the page. */
function PitchLines({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 320 480" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <line x1="-200" y1="240" x2="520" y2="240" />
      <circle cx="160" cy="240" r="64" />
      <circle cx="160" cy="240" r="3" fill="currentColor" />
      <rect x="70" y="2" width="180" height="96" />
      <rect x="116" y="2" width="88" height="36" />
      <path d="M126 98a40 40 0 0 0 68 0" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Full table
// ---------------------------------------------------------------------------

const COLUMNS: { label: string; title: string; get: (s: Stats) => number }[] = [
  { label: 'P', title: 'Played', get: s => s.played },
  { label: 'W', title: 'Won', get: s => s.won },
  { label: 'D', title: 'Drawn', get: s => s.drawn },
  { label: 'L', title: 'Lost', get: s => s.lost },
  { label: 'GF', title: 'Goals for', get: s => s.goalsFor },
  { label: 'GA', title: 'Goals against', get: s => s.goalsAgainst },
];

function StatTable({ cat, board }: { cat: Category; board: Board }) {
  const { user } = useAuth();
  const meId = user?.player_id ?? null;
  const ranking = rankCategory(cat, board);
  const colSpan = 3 + COLUMNS.length;
  const minNote = cat.minPlayed ? ` Needs ${cat.minPlayed} matches to qualify.` : '';

  return (
    <div>
      <p className="mt-3 text-[14px] text-bone/70 max-w-lg">{cat.about}{minNote}</p>

      <Tabs active={cat.key} />

      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left">
          <caption className="sr-only">{cat.title}, best first</caption>
          <thead>
            <tr className="border-b border-hairline label-eyebrow">
              <th scope="col" className="py-3 pr-3 w-12 font-normal">#</th>
              <th scope="col" className="py-3 pr-4 font-normal">{cat.subject === 'team' ? 'Team' : 'Player'}</th>
              <th scope="col" className="py-3 pr-4 w-[40%] md:w-[28%] font-normal">{cat.unit}</th>
              {COLUMNS.map(c => (
                <th key={c.label} scope="col" className="hidden md:table-cell py-3 w-12 text-right font-normal">
                  <abbr title={c.title} className="no-underline">{c.label}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranking.ranked.map((r, i) => (
              <TableRow key={r.s.id} cat={cat} s={r.s} rank={String(r.rank)} share={r.share} index={i} mine={r.s.id === meId} />
            ))}
            {ranking.ranked.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="py-8 text-[14px] text-bone/60">{emptyText(cat, ranking)}</td>
              </tr>
            )}
            {ranking.idle.length > 0 && (
              <>
                <tr><th scope="rowgroup" colSpan={colSpan} className="pt-6 pb-2 text-left label-eyebrow text-bone/55 font-normal">{cat.noneYet}</th></tr>
                {ranking.idle.map(s => (
                  <TableRow key={s.id} cat={cat} s={s} rank="–" share={0} index={0} mine={s.id === meId} dim />
                ))}
              </>
            )}
            {ranking.pending.length > 0 && (
              <>
                <tr><th scope="rowgroup" colSpan={colSpan} className="pt-6 pb-2 text-left label-eyebrow text-bone/55 font-normal">Not enough matches yet</th></tr>
                {ranking.pending.map(s => (
                  <TableRow key={s.id} cat={cat} s={s} rank="–" share={0} index={0} mine={s.id === meId} dim />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TableRow({
  cat, s, rank, share, index, mine, dim = false,
}: { cat: Category; s: Stats; rank: string; share: number; index: number; mine: boolean; dim?: boolean }) {
  const lead = rank === '1';
  const note = cat.note?.(s);
  return (
    <tr className={`border-b border-hairline align-middle ${mine ? 'bg-pitch/[0.06]' : ''} ${dim ? 'opacity-60' : ''}`}>
      <td className={`py-4 pr-3 font-display text-3xl leading-none number-display ${lead ? 'text-pitch' : 'text-bone/60'}`}>
        {rank}
      </td>
      <td className="py-4 pr-4">
        <div className="flex items-center gap-3 min-w-0">
          <Who s={s} cat={cat} lead={lead} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {cat.subject === 'player' ? (
                <Link
                  to={`/players/${s.id}`}
                  className="font-display text-2xl leading-none text-bone hover:text-pitch truncate outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch"
                >
                  {s.name}
                </Link>
              ) : (
                <span className="font-display text-2xl leading-none text-bone truncate">{s.name}</span>
              )}
              {mine && <Badge tone="pitch">you</Badge>}
            </div>
            {note && <div className="mt-1 font-mono text-[12px] text-bone/60 truncate">{note}</div>}
            <div className="mt-1 md:hidden font-mono text-[12px] text-bone/60 number-display">
              {s.played} played, {s.won}-{s.drawn}-{s.lost}
            </div>
          </div>
        </div>
      </td>
      <td className="py-4 pr-4">
        <div className="font-display text-3xl leading-none text-bone number-display">{cat.show(s)}</div>
        {!dim && <div className="mt-2"><Bar share={share} lead={lead} delay={index * 45} /></div>}
      </td>
      {COLUMNS.map(c => (
        <td key={c.label} className="hidden md:table-cell py-4 text-right font-mono text-[13px] text-bone/75 number-display">
          {c.get(s)}
        </td>
      ))}
    </tr>
  );
}

/** Jump between stats without going back to the overview. */
function Tabs({ active }: { active: string }) {
  const current = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [active]);

  return (
    <nav aria-label="Stats" className="mt-8 -mx-6 px-6 overflow-x-auto no-scrollbar border-b border-hairline">
      <ul className="flex gap-6 whitespace-nowrap">
        {CATEGORIES.map(c => {
          const on = c.key === active;
          return (
            <li key={c.key}>
              <Link
                ref={on ? current : undefined}
                to={`/leaderboard/${c.key}`}
                aria-current={on ? 'page' : undefined}
                className={`block py-3 -mb-px border-b-2 font-mono text-[12px] uppercase tracking-widest2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch ${
                  on ? 'border-pitch text-pitch' : 'border-transparent text-bone/65 hover:text-bone'
                }`}
              >
                {c.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
