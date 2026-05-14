import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Player, Tournament } from '../lib/api';
import { Badge, Button, Card, Eyebrow } from '../components/ui';

const statusTone = (s: Tournament['status']) =>
  s === 'ACTIVE' ? 'live' : s === 'COMPLETED' ? 'pitch' : 'neutral';

export default function TournamentList() {
  const [list, setList] = useState<Tournament[] | null>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.listTournaments().then(setList).catch(e => setErr(e.message));
    api.listPlayers().then(setPlayers).catch(() => setPlayers([]));
  }, []);

  if (players && players.length === 0) {
    return (
      <div>
        <Eyebrow accent="coral">/ first run</Eyebrow>
        <h1 className="font-display text-6xl leading-none text-bone mt-2">
          NO PLAYERS YET
        </h1>
        <p className="text-bone/70 mt-3 max-w-lg text-[14px]">
          Tournaments need a roster of players to draw from. Head to the
          Players tab and add at least two before drafting a tournament.
        </p>
        <div className="mt-6">
          <Link to="/players"><Button>+ go to players</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-10">
        <div>
          <Eyebrow accent="pitch">/ ledger</Eyebrow>
          <h1 className="font-display text-6xl leading-none text-bone mt-2">
            TOURNAMENT LEDGER
          </h1>
          <p className="text-bone/70 mt-3 max-w-lg text-[14px]">
            Every contest, in chronological order. Open a row to seat yourself,
            kick things off, or punch in scores.
          </p>
        </div>
        <Link to="/tournaments/new">
          <Button>+ new tournament</Button>
        </Link>
      </div>

      {err && <div className="text-coral font-mono text-xs">{err}</div>}

      {list && list.length === 0 && (
        <Card className="p-10 text-center">
          <Eyebrow>empty</Eyebrow>
          <p className="font-display text-3xl mt-3 text-bone/70">No tournaments yet.</p>
          <p className="text-bone/70 mt-2 text-[14px]">Start one — even two players is a league.</p>
        </Card>
      )}

      {list && list.length > 0 && (
        <Card>
          <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-hairline label-eyebrow">
            <div className="col-span-1">#</div>
            <div className="col-span-5">Name</div>
            <div className="col-span-2">Format</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Created</div>
          </div>
          {list.map((t, i) => (
            <Link
              key={t.id}
              to={`/tournaments/${t.id}`}
              className="grid grid-cols-12 gap-4 px-5 py-4 border-b border-hairline last:border-0 hover:bg-ink/40 group"
            >
              <div className="col-span-1 font-mono text-[13px] text-bone/55 number-display">
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="col-span-5">
                <div className="font-display text-2xl leading-none text-bone group-hover:text-pitch transition-colors">
                  {t.name}
                </div>
              </div>
              <div className="col-span-2 font-mono text-[12px] uppercase tracking-widest2 text-bone/80">
                {t.format}
              </div>
              <div className="col-span-2">
                <Badge tone={statusTone(t.status) as any}>{t.status}</Badge>
              </div>
              <div className="col-span-2 text-right font-mono text-[12px] text-bone/60 number-display">
                {new Date(t.created_at).toISOString().slice(0, 10)}
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
