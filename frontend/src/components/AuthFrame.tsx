import { ReactNode } from 'react';

// Full-screen frame for the setup and sign-in screens. The memorable part is
// the pitch drawn in hairline strokes behind the form: halfway line, centre
// circle and both penalty areas, with the form sitting on the centre spot.
function PitchMarkings() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1000 640"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full text-pitch"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      opacity="0.22"
    >
      <rect x="40" y="40" width="920" height="560" />
      <line x1="500" y1="40" x2="500" y2="600" />
      <circle cx="500" cy="320" r="92" />
      <circle cx="500" cy="320" r="3" fill="currentColor" />
      <rect x="40" y="170" width="150" height="300" />
      <rect x="40" y="250" width="55" height="140" />
      <rect x="810" y="170" width="150" height="300" />
      <rect x="905" y="250" width="55" height="140" />
      <path d="M190 280 A 62 62 0 0 1 190 360" />
      <path d="M810 280 A 62 62 0 0 0 810 360" />
    </svg>
  );
}

export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative min-h-full flex items-center justify-center px-6 py-16 overflow-hidden">
      <PitchMarkings />
      <main className="relative w-full max-w-sm">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-7xl leading-none text-bone">PITCH</span>
          <span className="font-mono text-[11px] uppercase tracking-widest2 text-pitch">console</span>
        </div>
        <div className="mt-8 bg-ash/90 border border-hairline p-7 backdrop-blur-sm">
          <h1 className="font-display text-4xl leading-none text-bone">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
