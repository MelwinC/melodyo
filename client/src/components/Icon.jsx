import {
  CaretLeft, Check, CheckCircle, ClockCounterClockwise, Copy, Eye, GameController, Lightbulb, Link,
  Lock, MusicNotes, Pause, Play, SignOut, SkipBack, SkipForward, Star, Trophy, User, Warning, X,
} from '@phosphor-icons/react';

// Icônes Phosphor (MIT, https://phosphoricons.com) : pleines pour la lecture, bold ailleurs
const ICONS = {
  play: [Play, 'fill'],
  pause: [Pause, 'fill'],
  prev: [SkipBack, 'fill'],
  next: [SkipForward, 'fill'],
  history: [ClockCounterClockwise, 'bold'],
  star: [Star, 'bold'],
  user: [User, 'bold'],
  logout: [SignOut, 'bold'],
  eye: [Eye, 'bold'],
  lock: [Lock, 'bold'],
  bulb: [Lightbulb, 'bold'],
  trophy: [Trophy, 'bold'],
  check: [Check, 'bold'],
  checkCircle: [CheckCircle, 'bold'],
  back: [CaretLeft, 'bold'],
  warn: [Warning, 'bold'],
  link: [Link, 'bold'],
  copy: [Copy, 'bold'],
  close: [X, 'bold'],
  gamepad: [GameController, 'bold'],
  note: [MusicNotes, 'bold'],
};

// Décorative : le libellé du bouton porte le sens
export default function Icon({ name, size = 18 }) {
  const [Glyph, weight] = ICONS[name];
  return <Glyph className="icon" size={size} weight={weight} aria-hidden="true" />;
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
