import { api, MyResult } from './api';
import { PlayedMatch, summarize } from './results';

/** Rate stats (win rate, per-match averages) only rank players with this many matches. */
export const MIN_MATCHES = 3;

/** One row of any leaderboard: a player, or a team for the team stats. */
export type Stats = {
  id: string;
  name: string;
  /** Crest for teams; players have none. */
  logoUrl: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  /** 0–100. */
  winRate: number;
  goalsPerMatch: number;
  concededPerMatch: number;
  cleanSheets: number;
  /** Longest run of wins in a row, across tournaments. */
  winStreak: number;
  /** Tournaments won: a league finished first, or a knockout final won. */
  titles: number;
  /** The single win with the biggest margin. */
  bestWin: PlayedMatch | null;
};

export type Board = {
  players: Stats[];
  teams: Stats[];
  /** Distinct matches with a result. */
  matches: number;
  /** Tournaments with at least one result. */
  tournaments: number;
};

type PlayerInput = { id: string; name: string; results: MyResult[] };

const time = (m: PlayedMatch) => (m.played_at ? Date.parse(m.played_at) : 0);
const margin = (m: PlayedMatch) => m.mine - m.theirs;

function computeStats(
  id: string,
  name: string,
  logoUrl: string | null,
  log: PlayedMatch[],
  titles = 0,
): Stats {
  const oldestFirst = [...log].sort((a, b) => time(a) - time(b) || a.round - b.round);
  let streak = 0;
  let winStreak = 0;
  let cleanSheets = 0;
  let bestWin: PlayedMatch | null = null;
  for (const m of oldestFirst) {
    if (m.theirs === 0) cleanSheets++;
    if (m.outcome === 'W') {
      streak++;
      winStreak = Math.max(winStreak, streak);
      if (!bestWin || margin(m) > margin(bestWin) || (margin(m) === margin(bestWin) && m.mine > bestWin.mine)) {
        bestWin = m;
      }
    } else {
      streak = 0;
    }
  }
  const played = log.length;
  const won = log.filter(m => m.outcome === 'W').length;
  const drawn = log.filter(m => m.outcome === 'D').length;
  const goalsFor = log.reduce((n, m) => n + m.mine, 0);
  const goalsAgainst = log.reduce((n, m) => n + m.theirs, 0);
  return {
    id,
    name,
    logoUrl,
    played,
    won,
    drawn,
    lost: played - won - drawn,
    goalsFor,
    goalsAgainst,
    goalDiff: goalsFor - goalsAgainst,
    winRate: played ? (won / played) * 100 : 0,
    goalsPerMatch: played ? goalsFor / played : 0,
    concededPerMatch: played ? goalsAgainst / played : 0,
    cleanSheets,
    winStreak,
    titles,
    bestWin,
  };
}

/** Builds every stat from each player's own results. Players with no played match are left out. */
export function buildBoard(input: PlayerInput[]): Board {
  // The final of a knockout is its last round. Both finalists carry that match
  // in their results, so the highest round seen anywhere is the final's round.
  const finalRound = new Map<string, number>();
  for (const p of input) {
    for (const r of p.results) {
      for (const m of r.matches) {
        finalRound.set(r.tournament.id, Math.max(finalRound.get(r.tournament.id) ?? 0, m.round));
      }
    }
  }

  const matchIds = new Set<string>();
  const tournamentIds = new Set<string>();
  const teamLogs = new Map<string, { logo: string | null; log: PlayedMatch[] }>();
  const players: Stats[] = [];

  for (const p of input) {
    const log: PlayedMatch[] = [];
    let titles = 0;
    for (const r of p.results) {
      const played = summarize([r]).log;
      log.push(...played);
      if (played.length > 0) tournamentIds.add(r.tournament.id);
      for (const m of played) matchIds.add(m.id);

      const team = teamLogs.get(r.participant.team_name) ?? { logo: null, log: [] };
      team.logo = team.logo ?? r.participant.team_logo_url;
      team.log.push(...played);
      teamLogs.set(r.participant.team_name, team);

      if (r.tournament.status === 'COMPLETED') {
        const champion =
          r.tournament.format === 'knockout'
            ? played.some(m => m.round === finalRound.get(r.tournament.id) && m.outcome === 'W')
            : r.position === 1;
        if (champion) titles++;
      }
    }
    if (log.length > 0) players.push(computeStats(p.id, p.name, null, log, titles));
  }

  const teams = [...teamLogs]
    .filter(([, t]) => t.log.length > 0)
    .map(([name, t]) => computeStats(name, name, t.logo, t.log));

  return { players, teams, matches: matchIds.size, tournaments: tournamentIds.size };
}

