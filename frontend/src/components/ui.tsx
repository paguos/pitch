import React, { useEffect } from 'react';

type DivProps = React.HTMLAttributes<HTMLDivElement>;

// AlertDialog — in-app confirmation modal. We deliberately avoid window.confirm
// / window.alert / window.prompt because (a) they block the event loop in a
// way the Chrome MCP tooling can't handle, and (b) they look like a 1998
// browser. Close on Esc; close on backdrop click.
export function AlertDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmDisabled = false,
  destructive = false,
  onConfirm,
  onCancel,
  testId,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div
      data-testid={testId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alertdialog-title"
        className="relative bg-ash border border-hairline max-w-md w-[90%] p-7 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="label-eyebrow text-coral">/ confirm</div>
        <h2 id="alertdialog-title" className="font-display text-4xl leading-none text-bone mt-2">
          {title}
        </h2>
        <div className="mt-4 text-bone/80 text-[14px] leading-relaxed">{body}</div>
        <div className="mt-7 flex items-center justify-end gap-3 border-t border-hairline pt-5">
          <button
            type="button"
            onClick={onCancel}
            data-testid="alertdialog-cancel"
            className="px-4 py-2 font-mono text-[13px] uppercase tracking-widest2 text-bone/75 hover:text-bone"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            data-testid="alertdialog-confirm"
            className={`inline-flex items-center justify-center px-4 py-2 font-mono text-[13px] uppercase tracking-widest2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              destructive
                ? 'border border-coral/60 bg-coral/10 text-coral hover:bg-coral/20'
                : 'bg-pitch text-ink hover:bg-pitch/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Button({
  children, variant = 'primary', className = '', ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const base =
    'inline-flex items-center justify-center px-4 py-2 font-mono text-[13px] uppercase tracking-widest2 transition-all disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-pitch text-ink hover:bg-pitch/90 active:translate-y-px',
    ghost:   'border border-hairline text-bone hover:bg-ash hover:border-pitch/50',
    danger:  'border border-coral/60 text-coral hover:bg-coral/10',
  } as const;
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Input({ className = '', ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full bg-transparent border-b border-hairline focus:border-pitch outline-none py-2 text-bone placeholder-bone/30 font-sans ${className}`}
      {...rest}
    />
  );
}

export function Select({ className = '', children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`bg-ash border border-hairline text-bone px-3 py-2 font-mono text-[13px] uppercase tracking-widest2 focus:border-pitch outline-none ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Card({ className = '', children, ...rest }: DivProps) {
  return (
    <div className={`bg-ash/60 border border-hairline ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, accent }: { children: React.ReactNode; accent?: 'pitch' | 'coral' }) {
  const color = accent === 'coral' ? 'text-coral' : accent === 'pitch' ? 'text-pitch' : 'text-bone/65';
  return <div className={`label-eyebrow ${color}`}>{children}</div>;
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'pitch' | 'coral' | 'live' }) {
  const tones = {
    neutral: 'border-hairline text-bone/85',
    pitch:   'border-pitch/60 text-pitch',
    coral:   'border-coral/60 text-coral',
    live:    'border-coral/60 text-coral',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border font-mono text-[11px] uppercase tracking-widest2 ${tones[tone]}`}>
      {tone === 'live' && <span className="w-1.5 h-1.5 bg-coral live-dot rounded-full inline-block" />}
      {children}
    </span>
  );
}

export function Divider({ label, className = '' }: { label?: string; className?: string }) {
  if (!label) return <div className={`h-px bg-hairline ${className}`} />;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex-1 h-px bg-hairline" />
      <span className="label-eyebrow">{label}</span>
      <div className="flex-1 h-px bg-hairline" />
    </div>
  );
}

export function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: 'pitch' | 'coral' }) {
  const color = accent === 'pitch' ? 'text-pitch' : accent === 'coral' ? 'text-coral' : 'text-bone';
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className={`font-display text-3xl leading-none mt-1 ${color}`}>{value}</div>
    </div>
  );
}
