import { useEffect, useState } from 'react';
import { api, Player } from '../lib/api';
import { AlertDialog, Button, Card, Eyebrow, Input } from '../components/ui';

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Player | null>(null);

  async function reload() {
    try {
      const ps = await api.listPlayers();
      setPlayers(ps);
    } catch (e: any) { setErr(e.message); }
  }

  useEffect(() => { reload(); }, []);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-y-4 mb-10">
        <div>
          <Eyebrow accent="pitch">/ roster</Eyebrow>
          <h1 className="font-display text-6xl leading-none text-bone mt-2">
            PLAYERS
          </h1>
          <p className="text-bone/70 mt-3 max-w-lg text-[14px]">
            The roster of humans who can join tournaments and punch in scores.
            Anyone here has full control — there is intentionally no login in
            this iteration.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="players-create-open">
          + new player
        </Button>
      </div>

      {err && <div className="text-coral font-mono text-xs mb-4">{err}</div>}

      {players && players.length === 0 && (
        <Card className="p-10 text-center">
          <Eyebrow>empty</Eyebrow>
          <p className="font-display text-3xl mt-3 text-bone/70">No players yet.</p>
          <p className="text-bone/70 mt-2 text-[14px]">Add the first one to start a tournament.</p>
        </Card>
      )}

      {players && players.length > 0 && (
        <Card>
          <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 border-b border-hairline label-eyebrow">
            <div className="col-span-1">#</div>
            <div className="col-span-3">Name</div>
            <div className="col-span-4">Email</div>
            <div className="col-span-2 text-right">Created</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          {players.map((p, i) => (
            <div
              key={p.id}
              data-testid={`player-row-${p.display_name}`}
              className="flex flex-col gap-1.5 px-5 py-4 border-b border-hairline last:border-0 sm:grid sm:grid-cols-12 sm:gap-4 sm:items-center"
            >
              <div className="hidden sm:block col-span-1 font-mono text-[13px] text-bone/55 number-display">
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="col-span-3">
                <div className="flex items-baseline gap-2 sm:block">
                  <span className="sm:hidden font-mono text-[12px] text-bone/40 number-display">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="font-display text-2xl text-bone leading-none">
                    {p.display_name}
                  </span>
                </div>
              </div>
              <div className="col-span-4 font-mono text-[13px] text-bone/80 truncate">
                {p.email || <span className="text-bone/40">—</span>}
              </div>
              <div className="hidden sm:block col-span-2 text-right font-mono text-[12px] text-bone/60 number-display">
                {new Date(p.created_at).toISOString().slice(0, 10)}
              </div>
              <div className="col-span-2 flex items-center sm:justify-end gap-3">
                <button
                  data-testid={`player-edit-${p.display_name}`}
                  onClick={() => setEditing(p)}
                  className="font-mono text-[12px] uppercase tracking-widest2 text-bone/70 hover:text-pitch"
                >
                  edit
                </button>
                <button
                  data-testid={`player-delete-${p.display_name}`}
                  onClick={() => setPendingDelete(p)}
                  className="font-mono text-[12px] uppercase tracking-widest2 text-coral/85 hover:text-coral"
                >
                  delete
                </button>
                <span className="sm:hidden font-mono text-[11px] text-bone/40 number-display ml-auto">
                  {new Date(p.created_at).toISOString().slice(0, 10)}
                </span>
              </div>
            </div>
          ))}
        </Card>
      )}

      {creating && (
        <PlayerFormModal
          title="New player"
          confirmLabel="Create"
          onSubmit={async (name, email) => {
            await api.createPlayer(name, email);
            setCreating(false);
            await reload();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {editing && (
        <PlayerFormModal
          title={`Edit ${editing.display_name}`}
          confirmLabel="Save"
          initial={{ display_name: editing.display_name, email: editing.email }}
          onSubmit={async (name, email) => {
            await api.updatePlayer(editing.id, { display_name: name, email });
            setEditing(null);
            await reload();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <DeletePlayerDialog
        player={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onDeleted={reload}
      />
    </div>
  );
}

function PlayerFormModal({
  title, confirmLabel, initial, onSubmit, onCancel,
}: {
  title: string;
  confirmLabel: string;
  initial?: { display_name: string; email: string | null };
  onSubmit: (display_name: string, email: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.display_name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSubmit = name.trim().length > 0 && !busy;

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      await onSubmit(name.trim(), email.trim() ? email.trim() : null);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open
      title={title}
      testId="player-form-dialog"
      body={
        <form
          className="space-y-5 mt-1"
          onSubmit={e => { e.preventDefault(); if (canSubmit) submit(); }}
        >
          <div>
            <label className="label-eyebrow block mb-2">display name</label>
            <Input
              autoFocus
              required
              data-testid="player-form-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Alice"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-2">email (optional)</label>
            <Input
              type="email"
              data-testid="player-form-email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="alice@example.com"
            />
          </div>
          {err && <div className="text-coral font-mono text-xs">{err}</div>}
        </form>
      }
      confirmLabel={busy ? '...' : confirmLabel}
      cancelLabel="Cancel"
      confirmDisabled={!canSubmit}
      onConfirm={submit}
      onCancel={onCancel}
    />
  );
}

function DeletePlayerDialog({
  player, onClose, onDeleted,
}: {
  player: Player | null;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setErr(null); setBusy(false); }, [player?.id]);

  if (!player) return null;

  async function confirm() {
    if (!player) return;
    setErr(null);
    setBusy(true);
    try {
      await api.deletePlayer(player.id);
      onClose();
      await onDeleted();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open
      testId="player-delete-dialog"
      title="Delete player?"
      destructive
      confirmLabel={busy ? '...' : 'Delete'}
      cancelLabel="Cancel"
      confirmDisabled={busy || !!err}
      body={
        err ? (
          <>
            <p className="text-coral">{err}</p>
            <p className="mt-3 text-bone/60 text-[13px]">
              You can still cancel and pick a different player.
            </p>
          </>
        ) : (
          <p>
            Are you sure you want to delete{' '}
            <span className="text-bone font-medium">{player.display_name}</span>?{' '}
            This cannot be undone.
          </p>
        )
      }
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