/**
 * Loads the leaderboard from the existing read endpoints: the player list,
 * then each player's results. Every signed-in user can read both.
 */
export async function loadBoard(): Promise<Board> {
  const players = await api.listPlayers();
  const results = await Promise.all(players.map(p => api.playerResults(p.id)));
  return buildBoard(players.map((p, i) => ({ id: p.id, name: p.display_name, results: results[i] ?? [] })));
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type Category = {
  key: string;
  title: string;
  /** One sentence on what the stat counts, shown on its table page. */
  about: string;
  /** Short name for the headline figure, used as its column heading. */
  unit: string;
  subject: 'player' | 'team';
  /** Matches needed to be ranked. Omitted when everyone with a match counts. */
  minPlayed?: number;
  better: 'high' | 'low';
  /** Counting stats where 0 means "nobody has done this yet", so 0 is not ranked. */
  needsPositive?: boolean;
  /** Shown instead of a leader when needsPositive stats are all 0. */
  noneYet?: string;
  /** How bar lengths are drawn. Defaults to a plain share of the leader's value. */
  bar?: 'share' | 'range';
  value: (s: Stats) => number;
  show: (s: Stats) => string;
  /** A sentence about the leader. */
  fact: (s: Stats) => string;
  /** A short line under each name in the full table. */
  note?: (s: Stats) => string | null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export const CATEGORIES: Category[] = [
  {
    key: 'top-scorer',
    title: 'Top scorer',
    about: 'Total goals scored in every match played.',
    unit: 'Goals',
    subject: 'player',
    better: 'high',
    value: s => s.goalsFor,
    show: s => String(s.goalsFor),
    fact: s =>
      `${s.name} has scored ${plural(s.goalsFor, 'goal')} in ${plural(s.played, 'match', 'matches')}, ${s.goalsPerMatch.toFixed(1)} a game.`,
  },
  {
    key: 'win-rate',
    title: 'Highest win rate',
    about: 'The share of matches won.',
    unit: 'Win rate',
    subject: 'player',
    minPlayed: MIN_MATCHES,
    better: 'high',
    value: s => s.winRate,
    show: s => `${Math.round(s.winRate)}%`,
    fact: s => `${s.name} has won ${s.won} of ${plural(s.played, 'match', 'matches')}.`,
  },
  {
    key: 'best-team',
    title: 'Best team',
    about: 'Teams ranked by win rate, whoever picked them.',
    unit: 'Win rate',
    subject: 'team',
    minPlayed: MIN_MATCHES,
    better: 'high',
    value: s => s.winRate,
    show: s => `${Math.round(s.winRate)}%`,
    fact: s => `${s.name} has won ${s.won} of ${plural(s.played, 'match', 'matches')}.`,
  },
  {
    key: 'most-wins',
    title: 'Most wins',
    about: 'Total matches won.',
    unit: 'Wins',
    subject: 'player',
    better: 'high',
    needsPositive: true,
    noneYet: 'No wins yet.',
    value: s => s.won,
    show: s => String(s.won),
    fact: s => `${plural(s.won, 'win')}, ${plural(s.drawn, 'draw')} and ${plural(s.lost, 'loss', 'losses')}.`,
  },
  {
    key: 'titles',
    title: 'Most titles',
    about: 'Tournaments won: first place in a league, or a won knockout final.',
    unit: 'Titles',
    subject: 'player',
    better: 'high',
    needsPositive: true,
    noneYet: 'No tournament has a winner yet.',
    value: s => s.titles,
    show: s => String(s.titles),
    fact: s => `${s.name} has won ${plural(s.titles, 'tournament')}.`,
  },
  {
    key: 'goals-per-match',
    title: 'Goals per match',
    about: 'Goals scored in an average match.',
    unit: 'Goals a match',
    subject: 'player',
    minPlayed: MIN_MATCHES,
    better: 'high',
    value: s => s.goalsPerMatch,
    show: s => s.goalsPerMatch.toFixed(2),
    fact: s => `${s.name} scores ${s.goalsPerMatch.toFixed(2)} a match over ${plural(s.played, 'match', 'matches')}.`,
  },
  {
    key: 'best-defense',
    title: 'Best defense',
    about: 'Goals conceded in an average match. Fewest first.',
    unit: 'Conceded a match',
    subject: 'player',
    minPlayed: MIN_MATCHES,
    better: 'low',
    value: s => s.concededPerMatch,
    show: s => s.concededPerMatch.toFixed(2),
    fact: s => `${s.name} has let in ${plural(s.goalsAgainst, 'goal')} in ${plural(s.played, 'match', 'matches')}.`,
  },
  {
    key: 'clean-sheets',
    title: 'Most clean sheets',
    about: "Matches where the other side didn't score.",
    unit: 'Clean sheets',
    subject: 'player',
    better: 'high',
    needsPositive: true,
    noneYet: 'No clean sheets yet.',
    value: s => s.cleanSheets,
    show: s => String(s.cleanSheets),
    fact: s => `${s.name} has kept ${plural(s.cleanSheets, 'clean sheet')} in ${plural(s.played, 'match', 'matches')}.`,
  },
  {
    key: 'goal-difference',
    title: 'Best goal difference',
    about: 'Goals scored minus goals conceded.',
    unit: 'Goal difference',
    subject: 'player',
    better: 'high',
    bar: 'range',
    value: s => s.goalDiff,
    show: s => signed(s.goalDiff),
    fact: s => `${s.name} has ${s.goalsFor} for and ${s.goalsAgainst} against.`,
  },
  {
    key: 'biggest-win',
    title: 'Biggest win',
    about: "Each player's largest winning margin in a single match.",
    unit: 'Best win',
    subject: 'player',
    better: 'high',
    needsPositive: true,
    noneYet: 'No wins yet.',
    value: s => (s.bestWin ? margin(s.bestWin) : 0),
    show: s => (s.bestWin ? `${s.bestWin.mine}–${s.bestWin.theirs}` : '—'),
    fact: s =>
      s.bestWin
        ? `${s.name} beat ${s.bestWin.opponentPlayer} ${s.bestWin.mine}–${s.bestWin.theirs} with ${s.bestWin.teamName} against ${s.bestWin.opponent}.`
        : '',
    note: s => (s.bestWin ? `with ${s.bestWin.teamName}\nagainst ${s.bestWin.opponent} (${s.bestWin.opponentPlayer})` : null),
  },
  {
    key: 'win-streak',
    title: 'Longest win streak',
    about: 'Most wins in a row, across tournaments.',
    unit: 'In a row',
    subject: 'player',
    better: 'high',
    needsPositive: true,
    noneYet: 'No wins yet.',
    value: s => s.winStreak,
    show: s => String(s.winStreak),
    fact: s => `${s.name} won ${plural(s.winStreak, 'match', 'matches')} in a row.`,
  },
];

export const categoryByKey = (key: string | undefined) => CATEGORIES.find(c => c.key === key);

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export type Row = {
  s: Stats;
  /** Shared by equal values: 1, 1, 3. */
  rank: number;
  /** Bar length, 0–1. */
  share: number;
};

export type Ranking = {
  /** Ranked entries, best first. */
  ranked: Row[];
  /** Counting stats at 0: they qualify but have nothing to rank yet. */
  idle: Stats[];
  /** Fewer than the minimum matches. */
  pending: Stats[];
};

// Rounded so a rate like 2/3 and 4/6 compare as equal.
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function rankCategory(cat: Category, board: Board): Ranking {
  const pool = cat.subject === 'team' ? board.teams : board.players;
  const min = cat.minPlayed ?? 1;
  const byMostPlayed = (a: Stats, b: Stats) => b.played - a.played || a.name.localeCompare(b.name);

  const qualified = pool.filter(s => s.played >= min);
  const pending = pool.filter(s => s.played < min).sort(byMostPlayed);
  const v = (s: Stats) => round6(cat.value(s));
  const live = cat.needsPositive ? qualified.filter(s => v(s) > 0) : qualified;
  const idle = (cat.needsPositive ? qualified.filter(s => v(s) <= 0) : []).sort(byMostPlayed);

  const dir = cat.better === 'high' ? -1 : 1;
  live.sort(
    (a, b) => dir * (v(a) - v(b)) || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name),
  );

  const values = live.map(v);
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const share = (x: number): number => {
    if (cat.bar === 'range') return hi === lo ? 1 : 0.08 + 0.92 * ((x - lo) / (hi - lo));
    if (cat.better === 'low') return (lo + 0.25) / (x + 0.25);
    return hi > 0 ? Math.max(0, x / hi) : 0;
  };

  const ranked = live.map((s, i) => {
    const x = values[i] as number;
    const ahead = values.filter(o => (cat.better === 'high' ? o > x : o < x)).length;
    return { s, rank: ahead + 1, share: share(x) };
  });
  return { ranked, idle, pending };
}

const ORDINAL = ['th', 'st', 'nd', 'rd'];
export function ordinal(n: number) {
  const v = n % 100;
  return `${n}${ORDINAL[(v - 20) % 10] || ORDINAL[v] || ORDINAL[0]}`;
}
