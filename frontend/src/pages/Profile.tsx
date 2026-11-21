import { ReactNode, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, MyResult, Player } from '../lib/api';
import { useAuth } from '../lib/auth';
import { OUTCOME_LABEL, OUTCOME_STYLE, outcome, summarize } from '../lib/results';
import { Badge, Card } from '../components/ui';
import { TeamCrest } from '../components/TeamCrest';

const ORDINAL = ['th', 'st', 'nd', 'rd'];
function ordinal(n: number) {
  const v = n % 100;
  return `${n}${ORDINAL[(v - 20) % 10] || ORDINAL[v] || ORDINAL[0]}`;
}

// Live tournaments first, then drafts, then finished ones; newest first within each.
const STATUS_ORDER = { ACTIVE: 0, DRAFT: 1, COMPLETED: 2 } as const;
function byRelevance(a: MyResult, b: MyResult) {
  const d = STATUS_ORDER[a.tournament.status] - STATUS_ORDER[b.tournament.status];
  return d || Date.parse(b.tournament.created_at) - Date.parse(a.tournament.created_at);
}

function fmtDay(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function fmtMonth(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function ProfilePage() {
  const { user, isAdmin } = useAuth();
  // /profile is your own page; /players/:id is read-only and open to everyone signed in.
  const { id } = useParams();
  const own = !id || id === user?.player_id;
  const playerId = id ?? user?.player_id ?? null;
  const [results, setResults] = useState<MyResult[] | null>(null);
  const [me, setMe] = useState<Player | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setResults(null);
    setMe(null);
    setErr(null);
    (id ? api.playerResults(id) : api.myResults())
      .then(r => live && setResults(r))
      .catch(e => live && setErr(e.message));
    // Email and role only come back for your own player, or for everyone if you're an admin.
    if (playerId) {
      api.getPlayer(playerId)
        .then(p => live && setMe(p))
        .catch(() => {});
    }
    return () => { live = false; };
  }, [id, playerId]);

  const name = own ? (user?.player_name ?? user?.username ?? '') : (me?.display_name ?? '');
  const showAdminBadge = own ? isAdmin : me?.role === 'admin';
  const sum = results ? summarize(results) : null;

  return (
    <div>
      {name && <header className="flex items-center gap-5 sm:gap-7">
        <div
          aria-hidden="true"
          className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center border border-pitch/60 bg-ash/60 font-display text-6xl sm:text-7xl leading-none text-pitch"
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-5xl sm:text-6xl leading-none text-bone break-words" data-testid="profile-name">
            {name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {showAdminBadge && <Badge tone="coral">admin</Badge>}
            {me?.email && <span className="font-mono text-[12px] text-bone/75 break-all">{me.email}</span>}
            {me?.created_at && (
              <span className="font-mono text-[12px] text-bone/60">Joined {fmtMonth(me.created_at)}</span>
            )}
          </div>
        </div>
      </header>}

      {err && <div className="text-coral font-mono text-xs mt-8">{err}</div>}

      {own && !user?.player_id && results && (
        <Card className="mt-10 p-8">
          <p className="font-display text-3xl text-bone/70">No player attached.</p>
          <p className="text-bone/70 mt-2 text-[14px] max-w-md leading-relaxed">
            The admin account isn&apos;t a player, so it has no matches or stats. Players see theirs
            after signing in with Google.
          </p>
        </Card>
      )}

      {results && playerId && (
        results.length === 0 ? (
          <Card className="mt-10 p-8">
            <p className="font-display text-3xl text-bone/70">No tournaments yet.</p>
            <p className="text-bone/70 mt-2 text-[14px] max-w-md leading-relaxed">
              {own ? 'Once an admin adds you to a tournament, your' : 'Once they join a tournament, their'} matches and standing show up here.{' '}
              <Link to="/" className="text-pitch hover:underline">Browse tournaments</Link>
            </p>
          </Card>
        ) : (
          <>
            {sum && sum.played > 0 && <RecordBand sum={sum} />}
            <Tournaments results={[...results].sort(byRelevance)} />
          </>
        )
      )}
    </div>
  );
}

function RecordBand({ sum }: { sum: ReturnType<typeof summarize> }) {
  const form = sum.log.slice(0, 5).reverse(); // oldest → newest, so the latest sits on the right
  const segments = [
    { key: 'W', n: sum.won, bar: 'bg-pitch', text: 'text-pitch', label: 'Won' },
    { key: 'D', n: sum.drawn, bar: 'bg-bone/30', text: 'text-bone/80', label: 'Drawn' },
    { key: 'L', n: sum.lost, bar: 'bg-coral', text: 'text-coral', label: 'Lost' },
  ];
  const diff = sum.goalsFor - sum.goalsAgainst;

  return (
    <section className="mt-10" aria-label="Record">
      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div>
            <div className="label-eyebrow">record</div>
            <div className="mt-1 font-display text-6xl sm:text-7xl leading-none text-bone">
              {sum.won}-{sum.drawn}-{sum.lost}
            </div>
          </div>
          <div>
            <div className="label-eyebrow">last {form.length}</div>
            <ul className="mt-2 flex gap-1.5" aria-label="Recent form, oldest to newest">
              {form.map(m => (
                <li
                  key={m.id}
                  title={`${OUTCOME_LABEL[m.outcome]} ${m.mine}–${m.theirs} vs ${m.opponent}`}
                  className={`flex h-9 w-9 items-center justify-center border font-mono text-[13px] ${OUTCOME_STYLE[m.outcome]}`}
                >
                  <span aria-hidden="true">{m.outcome}</span>
                  <span className="sr-only">{OUTCOME_LABEL[m.outcome]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* One bar, three shares: the page's single bold gesture. */}
        <div
          role="img"
          aria-label={`${sum.won} won, ${sum.drawn} drawn, ${sum.lost} lost`}
          className="mt-7 flex h-3 w-full gap-px bg-hairline"
        >
          {segments.filter(s => s.n > 0).map(s => (
            <div key={s.key} className={s.bar} style={{ flexGrow: s.n, flexBasis: 0 }} />
          ))}
        </div>
        <div className="mt-2 flex gap-5 font-mono text-[12px]">
          {segments.map(s => (
            <span key={s.key} className={s.text}>{s.label} {s.n}</span>
          ))}
        </div>

        <dl className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-5 border-t border-hairline pt-5">
          <Figure label="Matches played">{sum.played}</Figure>
          <Figure label="Win rate">{sum.winRate}%</Figure>
          <Figure label="Goals for / against">
            {sum.goalsFor} / {sum.goalsAgainst}
            <span className={`ml-2 font-mono text-[13px] ${diff > 0 ? 'text-pitch' : diff < 0 ? 'text-coral' : 'text-bone/60'}`}>
              {diff > 0 ? `+${diff}` : diff}
            </span>
          </Figure>
          <Figure label="Tournaments">{sum.tournaments}</Figure>
        </dl>
      </Card>
    </section>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="label-eyebrow">{label}</dt>
      <dd className="mt-1 font-display text-3xl leading-none text-bone">{children}</dd>
    </div>
  );
}

function Tournaments({ results }: { results: MyResult[] }) {
  // Live tournaments start open: that's where the next match is.
  const [open, setOpen] = useState(() => new Set(results.filter(r => r.tournament.status === 'ACTIVE').map(r => r.tournament.id)));
  const toggle = (id: string) =>
    setOpen(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <section className="mt-10" aria-label="Tournaments">
      <h2 className="font-display text-3xl leading-none text-bone mb-4">Tournaments</h2>
      <div className="space-y-3" data-testid="profile-tournaments">
        {results.map(r => (
          <TournamentRow key={r.tournament.id} r={r} open={open.has(r.tournament.id)} onToggle={() => toggle(r.tournament.id)} />
        ))}
      </div>
    </section>
  );
}

function TournamentRow({ r, open, onToggle }: { r: MyResult; open: boolean; onToggle: () => void }) {
  const t = r.tournament;
  const s = r.standing;
  const panelId = `tournament-${t.id}`;
  const diff = s ? s.GoalDiff : 0;

  return (
    <Card data-testid={`profile-tournament-${t.name}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-4 p-4 sm:p-5 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pitch"
      >
        <TeamCrest name={r.participant.team_name} logoUrl={r.participant.team_logo_url} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-2xl sm:text-3xl leading-none text-bone">{t.name}</span>
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-mono text-[12px] text-bone/75">{r.participant.team_name}</span>
            <Badge tone={t.status === 'ACTIVE' ? 'live' : t.status === 'COMPLETED' ? 'pitch' : 'neutral'}>{t.status}</Badge>
          </span>
        </span>
        {s && (
          <span className="flex shrink-0 items-end gap-5 sm:gap-8">
            <span className="text-right">
              <span className="block font-display text-3xl sm:text-4xl leading-none text-pitch">
                {r.position ? ordinal(r.position) : '—'}
              </span>
              <span className="sr-only">place</span>
            </span>
            <span className="hidden sm:block text-right">
              <span className="block font-mono text-[14px] text-bone">{s.Won}-{s.Drawn}-{s.Lost}</span>
              <span className={`block font-mono text-[12px] ${diff > 0 ? 'text-pitch' : diff < 0 ? 'text-coral' : 'text-bone/60'}`}>
                {diff > 0 ? `+${diff}` : diff} GD
              </span>
            </span>
            <span className="hidden sm:block text-right">
              <span className="block font-mono text-[14px] text-bone">{s.Points}</span>
              <span className="block font-mono text-[12px] text-bone/60">pts</span>
            </span>
          </span>
        )}
        <span aria-hidden="true" className={`shrink-0 font-mono text-bone/60 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
      </button>

      {open && (
        <div id={panelId} className="border-t border-hairline">
          {r.matches.length === 0 ? (
            <p className="p-5 text-[14px] text-bone/60">
              {t.status === 'DRAFT' ? "The tournament hasn't started yet." : 'No matches yet.'}
            </p>
          ) : (
            <ul>
              {r.matches.map(m => {
                const o = outcome(m);
                const opponent = m.is_home ? m.away_name : m.home_name;
                const opponentPlayer = m.is_home ? m.away_player : m.home_player;
                const mine = m.is_home ? m.home_goals : m.away_goals;
                const theirs = m.is_home ? m.away_goals : m.home_goals;
                return (
                  <li key={m.id} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 border-b border-hairline last:border-0">
                    <span className="w-12 shrink-0 font-mono text-[11px] uppercase tracking-widest2 text-bone/60">
                      {fmtDay(m.played_at) || `R${m.round}`}
                    </span>
                    <span
                      className="flex min-w-0 flex-1 items-center gap-2 text-[14px] text-bone"
                      title={`${m.is_home ? 'vs' : 'at'} ${opponent}${opponentPlayer ? `, played by ${opponentPlayer}` : ''}`}
                    >
                      <span className="shrink-0 font-mono text-[11px] uppercase tracking-widest2 text-bone/60">{m.is_home ? 'vs' : 'at'}</span>
                      <span className="truncate">{opponent}</span>
                      {opponentPlayer && (
                        <span className="shrink-0 max-w-[7rem] truncate border border-hairline px-1.5 py-px font-mono text-[11px] text-bone/80">
                          <span className="sr-only">played by </span>
                          {opponentPlayer}
                        </span>
                      )}
                    </span>
                    <span className="w-14 shrink-0 text-center font-display text-2xl number-display text-bone">
                      {o ? `${mine}–${theirs}` : <span className="font-mono text-[12px] text-bone/60">—</span>}
                    </span>
                    <span className="w-6 shrink-0">
                      {o && (
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center border font-mono text-[12px] ${OUTCOME_STYLE[o]}`}
                          aria-label={OUTCOME_LABEL[o]}
                        >
                          {o}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            to={`/tournaments/${t.id}`}
            className="block border-t border-hairline px-4 sm:px-5 py-3 font-mono text-[12px] text-bone/75 hover:text-pitch outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pitch"
          >
            Open {t.name}
          </Link>
        </div>
      )}
    </Card>
  );
}
