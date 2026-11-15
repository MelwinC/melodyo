// Pastilles illustrées des thèmes : formes plates à deux tons sur fond pastel (viewBox 40×40)
const STYLES = {
  '80s':      { bg: '#ffd9e6', ink: '#d1568a', alt: '#fff' },
  '90s':      { bg: '#cfe9fb', ink: '#4a8fc7', alt: '#fff' },
  '2000s':    { bg: '#d7f1e4', ink: '#3f9c78', alt: '#fff' },
  '2010s':    { bg: '#e4dcfb', ink: '#7b63dc', alt: '#fff' },
  '2020s':    { bg: '#ffe3cc', ink: '#e07a3a', alt: '#fff' },
  disney:     { bg: '#e9ddfb', ink: '#9a6fe0', alt: '#fff' },
  french:     { bg: '#d4e6fb', ink: '#4d73c9', alt: '#fff' },
  pop:        { bg: '#ffd9ef', ink: '#d65aa6', alt: '#fff' },
  poprock:    { bg: '#ffe0d6', ink: '#d9573f', alt: '#fff' },
  popchill:   { bg: '#fff1bf', ink: '#c4951a', alt: '#fff' },
};

function Art({ id, ink, alt }) {
  switch (id) {
    case '80s': // radio-cassette
      return (<>
        <path d="M13 12.5v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" fill="none" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
        <rect x="6" y="12" width="28" height="18" rx="4" fill={ink} />
        <circle cx="14" cy="21" r="5" fill={alt} /><circle cx="14" cy="21" r="2" fill={ink} />
        <circle cx="26" cy="21" r="5" fill={alt} /><circle cx="26" cy="21" r="2" fill={ink} />
        <rect x="17" y="14.5" width="6" height="2.5" rx="1.2" fill={alt} />
      </>);
    case '90s': // CD
      return (<>
        <circle cx="20" cy="20" r="13" fill={ink} />
        <path d="M11.5 15a10 10 0 0 1 7-5" fill="none" stroke={alt} strokeWidth="2" strokeLinecap="round" opacity=".85" />
        <circle cx="20" cy="20" r="4.5" fill={alt} /><circle cx="20" cy="20" r="1.6" fill={ink} />
      </>);
    case '2000s': // baladeur à molette
      return (<>
        <rect x="10" y="5" width="20" height="30" rx="5" fill={ink} />
        <rect x="13.5" y="8.5" width="13" height="9" rx="2" fill={alt} />
        <circle cx="20" cy="26.5" r="5.5" fill={alt} /><circle cx="20" cy="26.5" r="1.8" fill={ink} />
      </>);
    case '2010s': // casque
      return (<>
        <path d="M8.5 24v-4a11.5 11.5 0 0 1 23 0v4" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
        <rect x="6" y="22" width="7" height="11" rx="3.2" fill={ink} />
        <rect x="27" y="22" width="7" height="11" rx="3.2" fill={ink} />
        <rect x="8" y="25" width="3" height="5" rx="1.5" fill={alt} />
        <rect x="29" y="25" width="3" height="5" rx="1.5" fill={alt} />
      </>);
    case '2020s': // étincelles
      return (<>
        <path d="M18 6c1 7 3 9 10 10-7 1-9 3-10 10-1-7-3-9-10-10 7-1 9-3 10-10z" fill={ink} />
        <path d="M30 22c.5 3.5 1.5 4.5 5 5-3.5.5-4.5 1.5-5 5-.5-3.5-1.5-4.5-5-5 3.5-.5 4.5-1.5 5-5z" fill={alt} stroke={ink} strokeWidth="1.4" strokeLinejoin="round" />
      </>);
    case 'disney': // château
      return (<>
        <path d="M5 34V20l4-6 4 6v14z" fill={ink} /><path d="M27 34V20l4-6 4 6v14z" fill={ink} />
        <path d="M13 34V15l7-10 7 10v19z" fill={ink} />
        <path d="M17 34v-6a3 3 0 0 1 6 0v6z" fill={alt} />
        <rect x="18.8" y="15" width="2.4" height="5" rx="1.2" fill={alt} />
        <path d="M20 5V2.5" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
      </>);
    case 'french': // tour Eiffel
      return (<>
        <path d="M20 4 26 34h-4.2L20 20l-1.8 14H14z" fill={ink} />
        <path d="M13 34h14" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M16.2 22h7.6M17.6 15.5h4.8" stroke={alt} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M18.5 34a1.5 1.5 0 0 1 3 0" fill="none" stroke={alt} strokeWidth="1.6" />
      </>);
    case 'pop': // doubles croches
      return (<>
        <path d="M15 28V10l16-3.5V24" fill="none" stroke={ink} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M15 14.5 31 11" stroke={ink} strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="11.5" cy="28.5" rx="5" ry="4" fill={ink} /><ellipse cx="27.5" cy="25" rx="5" ry="4" fill={ink} />
      </>);
    case 'poprock': // guitare électrique
      return (<g transform="rotate(40 20 20)">
        <rect x="18" y="3" width="4" height="19" rx="1.5" fill={ink} />
        <rect x="16.5" y="1.5" width="7" height="6" rx="2" fill={ink} />
        <path d="M20 19c-6 0-9 3-9 7.5S14 36 20 36s9-3 9-9.5-3-7.5-9-7.5z" fill={ink} />
        <circle cx="20" cy="27.5" r="2.6" fill={alt} />
        <rect x="16.5" y="22.5" width="7" height="1.8" rx=".9" fill={alt} />
      </g>);
    case 'popchill': // lune douce
      return (<>
        <path d="M27.5 24.5A12 12 0 0 1 15 8a12 12 0 1 0 17.5 17.5 12 12 0 0 1-5-1z" fill={ink} />
        <path d="M29 8l.9 2.6 2.6.9-2.6.9L29 15l-.9-2.6-2.6-.9 2.6-.9z" fill={ink} />
      </>);
    default:
      return <circle cx="20" cy="20" r="8" fill={ink} />;
  }
}

export default function ThemeIcon({ id, size = 40 }) {
  const style = STYLES[id] ?? STYLES.pop;
  return (
    <svg className="theme-icon" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="12" fill={style.bg} />
      <Art id={id} ink={style.ink} alt={style.alt} />
    </svg>
  );
}
