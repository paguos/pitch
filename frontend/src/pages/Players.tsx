import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Player } from '../lib/api';
import { useAuth } from '../lib/auth';
import { AlertDialog, Badge, Button, Card, Eyebrow, Input } from '../components/ui';
import { RowMenu } from '../components/RowMenu';

export default function PlayersPage() {
  const { isAdmin } = useAuth();
  const [roleTarget, setRoleTarget] = useState<Player | null>(null);
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
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-4 mb-10">
        <div>
          <Eyebrow accent="pitch">/ roster</Eyebrow>
          <h1 className="font-display text-6xl leading-none text-bone mt-2">
            PLAYERS
          </h1>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreating(true)} data-testid="players-create-open">
            + new player
          </Button>
        )}
      </div>

      {err && <div className="text-coral font-mono text-xs mb-4">{err}</div>}

      {players && players.length === 0 && (
        <Card className="p-10 text-center">
          <Eyebrow>empty</Eyebrow>
          <p className="font-display text-3xl mt-3 text-bone/70">No players yet.</p>
          <p className="text-bone/70 mt-2 text-[14px]">
            {isAdmin ? 'Add the first one to start a tournament.' : 'An admin needs to add players first.'}
          </p>
        </Card>
      )}

      {players && players.length > 0 && (
        <Card>
          <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 border-b border-hairline label-eyebrow">
            <div className="col-span-1">#</div>
            <div className={isAdmin ? 'col-span-3' : 'col-span-8'}>Name</div>
            {isAdmin && <div className="col-span-3">Email</div>}
            {isAdmin && <div className="col-span-2">Access</div>}
            <div className={`${isAdmin ? 'col-span-2' : 'col-span-3'} text-right`}>Created</div>
            {isAdmin && <div className="col-span-1"><span className="sr-only">Actions</span></div>}
          </div>
          {players.map((p, i) => (
            <div
              key={p.id}
              data-testid={`player-row-${p.display_name}`}
              className={`relative flex flex-col gap-1.5 px-5 py-4 border-b border-hairline last:border-0 sm:grid sm:grid-cols-12 sm:gap-4 sm:items-center ${isAdmin ? 'pr-16 sm:pr-5' : ''}`}
            >
              <div className="hidden sm:block col-span-1 font-mono text-[13px] text-bone/55 number-display">
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className={isAdmin ? 'col-span-3' : 'col-span-8'}>
                <div className="flex items-baseline gap-2 sm:block">
                  <span className="sm:hidden font-mono text-[12px] text-bone/60 number-display">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Link
                    to={`/players/${p.id}`}
                    data-testid={`player-profile-${p.display_name}`}
                    className="font-display text-2xl text-bone leading-none hover:text-pitch outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch"
                  >
                    {p.display_name}
                  </Link>
                </div>
              </div>
              {isAdmin && (
                <div className="col-span-3 font-mono text-[13px] text-bone/80 truncate">
                  {p.email || <span className="text-bone/60">—</span>}
                </div>
              )}
              {isAdmin && (
                <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid={`player-access-${p.display_name}`}>
                  {!p.email ? (
                    <span className="text-[12px] text-bone/60">add an email to give access</span>
                  ) : (
                    <>
                      <Badge tone={p.role === 'admin' ? 'coral' : 'neutral'}>
                        {p.role === 'admin' ? 'admin' : 'viewer'}
                      </Badge>
                      <span className="text-[12px] text-bone/55">{p.signed_in ? 'signed in' : 'not signed in yet'}</span>
                    </>
                  )}
                </div>
              )}
              <div className={`${isAdmin ? 'sm:col-span-2' : 'sm:col-span-3'} sm:text-right font-mono text-[11px] sm:text-[12px] text-bone/60 number-display whitespace-nowrap`}>
                {new Date(p.created_at).toISOString().slice(0, 10)}
              </div>
              {isAdmin && (
                <div className="absolute right-3 top-3 sm:static sm:col-span-1 flex sm:justify-end">
                  <RowMenu
                    label={`Actions for ${p.display_name}`}
                    testId={`player-menu-${p.display_name}`}
                    items={[
                      { label: 'Edit', testId: `player-edit-${p.display_name}`, onSelect: () => setEditing(p) },
                      {
                        label: p.role === 'admin' ? 'Remove admin' : 'Make admin',
                        testId: `player-role-${p.display_name}`,
                        disabled: !p.email,
                        hint: !p.email ? 'Add an email first' : undefined,
                        onSelect: () => setRoleTarget(p),
                      },
                      { label: 'Delete', tone: 'danger', testId: `player-delete-${p.display_name}`, onSelect: () => setPendingDelete(p) },
                    ]}
                  />
                </div>
              )}
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

      <RoleDialog player={roleTarget} onClose={() => setRoleTarget(null)} onChanged={reload} />

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
            <label className="label-eyebrow block mb-2">Google email (optional)</label>
            <Input
              type="email"
              data-testid="player-form-email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="alice@example.com"
            />
            <p className="mt-2 text-[12px] text-bone/55 leading-snug">
              Lets this person sign in with Google and see their results.
              {initial?.email && ' Changing or clearing it signs them out and unlinks their Google account.'}
            </p>
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

function RoleDialog({
  player, onClose, onChanged,
}: {
  player: Player | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setErr(null); setBusy(false); }, [player?.id]);

  if (!player) return null;
  const granting = player.role !== 'admin';

  async function confirm() {
    if (!player) return;
    setErr(null);
    setBusy(true);
    try {
      await api.setPlayerRole(player.id, granting ? 'admin' : 'viewer');
      onClose();
      await onChanged();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open
      testId="player-role-dialog"
      title={granting ? `Make ${player.display_name} an admin?` : `Remove admin from ${player.display_name}?`}
      destructive={!granting}
      confirmLabel={busy ? '...' : granting ? 'Make admin' : 'Remove admin'}
      cancelLabel="Cancel"
      confirmDisabled={busy}
      body={
        <>
          {granting ? (
            <p>
              Admins can change everything: players, tournaments and scores. They can also give admin
              rights to others. {player.display_name} signs in with{' '}
              <span className="font-mono text-bone">{player.email}</span>.
            </p>
          ) : (
            <p>
              {player.display_name} goes back to view-only. This applies the next time they load a page.
            </p>
          )}
          {err && <p className="mt-3 text-coral">{err}</p>}
        </>
      }
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
