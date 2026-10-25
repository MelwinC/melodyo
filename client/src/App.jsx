import { useEffect, useState } from 'react';
import { api, getToken, loadTokens, saveTokens } from './lib/spotify.js';
import { ensurePlayer, pause, startQueue } from './lib/player.js';
import Login from './components/Login.jsx';
import Create from './components/Create.jsx';
import Player from './components/Player.jsx';
import Toast from './components/Toast.jsx';

// Récupère les tokens renvoyés par /callback ; true si l'utilisateur a une session
function readAuthParams() {
  const params = new URLSearchParams(location.search);
  if (params.get('access_token')) {
    saveTokens(params.get('access_token'), params.get('refresh_token'), parseInt(params.get('expires_in')));
    history.replaceState({}, '', '/');
  }
  if (params.get('error')) {
    alert('Erreur de connexion : ' + params.get('error'));
    history.replaceState({}, '', '/');
  }
  return loadTokens();
}

export default function App() {
  const [screen, setScreen] = useState(() => ({ name: readAuthParams() ? 'loading' : 'login' }));

  useEffect(() => {
    if (!getToken()) return;
    api('GET', '/me')
      .then(() => setScreen({ name: 'create' }))
      .catch(() => setScreen({ name: 'login' }));
  }, []);

  async function startBlindTest(tracks, title) {
    console.log(`[start] lancement blind test — ${tracks.length} sons`);
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

  return (
    <>
      {screen.name === 'login' && <Login />}
      {screen.name === 'create' && <Create onStart={startBlindTest} />}
      {screen.name === 'player' && (
        <Player {...screen} onExit={exitPlayer} onBack={() => setScreen({ name: 'create' })} />
      )}
      <Toast />
    </>
  );
}
