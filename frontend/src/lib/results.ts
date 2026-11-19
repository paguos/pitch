import { MyMatch, MyResult } from './api';

export type Outcome = 'W' | 'D' | 'L';

// The result of a match from the signed-in player's side, or null if unplayed.
export function outcome(m: MyMatch): Outcome | null {
  if (m.home_goals == null || m.away_goals == null) return null;
  const mine = m.is_home ? m.home_goals : m.away_goals;
  const theirs = m.is_home ? m.away_goals : m.home_goals;
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
}

export const OUTCOME_STYLE: Record<Outcome, string> = {
  W: 'text-pitch border-pitch/60',
  D: 'text-bone/70 border-hairline',
  L: 'text-coral border-coral/60',
};

export const OUTCOME_LABEL: Record<Outcome, string> = { W: 'win', D: 'draw', L: 'loss' };

export type PlayedMatch = MyMatch & {
  tournamentId: string;
  tournamentName: string;
  teamName: string;
  outcome: Outcome;
  mine: number;
  theirs: number;
  opponent: string;
  opponentPlayer: string;
};

export type Summary = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  tournaments: number;
  winRate: number | null; // 0–100, null before the first match
  // Played matches, newest first.
  log: PlayedMatch[];
};

// Flattens every tournament's matches into one played-match log and totals it.
export function summarize(results: MyResult[]): Summary {
  const log: PlayedMatch[] = [];
  for (const r of results) {
    for (const m of r.matches) {
      const o = outcome(m);
      if (!o) continue;
      const mine = (m.is_home ? m.home_goals : m.away_goals) as number;
      const theirs = (m.is_home ? m.away_goals : m.home_goals) as number;
      log.push({
        ...m,
        tournamentId: r.tournament.id,
        tournamentName: r.tournament.name,
        teamName: r.participant.team_name,
        outcome: o,
        mine,
        theirs,
        opponent: m.is_home ? m.away_name : m.home_name,
        opponentPlayer: m.is_home ? m.away_player : m.home_player,
      });
    }
  }
  // Newest first. Matches without a timestamp sort after dated ones.
  log.sort((a, b) => {
    const ta = a.played_at ? Date.parse(a.played_at) : 0;
    const tb = b.played_at ? Date.parse(b.played_at) : 0;
    return tb - ta;
  });

  const count = (o: Outcome) => log.filter(m => m.outcome === o).length;
  const won = count('W');
  return {
    played: log.length,
    won,
    drawn: count('D'),
    lost: count('L'),
    goalsFor: log.reduce((n, m) => n + m.mine, 0),
    goalsAgainst: log.reduce((n, m) => n + m.theirs, 0),
    tournaments: results.length,
    winRate: log.length ? Math.round((won / log.length) * 100) : null,
    log,
  };
}
