import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { endGame, markPlayed } from './lib/games.js';
import { ensurePlayer, pause, startQueue } from './lib/player.js';
import { getRoomState, sendRoom } from './lib/room.js';
import { getSession, loadSession, subscribeSession } from './lib/session.js';
import { toast } from './lib/toast.js';
import Auth from './components/Auth.jsx';
import Correction from './components/Correction.jsx';
import Create from './components/Create.jsx';
import Join from './components/Join.jsx';
import GameDetail from './components/GameDetail.jsx';
import History from './components/History.jsx';
import LinkSpotify from './components/LinkSpotify.jsx';
import Player from './components/Player.jsx';
import Profile from './components/Profile.jsx';
import ReviewList from './components/ReviewList.jsx';
import Scoreboard from './components/Scoreboard.jsx';
import Screen from './components/Screen.jsx';
import Toast from './components/Toast.jsx';
import { useHostRoom } from './components/useHostRoom.js';

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

// Lien d'invitation /r/CODE : l'appareil rejoint la room comme participant
function joinCodeFromUrl() {
  const match = location.pathname.match(/^\/r\/([^/]*)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function App() {
  const session = useSyncExternalStore(subscribeSession, getSession);
  const [screen, setScreen] = useState({ name: 'create' });
  const [join, setJoin] = useState(joinCodeFromUrl);
  // Partie et chanson en cours, renvoyées au serveur si la connexion temps réel se rétablit
  const live = useRef({ gameId: null, round: null });
  const host = useHostRoom(session.user, join === null, () => {
    const { gameId, round } = live.current;
    if (!gameId) return;
    sendRoom({ type: 'game:start', gameId });
    // Dernière phase connue avant la coupure (utile si le serveur a redémarré entre-temps) ;
    // hors du jeu, on ne rejoue pas la manche, qui remettrait sa correction à zéro
    const last = getRoomState().state;
    if (last?.phase === 'correcting') sendRoom({ type: 'correction:start', position: last.correction.position });
    else if (last?.phase === 'final') sendRoom({ type: 'game:final' });
    else if (round) sendRoom({ type: 'round:start', ...round });
  });

  useEffect(() => {
    showUrlError();
    loadSession();
  }, []);

  const roomState = host.live.state;
  const phase = roomState?.phase;
  const roomGameId = roomState?.game?.id;
  const [dismissed, setDismissed] = useState(null);

  // Page du créateur rechargée pendant le jeu : le lecteur est perdu, on termine proprement
  // la partie restée ouverte côté serveur pour débloquer les participants.
  // En correction ou au classement, le lecteur n'est pas nécessaire : le créateur reprend la main.
  useEffect(() => {
    if (phase !== 'playing' || roomGameId === live.current.gameId) return;
    sendRoom({ type: 'game:end' });
    endGame(roomGameId).catch(() => {});
  }, [phase, roomGameId]);

  // Correction et classement : la musique s'arrête ; la partie est enregistrée dès le classement
  useEffect(() => {
    if (phase === 'correcting' || phase === 'final') pause();
    if (phase === 'final') endGame(roomGameId).catch(() => {});
  }, [phase, roomGameId]);

  async function startGame(tracks, title, { gameId, timer, start, reviewUris }) {
    console.log(`[start] lancement de la partie — ${tracks.length} sons`);
    const show = (status, extra = {}) => setScreen({ name: 'player', title, status, gameId, tracks, reviewUris, ...extra });
    live.current = { gameId, round: null };
    try {
      show('loading', { loadingText: 'Connexion au lecteur Spotify…' });
      await ensurePlayer();
      show('loading', { loadingText: 'Lancement…' });
      sendRoom({ type: 'game:start', gameId });
      await startQueue(tracks, {
        timer,
        start,
        onTrackStart: (position, durationMs, firstTime) => {
          // Chaque chanson réellement jouée est enregistrée : elle sera exclue de la partie suivante
          if (firstTime) markPlayed(gameId, position).catch(() => {});
          live.current.round = { position, durationMs };
          sendRoom({ type: 'round:start', position, durationMs });
        },
        onPlayback: paused => sendRoom({ type: 'playback', paused }),
      });
      show('ready');
    } catch (e) {
      show('error', { error: e.message });
    }
  }

  // Quitter la partie : terminée si toutes les chansons ont été jouées, interrompue sinon
  function leaveGame() {
    pause();
    sendRoom({ type: 'game:end' });
    live.current = { gameId: null, round: null };
    endGame(screen.gameId ?? roomGameId).catch(() => {});
    setScreen({ name: 'create' });
  }

  // Quitter le classement : les participants le gardent jusqu'à la partie suivante
  function leaveFinal() {
    setDismissed(roomGameId);
    live.current = { gameId: null, round: null };
    setScreen({ name: 'create' });
  }

  const toCreate = () => setScreen({ name: 'create' });
  const openJoin = () => {
    history.pushState({}, '', '/r/');
    setJoin('');
  };
  const leaveJoin = () => {
    history.pushState({}, '', '/');
    setJoin(null);
  };
  let content;
  if (session.status === 'loading') {
    content = <div className="player-loading"><div className="player-loading-spinner"></div></div>;
  } else if (join !== null) {
    content = <Join code={join} user={session.user} onLeave={leaveJoin} />;
  } else if (session.status === 'anonymous') {
    content = <Auth onJoin={openJoin} />;
  } else if (!session.user.spotifyLinked) {
    content = <LinkSpotify user={session.user} onJoin={openJoin} />;
  } else if (screen.name === 'profile') {
    content = <Profile user={session.user} onBack={toCreate} />;
  } else if (phase === 'correcting') {
    const { position } = roomState.correction;
    content = (
      <Screen title="Correction" onBack={leaveGame}>
        <Correction state={roomState} onReveal={p => sendRoom({ type: 'reveal', position: p })}
          onCorrect={(participantId, field, ok) => sendRoom({ type: 'correct', position, participantId, field, ok })}
          onNext={() => sendRoom({ type: 'correction:next' })} />
      </Screen>
    );
  } else if (phase === 'final' && roomGameId !== dismissed) {
    content = (
      <Screen title="Fin de partie" onBack={leaveFinal}>
        <Scoreboard scores={roomState.scores} participants={roomState.participants} details={roomState.final.details} onClose={leaveFinal} />
      </Screen>
    );
  } else if (screen.name === 'player') {
    content = <Player {...screen} room={host.live} onExit={leaveGame} onBack={leaveGame} />;
  } else if (screen.name === 'history') {
    content = <History onOpen={gameId => setScreen({ name: 'game', gameId })} onBack={toCreate} />;
  } else if (screen.name === 'game') {
    content = <GameDetail gameId={screen.gameId} onBack={() => setScreen({ name: 'history' })} />;
  } else if (screen.name === 'review') {
    content = <ReviewList onBack={toCreate} />;
  } else {
    content = (
      <Create user={session.user} onStart={startGame} onProfile={() => setScreen({ name: 'profile' })}
        room={host.room} roomState={host.live.state} onCloseRoom={host.close}
        onHistory={() => setScreen({ name: 'history' })} onReview={() => setScreen({ name: 'review' })} onJoin={openJoin} />
    );
  }

  return (
    <>
      {content}
      <Toast />
    </>
  );
}
