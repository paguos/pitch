import type { Team } from './api';

/**
 * The competitions the draw can pick teams from. A competition only decides
 * which catalog teams are in the draw — nothing here is stored server-side.
 *
 * Logos live in /public/logos/leagues (football-logos.cc, personal use only —
 * see CLAUDE.md).
 */
export type Competition = {
  key: string;
  name: string;
  logo: string | null;
  /** Does this catalog team belong to the competition's draw pool? */
  includes: (t: Team) => boolean;
};

const inLeague = (league: string) => (t: Team) => t.kind === 'club' && t.league === league;

// The 20 clubs with the biggest European Cup / Champions League history that
// are in our catalog: winners first, then regular finalists and semi-finalists.
const CHAMPIONS_LEAGUE_CLUBS = new Set([
  'Real Madrid',
  'AC Milan',
  'Bayern Munich',
  'Liverpool',
  'FC Barcelona',
  'Inter Milan',
  'Manchester United',
  'Juventus',
  'Chelsea',
  'Borussia Dortmund',
  'Manchester City',
  'Paris Saint-Germain',
  'Olympique de Marseille',
  'Aston Villa',
  'Nottingham Forest',
  'Atletico Madrid',
  'Arsenal',
  'Tottenham Hotspur',
  'Bayer Leverkusen',
  'Napoli',
]);

export const COMPETITIONS: Competition[] = [
  { key: 'premier-league', name: 'Premier League', logo: '/logos/leagues/premier-league.png', includes: inLeague('Premier League') },
  { key: 'bundesliga', name: 'Bundesliga', logo: '/logos/leagues/bundesliga.png', includes: inLeague('Bundesliga') },
  {
    key: 'champions-league',
    name: 'Champions League',
    logo: '/logos/leagues/champions-league.png',
    includes: t => t.kind === 'club' && CHAMPIONS_LEAGUE_CLUBS.has(t.name),
  },
  { key: 'la-liga', name: 'La Liga', logo: '/logos/leagues/la-liga.png', includes: inLeague('La Liga') },
  { key: 'serie-a', name: 'Serie A', logo: '/logos/leagues/serie-a.png', includes: inLeague('Serie A') },
];
