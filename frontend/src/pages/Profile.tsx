import { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, MyResult, Player } from '../lib/api';
import { useAuth } from '../lib/auth';
import { OUTCOME_LABEL, OUTCOME_STYLE, PlayedMatch, summarize } from '../lib/results';
import { Badge, Card } from '../components/ui';

const PAGE = 10;

function fmtDay(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function fmtMonth(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function ProfilePage() {
  const { user, isAdmin } = useAuth();
  const [results, setResults] = useState<MyResult[] | null>(null);
  const [me, setMe] = useState<Player | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    api.myResults().then(setResults).catch(e => setErr(e.message));
    // Viewers only get their own email back from /players, which is all we need.
    if (user?.player_id) {
      api.listPlayers()
        .then(ps => setMe(ps.find(p => p.id === user.player_id) ?? null))
        .catch(() => {});
    }
  }, [user?.player_id]);

  const name = user?.player_name ?? user?.username ?? '';
  const sum = results ? summarize(results) : null;

  return (
    <div>
      <header className="flex items-center gap-5 sm:gap-7">
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
            {isAdmin && <Badge tone="coral">admin</Badge>}
            {me?.email && <span className="font-mono text-[12px] text-bone/75 break-all">{me.email}</span>}
            {me?.created_at && (
              <span className="font-mono text-[12px] text-bone/60">Joined {fmtMonth(me.created_at)}</span>
            )}
          </div>
        </div>
      </header>

      {err && <div className="text-coral font-mono text-xs mt-8">{err}</div>}

      {!user?.player_id && results && (
        <Card className="mt-10 p-8">
          <p className="font-display text-3xl text-bone/70">No player attached.</p>
          <p className="text-bone/70 mt-2 text-[14px] max-w-md leading-relaxed">
            The admin account isn&apos;t a player, so it has no matches or stats. Players see theirs
            after signing in with Google.
          </p>
        </Card>
      )}

      {sum && user?.player_id && (
        sum.played === 0 ? (
          <Card className="mt-10 p-8">
            <p className="font-display text-3xl text-bone/70">No matches played yet.</p>
            <p className="text-bone/70 mt-2 text-[14px] max-w-md leading-relaxed">
              Your record and recent form show up here after your first result.{' '}
              <Link to="/" className="text-pitch hover:underline">Browse tournaments</Link>
            </p>
          </Card>
        ) : (
          <>
            <RecordBand sum={sum} />
            <MatchLog log={sum.log} shown={shown} onMore={() => setShown(n => n + PAGE)} />
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

function MatchLog({ log, shown, onMore }: { log: PlayedMatch[]; shown: number; onMore: () => void }) {
  return (
    <section className="mt-10" aria-label="Matches">
      <h2 className="font-display text-3xl leading-none text-bone mb-4">Matches</h2>
      <Card>
        <ul data-testid="profile-matches">
          {log.slice(0, shown).map(m => (
            <li key={m.id} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 border-b border-hairline last:border-0">
              <span className="w-12 shrink-0 font-mono text-[11px] uppercase tracking-widest2 text-bone/60">
                {fmtDay(m.played_at) || `R${m.round}`}
              </span>
              <span className="flex-1 min-w-0">
                <span
                  className="flex items-center gap-2 min-w-0 text-[14px] text-bone"
                  title={`${m.is_home ? 'vs' : 'at'} ${m.opponent}, played by ${m.opponentPlayer}`}
                >
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-widest2 text-bone/60">{m.is_home ? 'vs' : 'at'}</span>
                  <span className="truncate">{m.opponent}</span>
                  {m.opponentPlayer && (
                    <span className="shrink-0 max-w-[7rem] truncate border border-hairline px-1.5 py-px font-mono text-[11px] text-bone/80">
                      <span className="sr-only">played by </span>
                      {m.opponentPlayer}
                    </span>
                  )}
                </span>
                <Link
                  to={`/tournaments/${m.tournamentId}`}
                  className="block truncate font-mono text-[12px] text-bone/60 hover:text-pitch"
                >
                  {m.tournamentName}
                </Link>
              </span>
              <span className="w-14 shrink-0 text-center font-display text-2xl number-display text-bone">
                {m.mine}–{m.theirs}
              </span>
              <span
                className={`inline-flex w-6 h-6 shrink-0 items-center justify-center border font-mono text-[12px] ${OUTCOME_STYLE[m.outcome]}`}
                aria-label={OUTCOME_LABEL[m.outcome]}
              >
                {m.outcome}
              </span>
            </li>
          ))}
        </ul>
        {log.length > shown && (
          <button
            type="button"
            onClick={onMore}
            className="w-full border-t border-hairline py-3 font-mono text-[12px] uppercase tracking-widest2 text-bone/75 hover:text-pitch outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pitch"
          >
            Show more ({log.length - shown} left)
          </button>
        )}
      </Card>
    </section>
  );
}
