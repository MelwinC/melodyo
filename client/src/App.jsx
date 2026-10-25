import { useEffect, useState, useSyncExternalStore } from 'react';
import { ensurePlayer, pause, startQueue } from './lib/player.js';
import { getSession, loadSession, subscribeSession } from './lib/session.js';
import { toast } from './lib/toast.js';
import Auth from './components/Auth.jsx';
import Create from './components/Create.jsx';
import LinkSpotify from './components/LinkSpotify.jsx';
import Player from './components/Player.jsx';
import Profile from './components/Profile.jsx';
import Toast from './components/Toast.jsx';

const URL_ERRORS = {
  access_denied: 'Connexion Spotify refusée',
  login_required: 'Session expirée, reconnecte-toi',
};

// Erreur renvoyée par le retour de Spotify (/callback) : affichée une fois puis retirée de l'URL
function showUrlError() {
  const error = new URLSearchParams(location.search).get('error');
  if (!error) return;
  toast(URL_ERRORS[error] ?? 'Échec de la liaison Spotify');
  history.replaceState({}, '', '/');
}

export default function App() {
  const session = useSyncExternalStore(subscribeSession, getSession);
  const [screen, setScreen] = useState({ name: 'create' });

  useEffect(() => {
    showUrlError();
    loadSession();
  }, []);

  async function startGame(tracks, title) {
    console.log(`[start] lancement de la partie — ${tracks.length} sons`);
    const show = (status, extra = {}) => setScreen({ name: 'player', title, status, ...extra });
    try {
      show('loading', { loadingText: 'Connexion au lecteur Spotify…' });
      await ensurePlayer();
      show('loading', { loadingText: 'Lancement…' });
      await startQueue(tracks);
      show('ready');
    } catch (e) {
      show('error', { error: e.message });
    }
  }

  function exitPlayer() {
    pause();
    setScreen({ name: 'create' });
  }

  const toCreate = () => setScreen({ name: 'create' });
  let content;
  if (session.status === 'loading') {
    content = <div className="player-loading"><div className="player-loading-spinner"></div></div>;
  } else if (session.status === 'anonymous') {
    content = <Auth />;
  } else if (!session.user.spotifyLinked) {
    content = <LinkSpotify user={session.user} />;
  } else if (screen.name === 'profile') {
    content = <Profile user={session.user} onBack={toCreate} />;
  } else if (screen.name === 'player') {
    content = <Player {...screen} onExit={exitPlayer} onBack={toCreate} />;
  } else {
    content = <Create user={session.user} onStart={startGame} onProfile={() => setScreen({ name: 'profile' })} />;
  }

  return (
    <>
      {content}
      <Toast />
    </>
  );
}
