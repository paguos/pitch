const BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8080';

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { const b = await res.json(); msg = b.error || msg; } catch {}
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type Player = {
  id: string;
  email: string | null;
  display_name: string;
  created_at: string;
};
export type Team = { id: string; name: string; league: string; country: string; kind: string; logo_url: string | null };
export type Tournament = {
  id: string; name: string; format: string; status: 'DRAFT' | 'ACTIVE' | 'COMPLETED';
  created_by: string | null; created_at: string; started_at: string | null;
  completed_at: string | null; version: number;
};
export type Participant = {
  id: string; tournament_id: string; player_id: string; player_name: string;
  team_id: string; team_name: string; team_logo_url: string | null; seed: number;
};
export type MatchStatus = 'SCHEDULED' | 'REPORTED' | 'PENDING' | 'PLAYABLE' | 'COMPLETED';
export type Match = {
  id: string; tournament_id: string; round: number; ord: number;
  home_participant_id: string | null; away_participant_id: string | null;
  home_goals: number | null; away_goals: number | null;
  status: MatchStatus; version: number; played_at: string | null;
  next_match_id: string | null; next_match_slot: 'HOME' | 'AWAY' | null;
};
export type StandingsRow = {
  ParticipantID: string; Name: string;
  Played: number; Won: number; Drawn: number; Lost: number;
  GoalsFor: number; GoalsAgainst: number; GoalDiff: number; Points: number;
};
export type TournamentDetail = {
  tournament: Tournament;
  participants: Participant[];
  matches: Match[];
  standings: StandingsRow[];
};

export const api = {
  listPlayers: () => req<Player[]>('/players'),
  createPlayer: (display_name: string, email: string | null) =>
    req<Player>('/players', { method: 'POST', body: JSON.stringify({ display_name, email }) }),
  updatePlayer: (id: string, patch: { display_name?: string; email?: string | null }) =>
    req<Player>(`/players/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deletePlayer: (id: string) => req<void>(`/players/${id}`, { method: 'DELETE' }),

  listTeams: (league?: string) => req<Team[]>(`/teams${league ? `?league=${encodeURIComponent(league)}` : ''}`),
  listTournaments: () => req<Tournament[]>('/tournaments'),
  createTournament: (name: string, format: string) => req<Tournament>(
    '/tournaments', { method: 'POST', body: JSON.stringify({ name, format }) }
  ),
  getTournament: async (id: string) => {
    const d = await req<TournamentDetail>(`/tournaments/${id}`);
    d.participants = d.participants ?? [];
    d.matches = d.matches ?? [];
    d.standings = d.standings ?? [];
    return d;
  },
  addParticipant: (id: string, player_id: string, team_id: string) => req<Participant>(
    `/tournaments/${id}/participants`,
    { method: 'POST', body: JSON.stringify({ player_id, team_id }) },
  ),
  removeParticipant: (id: string, player_id: string) => req<{ ok: boolean }>(
    `/tournaments/${id}/participants/${player_id}`, { method: 'DELETE' },
  ),
  changeTeam: (id: string, player_id: string, team_id: string) => req<{ ok: boolean }>(
    `/tournaments/${id}/participants/${player_id}`,
    { method: 'PATCH', body: JSON.stringify({ team_id }) },
  ),
  copyTournament: (id: string, name: string) => req<Tournament>(
    `/tournaments/${id}/copy`,
    { method: 'POST', body: JSON.stringify({ name }) },
  ),
  start: (id: string) => req<{ ok: boolean }>(`/tournaments/${id}/start`, { method: 'POST' }),
  endTournament: (id: string) => req<Tournament>(`/tournaments/${id}/end`, { method: 'POST' }),
  submitScore: (matchId: string, home_goals: number, away_goals: number, version: number) =>
    req<Match>(`/matches/${matchId}/score`, {
      method: 'PUT',
      body: JSON.stringify({ home_goals, away_goals, version }),
    }),
};
