import { useState } from 'react';
import { login, messageFor, register } from '../lib/session.js';

export default function Auth({ onJoin }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const creating = mode === 'register';

  function switchTo(next) {
    setMode(next);
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await (creating ? register : login)(username, password);
    } catch (err) {
      setError(messageFor(err.code));
      setBusy(false);
    }
  }

  return (
    <div className="screen screen-login">
      <div className="login-card">
        <div className="login-icon">🎵</div>
        <h1>Melodyo</h1>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!creating} onClick={() => switchTo('login')}>Connexion</button>
          <button type="button" role="tab" aria-selected={creating} onClick={() => switchTo('register')}>Créer un compte</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Pseudo
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            Mot de passe
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete={creating ? 'new-password' : 'current-password'} required />
          </label>
          {creating && <p className="hint">Pseudo : 3 à 20 caractères (lettres, chiffres, . _ -). Mot de passe : 8 caractères minimum.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-green btn-full" disabled={busy}>{creating ? 'Créer mon compte' : 'Se connecter'}</button>
        </form>
        <button type="button" className="btn btn-ghost btn-full link-logout" onClick={onJoin}>🎮 Rejoindre une partie</button>
      </div>
    </div>
  );
}
