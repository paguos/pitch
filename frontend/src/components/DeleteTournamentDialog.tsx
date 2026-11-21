import { useEffect, useState } from 'react';
import { api, Tournament } from '../lib/api';
import { AlertDialog, Stat } from './ui';

// What would be lost. Only the detail page has these numbers; the list falls
// back to a plain sentence.
export type TournamentTally = { players: number; matches: number; played: number };

// Confirmation for deleting a tournament that hasn't finished. Completed
// tournaments are history: callers don't offer this, and the server answers
// 409 if one slips through. On failure the dialog stays open with the server's
// message and the confirm button locks, so the only way out is Cancel.
export function DeleteTournamentDialog({
  tournament, tally, onClose, onDeleted, onRefused,
}: {
  tournament: Pick<Tournament, 'id' | 'name' | 'status'> | null;
  tally?: TournamentTally;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
  // Called when the server refuses with 409 (it completed in the meantime), so
  // the caller can refresh its stale view behind the dialog.
  onRefused?: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setErr(null); setBusy(false); }, [tournament?.id]);

  if (!tournament) return null;
  const t = tournament;
  const active = t.status === 'ACTIVE';

  async function confirm() {
    setErr(null);
    setBusy(true);
    try {
      await api.deleteTournament(t.id);
      onClose();
      await onDeleted();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
      if (e.status === 409) onRefused?.();
    }
  }

  return (
    <AlertDialog
      open
      testId="tournament-delete-dialog"
      title="Delete tournament?"
      destructive
      confirmLabel={busy ? '...' : 'Delete'}
      cancelLabel="Cancel"
      confirmDisabled={busy || !!err}
      body={
        err ? (
          <p className="text-coral">{err}</p>
        ) : (
          <>
            <p>
              <span className="text-bone font-medium">{t.name}</span>{' '}
              {active
                ? 'is in progress. Its fixtures, results and standings will be removed.'
                : "hasn't started. Its roster will be removed."}
            </p>
            {tally && (
              <div className="mt-5 grid grid-cols-3 gap-4 border-y border-hairline py-4" data-testid="tournament-delete-tally">
                <Stat label="players" value={String(tally.players).padStart(2, '0')} />
                <Stat label="matches" value={String(tally.matches).padStart(2, '0')} />
                <Stat label="results" value={String(tally.played).padStart(2, '0')} accent={tally.played > 0 ? 'coral' : undefined} />
              </div>
            )}
            <p className="mt-4 text-bone/60 text-[13px]">
              {active
                ? "This can't be undone. To keep it as history, end the tournament instead: completed tournaments can't be deleted."
                : "This can't be undone."}
            </p>
          </>
        )
      }
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
