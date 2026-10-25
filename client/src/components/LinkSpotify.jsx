import { logout } from '../lib/session.js';
import Avatar from './Avatar.jsx';

export default function LinkSpotify({ user, onJoin }) {
  return (
    <div className="screen screen-login">
      <div className="login-card">
        <Avatar avatar={user.avatar} size={72} />
        <h1>{user.username}</h1>
        <p>Pour lancer des parties, relie ton compte Spotify Premium : c&apos;est lui qui joue la musique sur cet appareil.</p>
        <a href="/api/spotify/connect" className="btn btn-green btn-full">Relier mon compte Spotify</a>
        <button type="button" className="btn btn-ghost btn-full link-logout" onClick={onJoin}>🎮 Rejoindre une partie</button>
        <button type="button" className="btn btn-ghost btn-full link-logout" onClick={logout}>Se déconnecter</button>
      </div>
    </div>
  );
}
