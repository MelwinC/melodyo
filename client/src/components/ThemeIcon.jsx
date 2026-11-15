import { CassetteTape, CastleTurret, DeviceMobile, DiscoBall, Disc, Fire, Guitar, Headphones, MicrophoneStage, Moon, MusicNotes } from '@phosphor-icons/react';

// Pastille de thème : glyphe Phosphor (MIT) en duotone sur un fond pastel
const THEME_ART = {
  '80s':    { Glyph: CassetteTape,    bg: '#ffd9e6', ink: '#d1568a' },
  '90s':    { Glyph: Disc,            bg: '#cfe9fb', ink: '#3f86c4' },
  '2000s':  { Glyph: DeviceMobile,    bg: '#d7f1e4', ink: '#3b9672' },
  '2010s':  { Glyph: Headphones,      bg: '#e4dcfb', ink: '#7059d6' },
  '2020s':  { Glyph: Fire,            bg: '#ffe3cc', ink: '#e07a3a' },
  disney:   { Glyph: CastleTurret,    bg: '#e9ddfb', ink: '#9265da' },
  french:   { Glyph: MicrophoneStage, bg: '#d4e6fb', ink: '#4d73c9' },
  pop:      { Glyph: DiscoBall,       bg: '#ffd9ef', ink: '#cc4f9d' },
  poprock:  { Glyph: Guitar,          bg: '#ffe0d6', ink: '#d9573f' },
  popchill: { Glyph: Moon,            bg: '#fff1bf', ink: '#b98a12' },
};

export default function ThemeIcon({ id, size = 40 }) {
  const { Glyph, bg, ink } = THEME_ART[id] ?? { Glyph: MusicNotes, bg: '#e4dcfb', ink: '#7059d6' };
  return (
    <span className="theme-icon" aria-hidden="true" style={{ width: size, height: size, background: bg, color: ink }}>
      <Glyph size={Math.round(size * 0.62)} weight="duotone" />
    </span>
  );
}
