import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, MyResult } from '../lib/api';
import { useAuth } from '../lib/auth';
import { outcome, OUTCOME_STYLE } from '../lib/results';
import { Badge, Card, Stat } from '../components/ui';
import { TeamCrest } from '../components/TeamCrest';

const ORDINAL = ['th', 'st', 'nd', 'rd'];
function ordinal(n: number) {
  const v = n % 100;
  return `${n}${ORDINAL[(v - 20) % 10] || ORDINAL[v] || ORDINAL[0]}`;
}

export default function MyResultsPage() {
  const { user } = useAuth();
  const [results, setResults] = useState<MyResult[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.myResults().then(setResults).catch(e => setErr(e.message));
  }, []);

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-6xl leading-none text-bone">MY RESULTS</h1>
      </div>

      {err && <div className="text-coral font-mono text-xs mb-4">{err}</div>}

      {results && results.length === 0 && (
        <Card className="p-10 text-center">
          <p className="font-display text-3xl text-bone/70">Nothing to show yet.</p>
          <p className="text-bone/70 mt-2 text-[14px] max-w-md mx-auto">
            {user?.player_id
              ? 'Once an admin adds you to a tournament, your matches and standing appear here.'
              : "The admin account isn't a player, so it has no results. Players see theirs after signing in with Google."}
          </p>
        </Card>
      )}

      <div className="space-y-6">
        {results?.map(r => <ResultCard key={r.tournament.id} r={r} />)}
      </div>
    </div>
  );
}

function ResultCard({ r }: { r: MyResult }) {
  const t = r.tournament;
  const s = r.standing;
  return (
    <Card data-testid={`my-result-${t.name}`}>
      <div className="p-5 flex flex-wrap items-center gap-5 border-b border-hairline">
        <TeamCrest name={r.participant.team_name} logoUrl={r.participant.team_logo_url} size="lg" />
        <div className="flex-1 min-w-[12rem]">
          <Link to={`/tournaments/${t.id}`} className="font-display text-3xl leading-none text-bone hover:text-pitch transition-colors">
            {t.name}
          </Link>
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[12px] text-bone/75">{r.participant.team_name}</span>
            <Badge tone={t.status === 'ACTIVE' ? 'live' : t.status === 'COMPLETED' ? 'pitch' : 'neutral'}>{t.status}</Badge>
            <span className="font-mono text-[11px] uppercase tracking-widest2 text-bone/55">{t.format}</span>
          </div>
        </div>
        {s && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-4 w-full sm:w-auto">
            <Stat label="place" value={r.position ? ordinal(r.position) : '—'} accent="pitch" />
            <Stat label="record" value={`${s.Won}-${s.Drawn}-${s.Lost}`} />
            <Stat label="goal diff" value={s.GoalDiff > 0 ? `+${s.GoalDiff}` : String(s.GoalDiff)} />
            <Stat label="points" value={s.Points} accent="coral" />
          </div>
        )}
      </div>

      {r.matches.length === 0 ? (
        <p className="p-5 text-[14px] text-bone/60">
          {t.status === 'DRAFT' ? "The tournament hasn't started yet." : 'No matches for you yet.'}
        </p>
      ) : (
        <ul>
          {r.matches.map(m => {
            const o = outcome(m);
            const played = m.home_goals != null && m.away_goals != null;
            const opponent = m.is_home ? m.away_name : m.home_name;
            const mine = m.is_home ? m.home_goals : m.away_goals;
            const theirs = m.is_home ? m.away_goals : m.home_goals;
            return (
              <li key={m.id} className="flex items-center gap-3 sm:gap-4 px-5 py-3 border-b border-hairline last:border-0">
                <span className="w-16 sm:w-20 shrink-0 whitespace-nowrap font-mono text-[11px] uppercase tracking-widest2 text-bone/60">round {m.round}</span>
                <span className="flex-1 min-w-0 truncate text-[14px] text-bone" title={`${m.is_home ? 'vs' : 'at'} ${opponent}`}>
                  <span className="font-mono text-[11px] uppercase tracking-widest2 text-bone/60 mr-2">{m.is_home ? 'vs' : 'at'}</span>
                  {opponent}
                </span>
                <span className="w-14 shrink-0 text-center font-display text-2xl number-display text-bone">
                  {played ? `${mine}–${theirs}` : <span className="font-mono text-[12px] text-bone/60">—</span>}
                </span>
                <span className="w-6 shrink-0">
                  {o && (
                    <span className={`inline-flex w-6 h-6 items-center justify-center border font-mono text-[12px] ${OUTCOME_STYLE[o]}`} aria-label={o === 'W' ? 'win' : o === 'L' ? 'loss' : 'draw'}>
                      {o}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
