// The API is served under /api on the app's own origin (nginx in production,
// the Vite proxy in dev), so the session cookie is plain same-origin.
export const API_BASE: string = (import.meta as any).env?.VITE_API_BASE || '/api';
const BASE = API_BASE;

// Called when a signed-in session turns out to have expired (401 on a data
// request), so the app can drop back to the sign-in screen.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) { onUnauthorized = fn; }

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    credentials: 'same-origin',
    ...init,
  });
  if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.();
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

export type Role = 'admin' | 'viewer';
export type Player = {
  id: string;
  // email, role and signed_in are only filled in for admins (and for your own player).
  email: string | null;
  display_name: string;
  created_at: string;
  role: Role | null;
  signed_in: boolean;
};
export type SessionUser = {
  id: string;
  username: string | null;
  role: Role;
  player_id: string | null;
  player_name: string | null;
};
export type AuthStatus = {
  setup_required: boolean;
  google_enabled: boolean;
  user: SessionUser | null;
};
export type MyMatch = {
  id: string; round: number; status: MatchStatus;
  home_name: string; away_name: string;
  home_goals: number | null; away_goals: number | null;
  is_home: boolean; played_at: string | null;
};
export type MyResult = {
  tournament: Tournament;
  participant: Participant;
  standing: StandingsRow | null;
  position: number | null;
  matches: MyMatch[];
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
  authStatus: () => req<AuthStatus>('/auth/status'),
  setup: (password: string) =>
    req<SessionUser>('/auth/setup', { method: 'POST', body: JSON.stringify({ password }) }),
  login: (username: string, password: string) =>
    req<SessionUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => req<void>('/auth/logout', { method: 'POST' }),
  myResults: () => req<MyResult[]>('/me/results'),
  setPlayerRole: (id: string, role: Role) =>
    req<Player>(`/players/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),

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
