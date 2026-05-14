import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Eyebrow, Input } from '../components/ui';

export default function TournamentNew() {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<'league' | 'knockout'>('league');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      const t = await api.createTournament(name, format);
      nav(`/tournaments/${t.id}`);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="max-w-2xl">
      <Eyebrow accent="pitch">/ new fixture</Eyebrow>
      <h1 className="font-display text-6xl leading-none text-bone mt-2">DRAFT A TOURNAMENT</h1>
      <p className="text-bone/70 mt-3 max-w-lg text-[14px]">
        Name it, pick a format, then add players + teams on the detail page.
      </p>

      <form onSubmit={submit} className="mt-10 space-y-8">
        <div>
          <label className="label-eyebrow block mb-2">name</label>
          <Input
            required
            placeholder="Friday Night Cup"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="label-eyebrow block mb-3">format</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormat('league')}
              className={`p-5 text-left border ${format === 'league'
                ? 'border-pitch bg-pitch/5'
                : 'border-hairline hover:border-bone/30'}`}
            >
              <div className="font-display text-3xl text-bone leading-none">LEAGUE</div>
              <div className="label-eyebrow mt-2">round robin · everyone plays everyone</div>
            </button>

            <button
              type="button"
              onClick={() => setFormat('knockout')}
              className={`p-5 text-left border ${format === 'knockout'
                ? 'border-pitch bg-pitch/5'
                : 'border-hairline hover:border-bone/30'}`}
            >
              <div className="font-display text-3xl text-bone leading-none">KNOCKOUT</div>
              <div className="label-eyebrow mt-2">single elimination · win or go home</div>
            </button>
          </div>
        </div>

        {err && <div className="text-coral font-mono text-xs">{err}</div>}

        <div className="flex items-center gap-3 pt-4 border-t border-hairline">
          <Button type="submit" disabled={loading}>
            {loading ? 'drafting…' : 'create →'}
          </Button>
          <button
            type="button"
            onClick={() => nav('/')}
            className="font-mono text-[12px] uppercase tracking-widest2 text-bone/65 hover:text-bone"
          >
            cancel
          </button>
        </div>
      </form>
    </div>
  );
}
