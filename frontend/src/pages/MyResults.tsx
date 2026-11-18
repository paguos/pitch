import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, MyMatch, MyResult } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Card, Eyebrow, Stat } from '../components/ui';
import { TeamCrest } from '../components/TeamCrest';

type Outcome = 'W' | 'D' | 'L' | null;

function outcome(m: MyMatch): Outcome {
  if (m.home_goals == null || m.away_goals == null) return null;
  const mine = m.is_home ? m.home_goals : m.away_goals;
  const theirs = m.is_home ? m.away_goals : m.home_goals;
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
}

const OUTCOME_STYLE: Record<'W' | 'D' | 'L', string> = {
  W: 'text-pitch border-pitch/60',
  D: 'text-bone/70 border-hairline',
  L: 'text-coral border-coral/60',
};

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
        <Eyebrow accent="pitch">/ {user?.player_name ?? 'results'}</Eyebrow>
        <h1 className="font-display text-6xl leading-none text-bone mt-2">MY RESULTS</h1>
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
          <div className="grid grid-cols-4 gap-6">
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
            return (
              <li key={m.id} className="flex items-center gap-4 px-5 py-3 border-b border-hairline last:border-0">
                <span className="w-20 shrink-0 whitespace-nowrap font-mono text-[11px] uppercase tracking-widest2 text-bone/55">round {m.round}</span>
                <span className={`flex-1 text-right truncate text-[14px] ${m.is_home ? 'text-bone' : 'text-bone/70'}`}>{m.home_name}</span>
                <span className="w-16 text-center font-display text-2xl number-display text-bone">
                  {m.home_goals != null && m.away_goals != null ? `${m.home_goals}–${m.away_goals}` : <span className="font-mono text-[12px] text-bone/50">vs</span>}
                </span>
                <span className={`flex-1 truncate text-[14px] ${m.is_home ? 'text-bone/70' : 'text-bone'}`}>{m.away_name}</span>
                <span className="w-7 text-right">
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
