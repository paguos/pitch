import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, Match, Participant, Player, StandingsRow, Team, TournamentDetail } from '../lib/api';
import { AlertDialog, Badge, Button, Card, Eyebrow, Input, Stat } from '../components/ui';
import { StyledSelect, StyledOption } from '../components/StyledSelect';
import { TeamCrest } from '../components/TeamCrest';

type Tab = 'participants' | 'fixtures' | 'standings' | 'bracket';

export default function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tab, setTab] = useState<Tab>('participants');
  const [err, setErr] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  async function refresh() {
    if (!id) return;
    try {
      const d = await api.getTournament(id);
      setDetail(d);
    } catch (e: any) { setErr(e.message); }
  }

  useEffect(() => {
    refresh();
    api.listTeams().then(setTeams).catch(() => {});
    api.listPlayers().then(setPlayers).catch(() => {});
  }, [id]);

  // Once the tournament becomes ACTIVE, default-show fixtures or bracket.
  useEffect(() => {
    if (detail && detail.tournament.status !== 'DRAFT' && tab === 'participants') {
      setTab(detail.tournament.format === 'knockout' ? 'bracket' : 'fixtures');
    }
  }, [detail?.tournament.status, detail?.tournament.format]);

  // Scroll active tab into view whenever it changes (handles overflow on mobile).
  useEffect(() => {
    tabRefs.current[tab]?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [tab]);

  if (err) return <div className="text-coral font-mono">{err}</div>;
  if (!detail) return <div className="font-mono text-[12px] uppercase tracking-widest2 text-bone/60">loading…</div>;

  const t = detail.tournament;
  const takenPlayerIds = new Set(detail.participants.map(p => p.player_id));
  const takenTeamIds = new Set(detail.participants.map(p => p.team_id));
  const availablePlayers = players.filter(p => !takenPlayerIds.has(p.id));
  const availableTeams = teams.filter(team => !takenTeamIds.has(team.id));

  const isKO = t.format === 'knockout';
  const tabs: { key: Tab; label: string; count?: number }[] = isKO
    ? [
        { key: 'participants', label: 'Participants', count: detail.participants.length },
        { key: 'bracket',      label: 'Bracket',      count: detail.matches.length },
      ]
    : [
        { key: 'participants', label: 'Participants', count: detail.participants.length },
        { key: 'fixtures',     label: 'Fixtures',     count: detail.matches.length },
        { key: 'standings',    label: 'Standings',    count: detail.standings?.length || 0 },
      ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
        <div className="flex-1">
          <Eyebrow accent={t.status === 'ACTIVE' ? 'coral' : 'pitch'}>
            / {t.format} · {t.status}
          </Eyebrow>
          <h1 className="font-display text-7xl leading-[0.85] text-bone mt-3">
            {t.name.toUpperCase()}
          </h1>
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <Badge tone={t.status === 'ACTIVE' ? 'live' : t.status === 'COMPLETED' ? 'pitch' : 'neutral'}>
              {t.status}
            </Badge>
            <span className="font-mono text-[12px] text-bone/60 number-display">
              created {new Date(t.created_at).toISOString().slice(0,10)}
            </span>
            <button
              onClick={() => setCopying(true)}
              className="font-mono text-[12px] uppercase tracking-widest2 text-bone/65 hover:text-pitch transition-colors"
            >
              copy →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 sm:gap-8 sm:pt-2">
          <Stat label="players" value={String(detail.participants.length).padStart(2, '0')} />
          <Stat label="matches" value={String(detail.matches.length).padStart(2, '0')} accent="pitch" />
          <Stat
            label="reported"
            value={String(detail.matches.filter(m => m.status === 'REPORTED').length).padStart(2, '0')}
            accent="coral"
          />
        </div>
      </div>

      {/* League winner banner — shown for completed league tournaments. The
          KO bracket tab renders its own champion banner; for league we surface
          it at the top of the page since the standings tab is one of several. */}
      {t.status === 'COMPLETED' && !isKO && (
        <LeagueWinnerBanner
          rows={detail.standings || []}
          completedAt={t.completed_at}
        />
      )}

      {/* Actions */}
      <div className="mt-10 border-y border-hairline py-5">
        {t.status === 'DRAFT' ? (
          <div className="flex flex-wrap items-start gap-6">
            <AddParticipantForm
              tournamentId={t.id}
              availablePlayers={availablePlayers}
              availableTeams={availableTeams}
              onAdded={refresh}
            />
            <div className="flex-1" />
            <Button
              disabled={detail.participants.length < 2}
              onClick={async () => { await api.start(t.id); refresh(); }}
            >
              start tournament →
            </Button>
          </div>
        ) : t.status === 'ACTIVE' ? (
          <ActiveActions detail={detail} onChanged={refresh} />
        ) : (
          <div className="font-mono text-[13px] uppercase tracking-widest2 text-bone/70 whitespace-nowrap">
            tournament completed{t.completed_at ? ` · ${new Date(t.completed_at).toISOString().slice(0,10)}` : ''}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-10 flex gap-3 sm:gap-6 border-b border-hairline overflow-x-auto">
        {tabs.map(({ key, label, count }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              ref={el => { tabRefs.current[key] = el; }}
              onClick={() => setTab(key)}
              className={`relative pb-4 shrink-0 whitespace-nowrap font-mono text-[13px] uppercase tracking-widest2 ${
                active ? 'text-bone' : 'text-bone/60 hover:text-bone/85'
              }`}
            >
              <span>{label}</span>
              {count !== undefined && (
                <span className={`ml-2 ${active ? 'text-pitch' : 'text-bone/50'}`}>
                  {String(count).padStart(2, '0')}
                </span>
              )}
              {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-pitch" />}
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        {tab === 'participants' && (
          <ParticipantsTab
            participants={detail.participants}
            tournamentId={t.id}
            isDraft={t.status === 'DRAFT'}
            onRemoved={refresh}
          />
        )}
        {tab === 'fixtures' && (
          <FixturesTab
            detail={detail}
            onReport={refresh}
          />
        )}
        {tab === 'standings' && (
          <StandingsTab detail={detail} />
        )}
        {tab === 'bracket' && (
          <BracketTab detail={detail} onReport={refresh} />
        )}
      </div>

      {copying && (
        <CopyTournamentModal
          sourceName={t.name}
          onSubmit={async (name) => {
            const copy = await api.copyTournament(t.id, name);
            setCopying(false);
            navigate(`/tournaments/${copy.id}`);
          }}
          onCancel={() => setCopying(false)}
        />
      )}
    </div>
  );
}

// --- Add-participant form: the new join flow ---

function AddParticipantForm({
  tournamentId, availablePlayers, availableTeams, onAdded,
}: {
  tournamentId: string;
  availablePlayers: Player[];
  availableTeams: Team[];
  onAdded: () => void;
}) {
  const [playerId, setPlayerId] = useState('');
  // category = 'club' | 'national'. Drives the COUNTRY/TEAM cascade below.
  // For clubs we keep the 3-step CATEGORY → COUNTRY → TEAM cascade (country
  // meaningfully narrows ~96 clubs down to ~20). For nationals we collapse
  // to CATEGORY → TEAM since each country has exactly 1 national team, so a
  // country picker would just be a redundant click to narrow 50 → 1.
  const [category, setCategory] = useState<'club' | 'national'>('club');
  const [country, setCountry] = useState('');
  const [teamId, setTeamId] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // For clubs we need both country + team; for nationals just team.
  const canSubmit = !!playerId && !!teamId && (category === 'national' || !!country) && !busy;

  // Teams in the currently-picked category.
  const teamsInCategory = useMemo(
    () => availableTeams.filter(t => t.kind === category),
    [availableTeams, category],
  );

  // Total available counts per category, for the CATEGORY picker hint.
  const categoryCounts = useMemo(() => {
    let club = 0, national = 0;
    for (const t of availableTeams) {
      if (t.kind === 'club') club++;
      else if (t.kind === 'national') national++;
    }
    return { club, national };
  }, [availableTeams]);

  // Countries available within the current category. Sorted by team count
  // desc so the big leagues surface first (clubs); for nationals every
  // country has exactly 1, so it falls back to alphabetical.
  const countries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of teamsInCategory) {
      counts.set(t.country, (counts.get(t.country) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [teamsInCategory]);

  // Team options:
  //   - club: filter by chosen country, sorted alphabetically.
  //   - national: skip country, list all 50+ nations alphabetically.
  const teamsForPicker = useMemo(
    () => (category === 'national'
      ? [...teamsInCategory].sort((a, b) => a.name.localeCompare(b.name))
      : teamsInCategory
          .filter(t => t.country === country)
          .sort((a, b) => a.name.localeCompare(b.name))
    ),
    [teamsInCategory, country, category],
  );

  // If the previously-picked player/team just got added (and so was removed
  // from the available list), clear the local selection so the form is ready
  // for the next pick.
  useEffect(() => {
    if (playerId && !availablePlayers.find(p => p.id === playerId)) setPlayerId('');
  }, [availablePlayers, playerId]);
  useEffect(() => {
    if (teamId && !availableTeams.find(t => t.id === teamId)) setTeamId('');
  }, [availableTeams, teamId]);
  // If the country no longer has any available teams (e.g. the last one was
  // just taken), clear the country selection too.
  useEffect(() => {
    if (country && !countries.find(c => c.name === country)) setCountry('');
  }, [countries, country]);
  // If the picked team no longer matches the current category+country scope,
  // clear it. Covers: category switched, country switched, last team taken.
  useEffect(() => {
    if (teamId && !teamsForPicker.find(t => t.id === teamId)) setTeamId('');
  }, [teamsForPicker, teamId]);
  // Switching CATEGORY resets the dependent COUNTRY (only meaningful for
  // clubs). The team-id effect above handles clearing teamId.
  useEffect(() => {
    setCountry('');
  }, [category]);

  if (availablePlayers.length === 0) {
    return (
      <div className="font-mono text-[13px] uppercase tracking-widest2 text-coral/90">
        all players are already in this tournament · add more on /players
      </div>
    );
  }

  const playerOptions: StyledOption[] = availablePlayers.map(p => ({
    value: p.id, label: p.display_name,
  }));
  const categoryOptions: StyledOption[] = [
    { value: 'club',     label: 'CLUB',     hint: String(categoryCounts.club).padStart(3, '0') },
    { value: 'national', label: 'NATIONAL', hint: String(categoryCounts.national).padStart(3, '0') },
  ];
  const countryOptions: StyledOption[] = countries.map(c => ({
    value: c.name,
    label: c.name,
    hint: String(c.count).padStart(2, '0'),
  }));
  const teamOptions: StyledOption[] = teamsForPicker.map(t => ({
    value: t.id, label: t.name, iconUrl: t.logo_url ?? null,
  }));

  return (
    <form
      data-testid="add-participant-form"
      className="flex flex-wrap items-end gap-x-5 gap-y-3"
      onSubmit={async e => {
        e.preventDefault();
        if (!canSubmit) return;
        setErr(null); setBusy(true);
        try {
          await api.addParticipant(tournamentId, playerId, teamId);
          // reset for the next entry — let the parent refresh propagate the
          // updated available* lists, then the effects above clear selection.
          onAdded();
        } catch (e: any) {
          setErr(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <span className="label-eyebrow">player</span>
        <StyledSelect
          testId="add-participant-player"
          ariaLabel="player"
          value={playerId}
          onChange={setPlayerId}
          options={playerOptions}
          placeholder="— pick player —"
          accent="pitch"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="label-eyebrow">category</span>
        <StyledSelect
          testId="add-participant-category"
          ariaLabel="category"
          value={category}
          onChange={v => setCategory(v as 'club' | 'national')}
          options={categoryOptions}
          accent="coral"
          width="min-w-[12rem]"
        />
      </div>

      {/* Country picker — only meaningful for clubs (~96 across 5 leagues).
          For nationals each country has exactly 1 team, so we collapse the
          cascade and let the TEAM picker list all nations directly. */}
      {category === 'club' && (
        <div className="flex flex-col gap-1.5">
          <span className="label-eyebrow">country</span>
          <StyledSelect
            testId="add-participant-country"
            ariaLabel="country"
            value={country}
            onChange={setCountry}
            options={countryOptions}
            placeholder="— pick country —"
            accent="coral"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="label-eyebrow">team</span>
        <StyledSelect
          testId="add-participant-team"
          ariaLabel="team"
          value={teamId}
          onChange={setTeamId}
          options={teamOptions}
          placeholder={
            category === 'national'
              ? '— pick nation —'
              : country ? '— pick team —' : '— pick country first —'
          }
          disabled={category === 'club' && !country}
          accent="pitch"
          width="min-w-[18rem]"
        />
      </div>

      <Button
        type="submit"
        disabled={!canSubmit}
        data-testid="add-participant-submit"
      >
        {busy ? 'adding…' : 'add to tournament →'}
      </Button>

      {err && <span className="text-coral font-mono text-xs basis-full">{err}</span>}
    </form>
  );
}

function ParticipantsTab({
  participants, tournamentId, isDraft, onRemoved,
}: {
  participants: Participant[];
  tournamentId: string;
  isDraft: boolean;
  onRemoved: () => void;
}) {
  if (participants.length === 0) {
    return <div className="text-bone/60 font-mono text-[13px]">No participants yet. Add the first one above.</div>;
  }
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {participants.map((p, i) => (
        <Card key={p.id} className="p-5 flex items-center gap-5">
          <div className="font-display text-5xl text-pitch leading-none number-display">
            {String(i + 1).padStart(2, '0')}
          </div>
          <TeamCrest name={p.team_name} logoUrl={p.team_logo_url} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="font-display text-2xl text-bone leading-none truncate">{p.team_name}</div>
            <div className="label-eyebrow mt-1">manager · {p.player_name}</div>
          </div>
          {isDraft && (
            <button
              type="button"
              className="font-mono text-[12px] uppercase tracking-widest2 text-coral/85 hover:text-coral"
              onClick={async () => {
                try { await api.removeParticipant(tournamentId, p.player_id); onRemoved(); }
                catch {}
              }}
            >
              remove →
            </button>
          )}
        </Card>
      ))}
    </div>
  );
}

function FixturesTab({ detail, onReport }: { detail: TournamentDetail; onReport: () => void }) {
  const byRound = useMemo(() => {
    const m: Record<number, Match[]> = {};
    for (const x of detail.matches) (m[x.round] ||= []).push(x);
    return m;
  }, [detail.matches]);
  if (detail.matches.length === 0) {
    return <div className="text-bone/60 font-mono text-[13px]">No fixtures generated yet.</div>;
  }
  const partInfo = (pid: string | null): { team: string; player: string | null; logo: string | null } => {
    if (!pid) return { team: '—', player: null, logo: null };
    const p = detail.participants.find(x => x.id === pid);
    return p
      ? { team: p.team_name, player: p.player_name, logo: p.team_logo_url }
      : { team: '—', player: null, logo: null };
  };
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
  return (
    <div className="space-y-10">
      {rounds.map(r => (
        <div key={r}>
          <div className="flex items-center gap-3 mb-4">
            <Eyebrow accent="pitch">round {String(r).padStart(2, '0')}</Eyebrow>
            <div className="flex-1 h-px bg-hairline" />
          </div>
          <div className="space-y-2">
            {byRound[r].map(m => {
              const hi = partInfo(m.home_participant_id);
              const ai = partInfo(m.away_participant_id);
              return (
              <FixtureRow
                key={m.id}
                m={m}
                home={hi.team}
                homeLogo={hi.logo}
                homePlayer={hi.player}
                away={ai.team}
                awayLogo={ai.logo}
                awayPlayer={ai.player}
                onReport={onReport}
              />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function FixtureRow({ m, home, homeLogo, homePlayer, away, awayLogo, awayPlayer, onReport }: { m: Match; home: string; homeLogo: string | null; homePlayer: string | null; away: string; awayLogo: string | null; awayPlayer: string | null; onReport: () => void }) {
  const [editing, setEditing] = useState(false);
  const [h, setH] = useState(m.home_goals ?? 0);
  const [a, setA] = useState(m.away_goals ?? 0);
  const [err, setErr] = useState<string | null>(null);
  const reported = m.status === 'REPORTED';

  async function submit() {
    setErr(null);
    try {
      await api.submitScore(m.id, h, a, m.version);
      setEditing(false);
      onReport();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="bg-ash/40 border border-hairline">
      {/* Mobile layout */}
      <div className="sm:hidden px-4 py-3 space-y-1">
        <FixtureSide name={home} logo={homeLogo} player={homePlayer}
          goals={editing ? h : m.home_goals} editing={editing} onChange={setH} />
        <FixtureSide name={away} logo={awayLogo} player={awayPlayer}
          goals={editing ? a : m.away_goals} editing={editing} onChange={setA} />
        <div className="pt-2 flex items-center justify-end gap-3">
          {editing ? (
            <>
              <button className="font-mono text-[12px] uppercase tracking-widest2 text-pitch hover:text-pitch/80" onClick={submit}>save</button>
              <button className="font-mono text-[12px] uppercase tracking-widest2 text-bone/65 hover:text-bone" onClick={() => setEditing(false)}>cancel</button>
            </>
          ) : (
            <button className="font-mono text-[12px] uppercase tracking-widest2 text-bone/65 hover:text-pitch" onClick={() => setEditing(true)}>
              {reported ? 'edit' : 'report'} →
            </button>
          )}
        </div>
        {err && <div className="text-coral font-mono text-xs">{err}</div>}
      </div>

      {/* Desktop layout */}
      <div className="hidden sm:grid grid-cols-12 gap-4 items-center px-5 py-4">
        <div className="col-span-5 min-w-0 flex items-center justify-end gap-3">
          <div className="min-w-0 text-right">
            <div className="font-display text-2xl text-bone leading-none truncate">{home}</div>
            {homePlayer && (
              <div className="mt-1.5 font-mono text-[11px] lowercase tracking-widest2 text-bone/60 truncate">
                {homePlayer.toLowerCase()}
              </div>
            )}
          </div>
          <TeamCrest name={home} logoUrl={homeLogo} size="sm" />
        </div>

        <div className="col-span-2 flex items-center justify-center gap-2">
          {editing ? (
            <>
              <ScoreInput value={h} onChange={setH} />
              <span className="font-display text-bone/55 text-xl">:</span>
              <ScoreInput value={a} onChange={setA} />
            </>
          ) : reported ? (
            <div className="font-display text-3xl text-pitch number-display tracking-wider">
              {m.home_goals}<span className="text-bone/45 px-1.5">·</span>{m.away_goals}
            </div>
          ) : (
            <div className="font-mono text-[12px] uppercase tracking-widest2 text-bone/55">vs</div>
          )}
        </div>

        <div className="col-span-3 min-w-0 flex items-center gap-3">
          <TeamCrest name={away} logoUrl={awayLogo} size="sm" />
          <div className="min-w-0">
            <div className="font-display text-2xl text-bone leading-none truncate">{away}</div>
            {awayPlayer && (
              <div className="mt-1.5 font-mono text-[11px] lowercase tracking-widest2 text-bone/60 truncate">
                {awayPlayer.toLowerCase()}
              </div>
            )}
          </div>
        </div>

        <div className="col-span-2 flex items-center justify-end gap-2">
          {editing ? (
            <>
              <button className="font-mono text-[12px] uppercase tracking-widest2 text-pitch hover:text-pitch/80" onClick={submit}>save</button>
              <button className="font-mono text-[12px] uppercase tracking-widest2 text-bone/65 hover:text-bone" onClick={() => setEditing(false)}>cancel</button>
            </>
          ) : (
            <button
              className="font-mono text-[12px] uppercase tracking-widest2 text-bone/65 hover:text-pitch"
              onClick={() => setEditing(true)}
            >
              {reported ? 'edit' : 'report'} →
            </button>
          )}
        </div>

        {err && <div className="col-span-12 text-coral font-mono text-xs">{err}</div>}
      </div>
    </div>
  );
}

function FixtureSide({ name, logo, player, goals, editing, onChange }: {
  name: string; logo: string | null; player: string | null;
  goals: number | null; editing: boolean; onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0 flex items-center gap-2.5 flex-1">
        <TeamCrest name={name} logoUrl={logo} size="sm" />
        <div className="min-w-0">
          <div className="font-display text-lg text-bone leading-none truncate">{name}</div>
          {player && (
            <div className="mt-1 font-mono text-[11px] lowercase tracking-widest2 text-bone/60 truncate">
              {player.toLowerCase()}
            </div>
          )}
        </div>
      </div>
      {editing ? (
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={goals ?? 0}
          onChange={e => onChange(Math.max(0, parseInt(e.target.value || '0', 10)))}
          onFocus={e => e.target.select()}
          className="w-12 bg-ink border border-hairline focus:border-pitch outline-none text-center font-display text-lg text-bone py-0.5"
        />
      ) : goals != null ? (
        <span className="font-display text-2xl text-pitch number-display">{goals}</span>
      ) : (
        <span className="font-mono text-[12px] text-bone/40">—</span>
      )}
    </div>
  );
}

function ScoreInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      value={value}
      onChange={e => onChange(Math.max(0, parseInt(e.target.value || '0', 10)))}
      onFocus={e => e.target.select()}
      className="w-14 bg-ink border border-hairline focus:border-pitch outline-none text-center font-display text-2xl text-bone py-1"
    />
  );
}

function StandingsTab({ detail }: { detail: TournamentDetail }) {
  const rows = detail.standings || [];
  if (rows.length === 0) {
    return <div className="text-bone/60 font-mono text-[13px]">No standings — start the tournament first.</div>;
  }
  return (
    <Card>
      <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-hairline label-eyebrow">
        <div className="col-span-1">#</div>
        <div className="col-span-5 sm:col-span-3">Team</div>
        <div className="col-span-2 sm:col-span-1 text-right">P</div>
        <div className="hidden sm:block col-span-1 text-right">W</div>
        <div className="hidden sm:block col-span-1 text-right">D</div>
        <div className="hidden sm:block col-span-1 text-right">L</div>
        <div className="hidden sm:block col-span-1 text-right">GF</div>
        <div className="hidden sm:block col-span-1 text-right">GA</div>
        <div className="col-span-2 sm:col-span-1 text-right text-bone/60">GD</div>
        <div className="col-span-2 sm:col-span-1 text-right text-pitch">PTS</div>
      </div>
      {rows.map((r, i) => {
        const participant = detail.participants.find(p => p.id === r.ParticipantID);
        const player = participant?.player_name || null;
        const logo = participant?.team_logo_url || null;
        const gdColor = r.GoalDiff > 0 ? 'text-pitch' : r.GoalDiff < 0 ? 'text-coral/80' : 'text-bone/60';
        return (
        <div
          key={r.ParticipantID}
          className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-hairline last:border-0 items-start"
        >
          <div className="col-span-1 font-display text-2xl text-bone/75 number-display leading-none">
            {String(i + 1).padStart(2, '0')}
          </div>
          <div className="col-span-5 sm:col-span-3 min-w-0 flex items-center gap-3">
            <TeamCrest name={r.Name} logoUrl={logo} size="sm" />
            <div className="min-w-0">
              <div className="font-display text-xl text-bone leading-tight">{r.Name}</div>
              {player && (
                <div className="mt-1.5 font-mono text-[11px] lowercase tracking-widest2 text-bone/60 truncate">
                  {player.toLowerCase()}
                </div>
              )}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1 text-right number-display text-bone/95 text-[15px]">{r.Played}</div>
          <div className="hidden sm:block col-span-1 text-right number-display text-bone/95 text-[15px]">{r.Won}</div>
          <div className="hidden sm:block col-span-1 text-right number-display text-bone/95 text-[15px]">{r.Drawn}</div>
          <div className="hidden sm:block col-span-1 text-right number-display text-bone/95 text-[15px]">{r.Lost}</div>
          <div className="hidden sm:block col-span-1 text-right number-display text-bone/95 text-[15px]">{r.GoalsFor}</div>
          <div className="hidden sm:block col-span-1 text-right number-display text-bone/95 text-[15px]">{r.GoalsAgainst}</div>
          <div className={`col-span-2 sm:col-span-1 text-right number-display text-[15px] ${gdColor}`}>
            {r.GoalDiff > 0 ? `+${r.GoalDiff}` : r.GoalDiff}
          </div>
          <div className="col-span-2 sm:col-span-1 text-right font-display text-2xl text-pitch leading-none number-display">{r.Points}</div>
        </div>
        );
      })}
    </Card>
  );
}

// --- Knockout bracket ---

function BracketTab({ detail, onReport }: { detail: TournamentDetail; onReport: () => void }) {
  const byRound = useMemo(() => {
    const m: Record<number, Match[]> = {};
    for (const x of detail.matches) (m[x.round] ||= []).push(x);
    return m;
  }, [detail.matches]);
  if (detail.matches.length === 0) {
    return <div className="text-bone/60 font-mono text-[13px]">No bracket yet — start the tournament first.</div>;
  }
  const partName = (pid: string | null) =>
    (pid && detail.participants.find(p => p.id === pid)?.team_name) || 'TBD';
  const partPlayer = (pid: string | null): string | null =>
    (pid && detail.participants.find(p => p.id === pid)?.player_name) || null;
  const partLogo = (pid: string | null): string | null =>
    (pid && detail.participants.find(p => p.id === pid)?.team_logo_url) || null;
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
  const roundLabel = (r: number) => {
    const total = rounds.length;
    if (r === total) return 'final';
    if (r === total - 1) return 'semi';
    if (r === total - 2) return 'quarter';
    return `r${String(r).padStart(2, '0')}`;
  };

  // Identify champion (winner of the final, if reported).
  const finalMatch = byRound[rounds[rounds.length - 1]]?.[0];
  let championName: string | null = null;
  if (finalMatch && finalMatch.status === 'COMPLETED'
      && finalMatch.home_goals != null && finalMatch.away_goals != null) {
    const winnerPid = finalMatch.home_goals > finalMatch.away_goals
      ? finalMatch.home_participant_id
      : finalMatch.away_participant_id;
    championName = partName(winnerPid);
  }

  return (
    <div className="space-y-6">
      {championName && (
        <div className="border border-pitch/40 bg-pitch/5 px-6 py-4 flex items-center gap-4">
          <Eyebrow accent="pitch">champion</Eyebrow>
          <div className="font-display text-3xl text-bone leading-none">{championName.toUpperCase()}</div>
        </div>
      )}
      <div className="flex gap-6 overflow-x-auto pb-4">
        {rounds.map(r => (
          <div key={r} className="min-w-[240px] flex-1">
            <div className="mb-4">
              <Eyebrow accent="pitch">{roundLabel(r)}</Eyebrow>
              <div className="mt-1 font-mono text-[11px] uppercase tracking-widest2 text-bone/55">
                round {String(r).padStart(2, '0')} · {byRound[r].length} match{byRound[r].length === 1 ? '' : 'es'}
              </div>
            </div>
            <div className="space-y-3">
              {byRound[r].map(m => (
                <BracketCard
                  key={m.id}
                  m={m}
                  home={partName(m.home_participant_id)}
                  homeLogo={partLogo(m.home_participant_id)}
                  homePlayer={partPlayer(m.home_participant_id)}
                  away={partName(m.away_participant_id)}
                  awayLogo={partLogo(m.away_participant_id)}
                  awayPlayer={partPlayer(m.away_participant_id)}
                  onReport={onReport}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketCard({
  m, home, homeLogo, homePlayer, away, awayLogo, awayPlayer, onReport,
}: { m: Match; home: string; homeLogo: string | null; homePlayer: string | null; away: string; awayLogo: string | null; awayPlayer: string | null; onReport: () => void }) {
  const [editing, setEditing] = useState(false);
  const [h, setH] = useState(m.home_goals ?? 0);
  const [a, setA] = useState(m.away_goals ?? 0);
  const [err, setErr] = useState<string | null>(null);
  const playable = m.status === 'PLAYABLE' || m.status === 'COMPLETED';
  const completed = m.status === 'COMPLETED';
  const winnerHome = completed && m.home_goals != null && m.away_goals != null && m.home_goals > m.away_goals;
  const winnerAway = completed && m.home_goals != null && m.away_goals != null && m.away_goals > m.home_goals;

  async function submit() {
    setErr(null);
    try {
      await api.submitScore(m.id, h, a, m.version);
      setEditing(false);
      onReport();
    } catch (e: any) { setErr(e.message); }
  }

  const statusTone =
    m.status === 'COMPLETED' ? 'pitch'
    : m.status === 'PLAYABLE' ? 'live'
    : 'neutral';

  return (
    <div className={`border ${completed ? 'border-pitch/30' : 'border-hairline'} bg-ash/40`}>
      <div className="px-4 py-2 border-b border-hairline flex items-center justify-between">
        <Badge tone={statusTone as any}>{m.status}</Badge>
        {playable && !editing && (
          <button
            className="font-mono text-[12px] uppercase tracking-widest2 text-bone/65 hover:text-pitch"
            onClick={() => setEditing(true)}
          >
            {completed ? 'edit' : 'report'} →
          </button>
        )}
      </div>
      <div className="px-4 py-3 space-y-1">
        <BracketSide name={home} logo={homeLogo} player={homePlayer} goals={editing ? h : m.home_goals} winner={winnerHome}
                     editing={editing} onChange={setH} />
        <BracketSide name={away} logo={awayLogo} player={awayPlayer} goals={editing ? a : m.away_goals} winner={winnerAway}
                     editing={editing} onChange={setA} />
      </div>
      {editing && (
        <div className="px-4 py-2 border-t border-hairline flex items-center justify-end gap-3">
          <button className="font-mono text-[12px] uppercase tracking-widest2 text-pitch hover:text-pitch/80"
                  onClick={submit}>save</button>
          <button className="font-mono text-[12px] uppercase tracking-widest2 text-bone/65 hover:text-bone"
                  onClick={() => { setEditing(false); setErr(null); }}>cancel</button>
        </div>
      )}
      {err && <div className="px-4 py-2 border-t border-hairline text-coral font-mono text-[11px] leading-tight">{err}</div>}
    </div>
  );
}

// ActiveActions — shown while the tournament is ACTIVE. Renders the
// "End tournament" button plus a status hint about how many fixtures still
// have no score. If any are unscored we surface an in-app AlertDialog before
// flipping state, so an organiser doesn't accidentally freeze a half-played
// league. (We never use window.confirm — the in-app modal is required.)
function ActiveActions({
  detail, onChanged,
}: {
  detail: TournamentDetail;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const total = detail.matches.length;
  // A "scored" match is one that has a final result. Leagues use REPORTED;
  // knockout matches end in COMPLETED. Both count.
  const scored = detail.matches.filter(m => m.status === 'REPORTED' || m.status === 'COMPLETED').length;
  const remaining = total - scored;
  const allScored = total > 0 && remaining === 0;

  async function end() {
    setErr(null); setBusy(true);
    try {
      await api.endTournament(detail.tournament.id);
      setOpen(false);
      onChanged();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex-1 min-w-0">
        {total > 0 && (
          <div className="font-mono text-[12px] uppercase tracking-widest2 text-bone/60">
            {allScored ? (
              <span className="text-pitch">all matches scored · ready to end</span>
            ) : (
              <>complete <span className="text-coral">{String(remaining).padStart(2,'0')}</span> more match{remaining === 1 ? '' : 'es'} or end anyway</>
            )}
          </div>
        )}
        {err && <div className="mt-1.5 text-coral font-mono text-xs">{err}</div>}
      </div>
      <Button
        data-testid="end-tournament"
        variant={allScored ? 'primary' : 'ghost'}
        onClick={() => {
          if (allScored) {
            // No unscored matches — fire immediately, no modal noise.
            end();
          } else {
            setOpen(true);
          }
        }}
      >
        end tournament →
      </Button>
      <AlertDialog
        open={open}
        testId="end-tournament-dialog"
        title="End tournament?"
        body={
          <>
            <span className="text-coral font-mono uppercase tracking-widest2 text-[12px]">
              {remaining} match{remaining === 1 ? '' : 'es'} still unscored
            </span>
            <div className="mt-3">
              Ending now freezes the tournament. The current standings will be
              final — unplayed matches stay unreported and won&apos;t contribute
              any points or goal difference.
            </div>
          </>
        }
        confirmLabel={busy ? 'ending…' : 'end tournament'}
        cancelLabel="Cancel"
        confirmDisabled={busy}
        destructive
        onConfirm={end}
        onCancel={() => { if (!busy) { setOpen(false); setErr(null); } }}
      />
    </div>
  );
}

function LeagueWinnerBanner({
  rows, completedAt,
}: { rows: StandingsRow[]; completedAt: string | null }) {
  if (rows.length === 0) return null;
  // Standings are returned pre-sorted by the backend tiebreakers
  // (Pts → GD → GF → Name); top row is the winner.
  const winner = rows[0];
  const runner = rows[1];
  return (
    <div className="mt-8 border border-pitch/40 bg-pitch/5 px-6 py-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-8" data-testid="league-winner-banner">
      <div className="flex-1 min-w-0">
        <Eyebrow accent="pitch">league champion</Eyebrow>
        <div className="mt-2 font-display text-3xl sm:text-5xl text-bone leading-none truncate">
          {winner.Name.toUpperCase()}
        </div>
        <div className="mt-2 font-mono text-[12px] uppercase tracking-widest2 text-bone/75">
          {winner.Points} pts · {winner.Won}-{winner.Drawn}-{winner.Lost} · GD {winner.GoalDiff >= 0 ? '+' : ''}{winner.GoalDiff}
          {completedAt ? ` · ended ${new Date(completedAt).toISOString().slice(0,10)}` : ''}
        </div>
      </div>
      {runner && (
        <div className="sm:text-right">
          <div className="label-eyebrow">runner-up</div>
          <div className="mt-1 font-display text-xl text-bone/80 leading-none">{runner.Name}</div>
          <div className="mt-1 font-mono text-[12px] uppercase tracking-widest2 text-bone/65">
            {runner.Points} pts
          </div>
        </div>
      )}
    </div>
  );
}

function BracketSide({
  name, logo, player, goals, winner, editing, onChange,
}: { name: string; logo: string | null; player: string | null; goals: number | null; winner: boolean; editing: boolean; onChange: (n: number) => void }) {
  const isTBD = name === 'TBD';
  return (
    <div className={`flex items-center justify-between gap-3 py-1 ${winner ? 'text-bone' : 'text-bone/70'}`}>
      <div className="min-w-0 flex-1 flex items-center gap-2.5">
        {!isTBD && <TeamCrest name={name} logoUrl={logo} size="sm" />}
        {isTBD && <span className="inline-block h-6 w-6 rounded-full border border-dashed border-hairline shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className={`font-display text-lg leading-none truncate ${winner ? '' : ''}`}>
            {isTBD ? <span className="text-bone/50">— TBD —</span> : name}
          </div>
          {!isTBD && player && (
            <div className="mt-1 font-mono text-[11px] lowercase tracking-widest2 text-bone/60 truncate">
              {player.toLowerCase()}
            </div>
          )}
        </div>
      </div>
      {editing ? (
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={goals ?? 0}
          onChange={e => onChange(Math.max(0, parseInt(e.target.value || '0', 10)))}
          onFocus={e => e.target.select()}
          className="w-12 bg-ink border border-hairline focus:border-pitch outline-none text-center font-display text-lg text-bone py-0.5"
        />
      ) : goals != null ? (
        <span className={`font-display text-xl number-display ${winner ? 'text-pitch' : 'text-bone/65'}`}>{goals}</span>
      ) : (
        <span className="font-mono text-[12px] text-bone/40">—</span>
      )}
    </div>
  );
}

function CopyTournamentModal({
  sourceName, onSubmit, onCancel,
}: {
  sourceName: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(`${sourceName} (copy)`);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSubmit = name.trim().length > 0 && !busy;

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      await onSubmit(name.trim());
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open
      title="Copy tournament"
      testId="copy-tournament-dialog"
      body={
        <form
          className="space-y-4 mt-1"
          onSubmit={e => { e.preventDefault(); if (canSubmit) submit(); }}
        >
          <div>
            <label className="label-eyebrow block mb-2">new name</label>
            <Input
              autoFocus
              required
              data-testid="copy-tournament-name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <p className="font-mono text-[12px] text-bone/55">
            Same participants and teams · new draw on start
          </p>
          {err && <div className="text-coral font-mono text-xs">{err}</div>}
        </form>
      }
      confirmLabel={busy ? '…' : 'Copy'}
      cancelLabel="Cancel"
      confirmDisabled={!canSubmit}
      onConfirm={submit}
      onCancel={onCancel}
    />
  );
}
