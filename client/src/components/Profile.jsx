import { AVATAR_PRESETS } from '../../../shared/avatars.js';
import { choosePreset, messageFor, uploadAvatar } from '../lib/session.js';
import { toast } from '../lib/toast.js';
import Avatar from './Avatar.jsx';
import Stats from './Stats.jsx';

async function attempt(action) {
  try {
    await action();
    toast('Avatar mis à jour');
  } catch (err) {
    toast(messageFor(err.code));
  }
}

export default function Profile({ user, onBack }) {
  async function onFile(e) {
    const [file] = e.target.files;
    e.target.value = '';
    if (file) await attempt(() => uploadAvatar(file));
  }

  return (
    <div className="screen">
      <header>
        <button className="btn-back" onClick={onBack}>← Retour</button>
        <h1>Mon profil</h1>
        <span style={{ width: 60 }}></span>
      </header>
      <div className="profile">
        <Avatar avatar={user.avatar} size={96} />
        <div className="profile-name">{user.username}</div>
        <Stats />
        <div className="form-group">
          <label>Choisir un avatar</label>
          <div className="avatar-grid">
            {AVATAR_PRESETS.map(p => (
              <button key={p.id} type="button" className="avatar-choice" aria-label={p.id}
                aria-pressed={user.avatar.kind === 'preset' && user.avatar.value === p.id}
                onClick={() => attempt(() => choosePreset(p.id))}>
                <Avatar avatar={{ kind: 'preset', value: p.id }} size={48} />
              </button>
            ))}
          </div>
        </div>
        <label className="btn btn-ghost btn-full upload-label">
          Envoyer une image
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} hidden />
        </label>
      </div>
    </div>
  );
}
