import { AVATAR_PRESETS } from '../../../shared/avatars.js';

export default function Avatar({ avatar, size = 40 }) {
  if (avatar.kind === 'upload') {
    return <img className="avatar" src={`/avatars/${avatar.value}`} alt="" width={size} height={size} />;
  }
  const preset = AVATAR_PRESETS.find(p => p.id === avatar.value) ?? AVATAR_PRESETS[0];
  return (
    <span className="avatar" aria-hidden="true"
      style={{ width: size, height: size, background: preset.color, fontSize: size * 0.55 }}>
      {preset.emoji}
    </span>
  );
}
