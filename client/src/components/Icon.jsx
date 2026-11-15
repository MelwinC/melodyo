// Icônes en trait arrondi (24×24), décoratives : le libellé du bouton porte le sens
const PATHS = {
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6.5" y="5" width="4" height="14" rx="1.5" fill="currentColor" stroke="none" /><rect x="13.5" y="5" width="4" height="14" rx="1.5" fill="currentColor" stroke="none" /></>,
  prev: <><path d="M18 5.5v13L8.5 12z" fill="currentColor" stroke="none" /><path d="M6 5.5v13" /></>,
  next: <><path d="M6 5.5v13L15.5 12z" fill="currentColor" stroke="none" /><path d="M18 5.5v13" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" /><path d="M3.5 4v4.5H8" /><path d="M12 8v4.5l3 1.8" /></>,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />,
  users: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19c.5-3.2 3-5 6-5s5.5 1.8 6 5" /><path d="M16 5.6a3.2 3.2 0 0 1 0 6" /><path d="M18 14.3c1.7.6 2.8 2.2 3 4.7" /></>,
  user: <><circle cx="12" cy="8.5" r="3.6" /><path d="M4.5 20c.6-4 3.7-6 7.5-6s6.9 2 7.5 6" /></>,
  logout: <><path d="M9.5 4.5h-4a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h4" /><path d="M15 8l4 4-4 4" /><path d="M19 12H9.5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  bulb: <><path d="M9 17.5h6" /><path d="M10 20.5h4" /><path d="M12 3.5a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3.5z" /></>,
  trophy: <><path d="M8 4.5h8v5a4 4 0 0 1-8 0z" /><path d="M8 6.5H4.5c0 3 1.5 4.5 3.7 4.8" /><path d="M16 6.5h3.5c0 3-1.5 4.5-3.7 4.8" /><path d="M12 13.5v3.5" /><path d="M8.5 20h7" /><path d="M9.5 20v-3h5v3" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.8 2.8L16.2 9.5" /></>,
  back: <><path d="M15 5.5 8.5 12l6.5 6.5" /></>,
  warn: <><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5" /><path d="M12 17.2v.1" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5v-1a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h1" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  gamepad: <><rect x="2.5" y="7" width="19" height="11" rx="5" /><path d="M8 10.5v4M6 12.5h4" /><path d="M15.5 11.5v.1M18 13.5v.1" /></>,
  rewind: <><path d="M11 6.5v11L4 12z" fill="currentColor" stroke="none" /><path d="M20 6.5v11L13 12z" fill="currentColor" stroke="none" /></>,
  forward: <><path d="M13 6.5v11L20 12z" fill="currentColor" stroke="none" /><path d="M4 6.5v11L11 12z" fill="currentColor" stroke="none" /></>,
  note: <><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>,
};

export default function Icon({ name, size = 18 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

// Logo : pastille lilas avec des barres d'égaliseur arrondies
export function Logo({ size = 40 }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="15" fill="#b9a8f7" />
      <rect x="9" y="19" width="5.5" height="10" rx="2.75" fill="#fff" />
      <rect x="17.5" y="11" width="5.5" height="26" rx="2.75" fill="#ffd0e0" />
      <rect x="26" y="15" width="5.5" height="18" rx="2.75" fill="#fff" />
      <rect x="34.5" y="21" width="5.5" height="6" rx="2.75" fill="#c4eedb" />
    </svg>
  );
}
