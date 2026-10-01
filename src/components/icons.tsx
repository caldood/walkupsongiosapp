import type { ReactNode } from 'react';

/** Small stroke-icon set (24×24). Crisp at any size and identical on every platform, unlike emoji. */
const PATHS: Record<string, ReactNode> = {
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6" y="5" width="4.2" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.8" y="5" width="4.2" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
  next: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  'chev-l': <path d="M15 18l-6-6 6-6" />,
  'chev-r': <path d="M9 18l6-6-6-6" />,
  'chev-d': <path d="M6 9l6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  grip: (
    <>
      {[8, 16].flatMap((x) => [6, 12, 18].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" stroke="none" />))}
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17 14c2.5 0 4 2 4 5" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5.5" y="4.5" width="13" height="16" rx="2.5" />
      <path d="M9 4.5h6v3H9zM9 12h6M9 16h4" />
    </>
  ),
  jersey: <path d="M8.5 4L3 7l2 4 3-1v10h8V10l3 1 2-4-5.5-3c-.6 1.3-1.9 2-3.5 2S9.100 5.300 8.500 4z" />,
  music: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.500" cy="18" r="2.500" />
      <circle cx="16.500" cy="16" r="2.500" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
      <circle cx="16" cy="7" r="2.200" />
      <circle cx="8" cy="17" r="2.200" />
    </>
  ),
  box: <path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.500 11a6.500 6.500 0 0013 0M12 17.500V21" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2.500" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2.500" />
      <path d="M8 11V8a4 4 0 017.600-1.700" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9.500v5h3.500L12.500 19V5L7.500 9.500z" />
      <path d="M16 9.200a4 4 0 010 5.600M18.600 6.600a8 8 0 010 10.800" />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M6.200 5.200c3 3.200 3 10.400 0 13.600M17.800 5.200c-3 3.200-3 10.400 0 13.600" />
    </>
  ),
  diamond: <path d="M12 3l9 9-9 9-9-9zM12 8l4 4-4 4-4-4z" />,
  eq: (
    <>
      <rect x="5" y="10" width="3.200" height="9" rx="1" fill="currentColor" stroke="none" />
      <rect x="10.400" y="5" width="3.200" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="15.800" y="8" width="3.200" height="11" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  external: <path d="M8 16L17 7M9 7h8v8" />,
  bench: <path d="M3 14h18M5 14v5M19 14v5M6.500 10h11" />,
  copy: (
    <>
      <rect x="8.500" y="8.500" width="11" height="11" rx="2.500" />
      <path d="M15.500 8.500v-2a2 2 0 00-2-2h-7a2 2 0 00-2 2v7a2 2 0 002 2h2" />
    </>
  ),
  trash: <path d="M5 7h14M10 7V4.500h4V7M7 7l1 13h8l1-13M10 11v6M14 11v6" />,
  warn: <path d="M12 4l9.500 16.500h-19zM12 10v4.500M12 17.500v.1" />,
  wifi: <path d="M3 9.500a13 13 0 0118 0M6 13a8.500 8.500 0 0112 0M9 16.500a4 4 0 016 0M12 20v.1" />,
  reset: <path d="M4 12a8 8 0 108-8H8M8 4L5 7l3 3" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** The app mark: a baseball. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="logo">
      <defs>
        <radialGradient id="ballg" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d9d2bd" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#ballg)" />
      <g fill="none" stroke="#c8352e" strokeWidth="2.200" strokeLinecap="round" strokeDasharray="0.1 4.200">
        <path d="M12 7.500c6 6 6 27 0 33" />
        <path d="M36 7.500c-6 6-6 27 0 33" />
      </g>
    </svg>
  );
}

/** Faint infield-diamond line art used as a backdrop. */
export function DiamondArt() {
  return (
    <svg className="diamond-art" viewBox="0 0 320 220" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <g fill="none" stroke="currentColor" strokeWidth="1.500">
        <path d="M160 24L270 124L160 214L50 124Z" />
        <path d="M160 24L270 124M160 24L50 124" opacity=".5" />
        <circle cx="160" cy="124" r="22" opacity=".6" />
        <path d="M160 214L160 124" opacity=".35" />
        <path d="M20 190A220 220 0 01300 190" opacity=".25" />
      </g>
      <g fill="currentColor">
        <rect x="153" y="17" width="14" height="14" rx="2" transform="rotate(45 160 24)" />
        <rect x="263" y="117" width="14" height="14" rx="2" transform="rotate(45 270 124)" />
        <rect x="43" y="117" width="14" height="14" rx="2" transform="rotate(45 50 124)" />
        <path d="M160 202l10 6v8h-20v-8z" />
      </g>
    </svg>
  );
}
