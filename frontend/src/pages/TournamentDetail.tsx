import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, Match, Participant, Player, StandingsRow, Team, TournamentDetail } from '../lib/api';
import { AlertDialog, Badge, Button, Card, Eyebrow, Input, Stat } from '../components/ui';
import { StyledSelect, StyledOption } from '../components/StyledSelect';
import { TeamCrest } from '../components/TeamCrest';
import { CompetitionPicker } from '../components/CompetitionPicker';
import { COMPETITIONS, CUSTOM_KEY } from '../lib/competitions';

type Tab = 'participants' | 'fixtures' | 'standings' | 'bracket';

export default function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tab, setTab] = useState<Tab>('participants');
  const [err, setErr] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [drawing, setDrawing] = useState(false);
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
  const tabs: { key: Tab; label: string }[] = isKO
    ? [
        { key: 'participants', label: 'Participants' },
        { key: 'bracket',      label: 'Bracket' },
      ]
    : [
        { key: 'participants', label: 'Participants' },
        { key: 'fixtures',     label: 'Fixtures' },
        { key: 'standings',    label: 'Standings' },
      ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
        <div className="flex-1">
          <Eyebrow accent={t.status === 'ACTIVE' ? 'coral' : 'pitch'}>
            / {t.format}
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
            {isAdmin && (
              <button
                onClick={() => setCopying(true)}
                className="font-mono text-[12px] uppercase tracking-widest2 text-bone/65 hover:text-pitch transition-colors"
              >
                copy →
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 sm:gap-8 sm:pt-2">
          <Stat label="players" value={String(detail.participants.length).padStart(2, '0')} />
          <Stat label="matches" value={String(detail.matches.length).padStart(2, '0')} accent="pitch" />
          <Stat
            label="played"
            value={String(detail.matches.filter(m => m.status === 'REPORTED').length).padStart(2, '0')}
            accent="coral"
          />
        </div>
      </div>

      {/* League winner banner — shown for completed league tournaments. The
          KO bracket tab renders its own champion banner; for league we surface
          it at the top of the page since the standings tab is one of several. */}
      {t.status === 'COMPLETED' && !isKO && (
        <LeagueWinnerBanner rows={detail.standings || []} />
      )}

      {/* Actions — hidden once the tournament is completed */}
      {isAdmin && t.status !== 'COMPLETED' && (
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
              <div className="flex flex-wrap items-center justify-end gap-3">
                {availablePlayers.length >= 2 && availableTeams.length >= 2 && (
                  <Button
                    variant="ghost"
                    title="Randomly pair players with teams"
                    onClick={() => setDrawing(true)}
                  >
                    quick draw
                  </Button>
                )}
                <Button
                  disabled={detail.participants.length < 2}
                  onClick={async () => { await api.start(t.id); refresh(); }}
                >
                  start tournament →
                </Button>
              </div>
            </div>
          ) : (
            <ActiveActions detail={detail} onChanged={refresh} />
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="mt-10 flex gap-3 sm:gap-6 border-b border-hairline overflow-x-auto no-scrollbar">
        {tabs.map(({ key, label }) => {
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

      {drawing && (
        <QuickDrawModal
          availablePlayers={availablePlayers}
          availableTeams={availableTeams}
          tournamentId={t.id}
          onProgress={refresh}
          onDone={() => { setDrawing(false); refresh(); }}
          onCancel={() => setDrawing(false)}
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
  const { isAdmin } = useAuth();
  if (participants.length === 0) {
    return (
      <div className="text-bone/60 font-mono text-[13px]">
        {isAdmin ? 'No participants yet. Add the first one above.' : 'No participants yet.'}
      </div>
    );
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
          {isAdmin && isDraft && (
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
  const { isAdmin } = useAuth();
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
          ) : isAdmin ? (
            <button className="font-mono text-[12px] uppercase tracking-widest2 text-bone/65 hover:text-pitch" onClick={() => setEditing(true)}>
              {reported ? 'edit' : 'score'} →
            </button>
          ) : null}
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
              {m.home_goals}<span className="text-bone/60 px-1.5">·</span>{m.away_goals}
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
          ) : isAdmin ? (
            <button
              className="font-mono text-[12px] uppercase tracking-widest2 text-bone/65 hover:text-pitch"
              onClick={() => setEditing(true)}
            >
              {reported ? 'edit' : 'score'} →
            </button>
          ) : null}
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
        <span className="font-mono text-[12px] text-bone/60">—</span>
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
          className="grid grid-cols-12 gap-2 px-5 py-4 border-b border-hairline last:border-0 items-center min-h-[5rem]"
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
  const { isAdmin } = useAuth();
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
        {isAdmin && playable && !editing && (
          <button
            className="font-mono text-[12px] uppercase tracking-widest2 text-bone/65 hover:text-pitch"
            onClick={() => setEditing(true)}
          >
            {completed ? 'edit' : 'score'} →
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

function LeagueWinnerBanner({ rows }: { rows: StandingsRow[] }) {
  if (rows.length === 0) return null;
  const winner = rows[0];
  const runner = rows[1];
  return (
    <div className="mt-8 border border-pitch/40 bg-pitch/5 px-6 py-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-8" data-testid="league-winner-banner">
      <div className="flex-1 min-w-0">
        <Eyebrow accent="pitch">league champion</Eyebrow>
        <div className="mt-2 font-display text-3xl sm:text-5xl text-bone leading-none">
          {winner.Name.toUpperCase()}
        </div>
        <div className="mt-2 font-mono text-[12px] uppercase tracking-widest2 text-bone/75">
          {winner.Points} pts
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
            {isTBD ? <span className="text-bone/60">— TBD —</span> : name}
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
        <span className="font-mono text-[12px] text-bone/60">—</span>
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

// --- Quick draw: randomly pair a group of players with teams in one go ---

type DrawPair = { player: Player; team: Team };

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function CheckRow({
  checked, onToggle, children,
}: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 border transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-pitch ${
        checked ? 'border-pitch/60 bg-pitch/[0.04]' : 'border-hairline hover:border-pitch/50'
      }`}
    >
      <span
        aria-hidden
        className={`w-4 h-4 border flex items-center justify-center shrink-0 ${checked ? 'border-pitch bg-pitch' : 'border-bone/40'}`}
      >
        {checked && <span className="text-ink text-[10px] font-bold leading-none">✓</span>}
      </span>
      {children}
    </button>
  );
}

function QuickDrawModal({
  availablePlayers,
  availableTeams,
  tournamentId,
  onProgress,
  onDone,
  onCancel,
}: {
  availablePlayers: Player[];
  availableTeams: Team[];
  tournamentId: string;
  /** Called when some (not all) participants were saved, so the page can refresh. */
  onProgress: () => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  // 1 players, 2 competition, 3 teams, 4 preview.
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(availablePlayers.map(p => p.id)),
  );
  // The pool is whichever teams are ticked. Picking a competition just ticks
  // its teams; the team step lets you add or remove from there.
  const [competitionKey, setCompetitionKey] = useState<string | null>(null);
  const [teamIds, setTeamIds] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false); // list the whole catalog, not just the competition
  const [query, setQuery] = useState('');
  const [pairs, setPairs] = useState<DrawPair[]>([]);
  const [drawNo, setDrawNo] = useState(0); // bumps on every shuffle to replay the reveal
  const [savedCount, setSavedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Never close mid-save: the loop below would keep running against a
  // dialog nobody can see.
  const close = () => { if (!busy) onCancel(); };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Move focus into the dialog on open and on each step; hand it back on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, []);
  useEffect(() => { dialogRef.current?.focus(); }, [step]);

  // Free teams per competition. Custom counts the whole catalog.
  const competitionOptions = useMemo(
    () => COMPETITIONS.map(c => ({
      ...c,
      count: c.key === CUSTOM_KEY ? availableTeams.length : availableTeams.filter(c.includes).length,
    })),
    [availableTeams],
  );
  const competition = competitionOptions.find(c => c.key === competitionKey) ?? null;

  function pickCompetition(key: string) {
    // Coming back to the same competition keeps the edits made on the team step.
    if (key !== competitionKey) {
      const picked = competitionOptions.find(c => c.key === key);
      setCompetitionKey(key);
      setTeamIds(new Set(availableTeams.filter(t => picked?.includes(t)).map(t => t.id)));
      setShowAll(key === CUSTOM_KEY);
      setQuery('');
    }
    setStep(3);
  }

  // Players still waiting for a team. After a partial save the page refreshes
  // and the saved ones drop out of availablePlayers, so this stays truthful.
  const selectedPlayers = useMemo(
    () => availablePlayers.filter(p => selectedIds.has(p.id)),
    [availablePlayers, selectedIds],
  );
  const need = selectedPlayers.length;
  const allSelected = availablePlayers.length > 0 && need === availablePlayers.length;

  // Ticked teams that are still free (a partial save can take some away).
  const poolTeams = useMemo(
    () => availableTeams.filter(t => teamIds.has(t.id)),
    [availableTeams, teamIds],
  );
  const poolReady = poolTeams.length >= need;
  const shortBy = Math.max(0, need - poolTeams.length);

  // A search always looks through the whole catalog: that's how you add a team
  // from outside the competition.
  const scoped = !!competition && competition.key !== CUSTOM_KEY && !showAll && !query.trim();
  const visibleTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = scoped && competition ? availableTeams.filter(competition.includes) : availableTeams;
    return base
      .filter(t => !q || [t.name, t.league, t.country].some(s => s?.toLowerCase().includes(q)))
      .sort((a, b) =>
        scoped
          ? a.name.localeCompare(b.name)
          // Whole catalog: nationals first, then clubs by league.
          : Number(b.kind === 'national') - Number(a.kind === 'national') ||
            (a.kind === 'club' ? a.league : '').localeCompare(b.kind === 'club' ? b.league : '') ||
            a.name.localeCompare(b.name));
  }, [availableTeams, query, scoped, competition]);
  const allShownTicked = visibleTeams.length > 0 && visibleTeams.every(t => teamIds.has(t.id));

  function toggleShown() {
    const next = new Set(teamIds);
    for (const t of visibleTeams) { if (allShownTicked) next.delete(t.id); else next.add(t.id); }
    setTeamIds(next);
  }

  function draw() {
    if (!poolReady) return;
    const teams = shuffled(poolTeams);
    setPairs(selectedPlayers.map((player, i) => ({ player, team: teams[i]! })));
    setDrawNo(n => n + 1);
  }

  function goToPreview() {
    draw();
    setStep(4);
  }

  async function confirm() {
    setErr(null);
    setBusy(true);
    const remaining = [...pairs];
    try {
      while (remaining.length > 0) {
        const { player, team } = remaining[0]!;
        try {
          await api.addParticipant(tournamentId, player.id, team.id);
        } catch (e: any) {
          throw new Error(`Couldn't add ${player.display_name} as ${team.name}: ${e.message}`);
        }
        remaining.shift();
        setSavedCount(c => c + 1);
      }
      onDone();
    } catch (e: any) {
      // Some pairs may already be saved. Keep only the unsaved ones on screen
      // so a retry doesn't re-add anyone, and let the page catch up.
      if (remaining.length < pairs.length) onProgress();
      setPairs(remaining);
      setErr(e.message);
      setBusy(false);
    }
  }

  const titleId = 'quick-draw-title';
  const partlySaved = savedCount > 0;
  const heading =
    step === 1 ? 'Select players'
    : step === 2 ? 'Pick a competition'
    : step === 3 ? 'Choose teams'
    : 'Preview draw';
  const subhead =
    step === 1 ? 'Everyone not yet in this tournament. Pick at least 2.'
    : step === 2 ? 'Its teams go in the draw. You can add or remove teams next.'
    : step === 3 ? 'Each player gets a random team from your selection.'
    : 'Nothing is saved until you add them.';

  return (
    <div
      data-testid="quick-draw-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm"
      // A stray click on the backdrop shouldn't throw away a draw in progress.
      onClick={step === 1 ? close : undefined}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative bg-ash border border-hairline max-w-lg w-[90%] h-[min(42rem,92vh)] p-7 shadow-xl flex flex-col outline-none"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="label-eyebrow text-coral">/ quick draw</div>
          <div role="img" aria-label={`Step ${step} of 4`} className="flex gap-1.5">
            {[1, 2, 3, 4].map(n => (
              <span key={n} className={`h-[2px] w-6 transition-colors ${n <= step ? 'bg-pitch' : 'bg-hairline'}`} />
            ))}
          </div>
        </div>
        <h2 id={titleId} className="font-display text-4xl leading-none text-bone mt-3">{heading}</h2>
        <p className="mt-2 text-[13px] text-bone/60">{subhead}</p>

        {step === 1 && (
          <>
            <div role="group" aria-label="Players" className="mt-5 flex-1 overflow-y-auto space-y-2 min-h-0 thin-scroll">
              <CheckRow
                checked={allSelected}
                onToggle={() => setSelectedIds(allSelected ? new Set() : new Set(availablePlayers.map(p => p.id)))}
              >
                <span className="font-mono text-[12px] uppercase tracking-widest2 text-bone/70">Select all</span>
              </CheckRow>
              {availablePlayers.map(p => (
                <CheckRow
                  key={p.id}
                  checked={selectedIds.has(p.id)}
                  onToggle={() => {
                    const next = new Set(selectedIds);
                    if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                    setSelectedIds(next);
                  }}
                >
                  <span className="font-display text-xl text-bone leading-none">{p.display_name}</span>
                </CheckRow>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-hairline pt-5">
              <span className="font-mono text-[12px] text-bone/60 number-display">
                {need} of {availablePlayers.length} selected
              </span>
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={close}>Cancel</Button>
                <Button disabled={need < 2} onClick={() => setStep(2)}>Next →</Button>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {/* Padding leaves room for the selection outline, which the scroller would clip. */}
            <div className="mt-4 flex-1 overflow-y-auto min-h-0 thin-scroll p-1">
              <CompetitionPicker
                options={competitionOptions}
                selectedKey={competitionKey}
                need={need}
                onPick={pickCompetition}
              />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-hairline pt-5 shrink-0">
              <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
              <Button disabled={!competition} onClick={() => setStep(3)}>Next →</Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            {competition && (
              <div className="mt-4 flex items-center gap-3 shrink-0">
                {competition.logo && (
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center bg-chalk p-1">
                    <img src={competition.logo} alt="" draggable={false} className="h-full w-full object-contain" />
                  </span>
                )}
                <span className="font-display text-2xl leading-none text-bone">{competition.name}</span>
                {competition.key !== CUSTOM_KEY && (
                  <button
                    type="button"
                    onClick={() => setShowAll(v => !v)}
                    className="ml-auto font-mono text-[12px] text-bone/60 underline underline-offset-4 decoration-bone/30 hover:text-pitch focus-visible:outline focus-visible:outline-1 focus-visible:outline-pitch"
                  >
                    {showAll ? `Only ${competition.name}` : 'Add other teams'}
                  </button>
                )}
              </div>
            )}
            <Input
              aria-label="Search teams"
              placeholder="Search all teams by name, league or country"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="mt-3 shrink-0 text-[14px]"
            />
            <div role="group" aria-label="Teams" className="mt-3 flex-1 overflow-y-auto space-y-1.5 min-h-0 thin-scroll">
              {availableTeams.length === 0 && (
                <p className="font-mono text-[13px] text-coral">No free teams left to draw from.</p>
              )}
              {availableTeams.length > 0 && visibleTeams.length === 0 && (
                <p className="font-mono text-[13px] text-bone/60">No teams match “{query.trim()}”.</p>
              )}
              {visibleTeams.length > 0 && (
                <CheckRow checked={allShownTicked} onToggle={toggleShown}>
                  <span className="font-mono text-[12px] uppercase tracking-widest2 text-bone/70">
                    {query.trim() ? `Select shown (${visibleTeams.length})` : `Select all (${visibleTeams.length})`}
                  </span>
                </CheckRow>
              )}
              {visibleTeams.map(t => (
                <CheckRow
                  key={t.id}
                  checked={teamIds.has(t.id)}
                  onToggle={() => {
                    const next = new Set(teamIds);
                    if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                    setTeamIds(next);
                  }}
                >
                  <TeamCrest name={t.name} logoUrl={t.logo_url} size="sm" />
                  <span className="text-[14px] text-bone flex-1 truncate">{t.name}</span>
                  {t.kind === 'club' && (
                    <span className="font-mono text-[11px] text-bone/60 shrink-0 truncate max-w-[40%]">{t.league}</span>
                  )}
                </CheckRow>
              ))}
            </div>
            <div className="mt-4 shrink-0" aria-live="polite">
              <p className={`font-mono text-[12px] ${poolReady ? 'text-bone/60' : 'text-coral'}`}>
                {availableTeams.length < need
                  ? `Only ${plural(availableTeams.length, 'team')} left for ${plural(need, 'player')}. Go back and deselect players.`
                  : poolReady
                    ? `${plural(poolTeams.length, 'team')} in the draw for ${plural(need, 'player')}.`
                    : `${poolTeams.length} selected. Pick ${plural(shortBy, 'more team')}.`}
              </p>
              <div className="mt-2 h-[2px] bg-hairline" role="presentation">
                <div
                  className={`h-full transition-[width] duration-200 ${poolReady ? 'bg-pitch' : 'bg-coral'}`}
                  style={{ width: `${need > 0 ? Math.min(100, (poolTeams.length / need) * 100) : 0}%` }}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-hairline pt-5 shrink-0">
              <Button variant="ghost" onClick={() => setStep(2)}>← Back</Button>
              <Button disabled={!poolReady} onClick={goToPreview}>Preview draw →</Button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="mt-5 flex-1 overflow-y-auto min-h-0 space-y-2 thin-scroll">
              {pairs.map(({ player, team }, i) => (
                <div
                  key={`${drawNo}-${player.id}`}
                  className="draw-reveal flex items-center gap-3 px-3 py-2.5 border border-hairline"
                  style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                >
                  <span className="font-display text-xl text-bone leading-none w-[36%] truncate">{player.display_name}</span>
                  <span aria-hidden className="text-bone/30 font-mono text-[12px]">→</span>
                  <TeamCrest name={team.name} logoUrl={team.logo_url} size="sm" />
                  <span className="text-[14px] text-bone flex-1 truncate">{team.name}</span>
                </div>
              ))}
            </div>
            {err && (
              <div role="alert" className="mt-3 text-coral font-mono text-xs">
                {err}
                {partlySaved && ` ${plural(savedCount, 'participant')} already added.`}
              </div>
            )}
            <div className="mt-5 flex items-center justify-between border-t border-hairline pt-5">
              <Button variant="ghost" disabled={busy || partlySaved} onClick={() => setStep(3)}>← Back</Button>
              <div className="flex items-center gap-3">
                <Button variant="ghost" disabled={busy || !poolReady} onClick={draw}>Shuffle ↺</Button>
                <Button disabled={busy || pairs.length === 0} data-testid="quick-draw-confirm" onClick={confirm}>
                  {busy ? 'Adding…' : `Add ${plural(pairs.length, 'participant')}`}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
