import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensurePlayer, pause, startQueue } from './lib/player.js';
import { endGame, markPlayed } from './lib/games.js';
import { loadSession } from './lib/session.js';
import { sendRoom } from './lib/room.js';
import { toast } from './lib/toast.js';
import App from './App.jsx';

const store = vi.hoisted(() => ({ snapshot: { status: 'loading', user: null }, listeners: new Set() }));

vi.mock('./lib/session.js', () => ({
  getSession: () => store.snapshot,
  subscribeSession: fn => { store.listeners.add(fn); return () => store.listeners.delete(fn); },
  loadSession: vi.fn(),
}));
vi.mock('./lib/player.js', () => ({ ensurePlayer: vi.fn(), pause: vi.fn(), startQueue: vi.fn() }));
vi.mock('./lib/games.js', () => ({ markPlayed: vi.fn(), endGame: vi.fn() }));
const host = vi.hoisted(() => ({ value: null }));
const roomStore = vi.hoisted(() => ({ state: null }));
vi.mock('./lib/room.js', () => ({ sendRoom: vi.fn(), getRoomState: () => ({ state: roomStore.state }) }));
vi.mock('./components/Correction.jsx', () => ({ default: ({ state, onCorrect, onReveal, onNext }) => (
  <div>
    <p>correction {state.correction.position}</p>
    <button onClick={() => onCorrect('p1', 'title', true)}>valider</button>
    <button onClick={() => onReveal(1)}>révéler</button>
    <button onClick={onNext}>suivante</button>
  </div>
) }));
vi.mock('./components/Scoreboard.jsx', () => ({ default: ({ scores, details, onClose }) => <button onClick={onClose}>classement {scores.length} {Object.keys(details).length}</button> }));
vi.mock('./components/useHostRoom.js', () => ({ useHostRoom: (user, enabled, onReconnect) => { host.onReconnect = onReconnect; host.enabled = enabled; return host.value; } }));
vi.mock('./components/Join.jsx', () => ({ default: ({ code, user, onLeave }) => <button onClick={onLeave}>rejoindre [{code}] {user?.username ?? 'invité'}</button> }));
vi.mock('./components/History.jsx', () => ({ default: ({ onOpen, onBack }) => <div><button onClick={() => onOpen('g9')}>ouvrir g9</button><button onClick={onBack}>retour historique</button></div> }));
vi.mock('./components/GameDetail.jsx', () => ({ default: ({ gameId, onBack }) => <button onClick={onBack}>détail {gameId}</button> }));
vi.mock('./components/ReviewList.jsx', () => ({ default: ({ onBack }) => <button onClick={onBack}>liste à revoir</button> }));
vi.mock('./lib/toast.js', async importOriginal => ({ ...(await importOriginal()), toast: vi.fn() }));
vi.mock('./components/Auth.jsx', () => ({ default: ({ onJoin }) => <button onClick={onJoin}>écran connexion</button> }));
vi.mock('./components/LinkSpotify.jsx', () => ({ default: ({ user, onJoin, onProfile }) => (
  <div>
    <button onClick={onJoin}>relier spotify {user.username}</button>
    <button onClick={onProfile}>profil sans spotify</button>
  </div>
) }));
vi.mock('./components/Profile.jsx', () => ({ default: ({ onBack }) => <button onClick={onBack}>écran profil</button> }));
vi.mock('./components/Create.jsx', () => ({
  default: ({ user, onStart, onProfile, onHistory, onReview, onJoin, room, roomState, onCloseRoom }) => (
    <div>
      <p>room {room?.code} {roomState?.participants?.length}</p>
      <button onClick={onCloseRoom}>fermer room</button>
      <button onClick={() => onStart([{ uri: 'a' }], '📻', { gameId: 'g1', timer: '30s', start: 'middle', reviewUris: new Set(['u']) })}>écran création {user.username}</button>
      <button onClick={onProfile}>profil</button>
      <button onClick={onHistory}>historique</button>
      <button onClick={onReview}>à revoir</button>
      <button onClick={onJoin}>rejoindre une partie</button>
    </div>
  ),
}));
vi.mock('./components/Player.jsx', () => ({
  default: ({ status, loadingText, error, onExit, onBack, tracks, reviewUris, room }) => (
    <div>
      <p>direct {room?.connected ? 'oui' : 'non'}</p>
      <p>écran lecture {status} {loadingText} {error} {tracks?.length} {reviewUris?.size}</p>
      <button onClick={onExit}>quitter</button>
      <button onClick={onBack}>retour</button>
    </div>
  ),
}));

const user = { username: 'Mel', spotifyLinked: true };

function setSession(snapshot) {
  act(() => {
    store.snapshot = snapshot;
    store.listeners.forEach(fn => fn());
  });
}

beforeEach(() => {
  host.value = {
    room: { id: 'r1', code: 'ABC234' },
    live: { connected: true, state: { participants: [{ id: 'p1' }] } },
    close: vi.fn(),
  };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  store.snapshot = { status: 'loading', user: null };
  history.replaceState({}, '', '/');
});
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });

describe('App', () => {
  it('charge la session au démarrage', () => {
    const { container } = render(<App />);
    expect(loadSession).toHaveBeenCalledOnce();
    expect(container.querySelector('.player-loading-spinner')).toBeInTheDocument();
  });

  it('demande de se connecter sans session', () => {
    render(<App />);
    setSession({ status: 'anonymous', user: null });
    expect(screen.getByText('écran connexion')).toBeInTheDocument();
  });

  it('demande de relier Spotify si besoin', () => {
    render(<App />);
    setSession({ status: 'ready', user: { ...user, spotifyLinked: false } });
    expect(screen.getByText('relier spotify Mel')).toBeInTheDocument();
  });

  it('ouvre le profil puis revient', async () => {
    store.snapshot = { status: 'ready', user };
    render(<App />);
    await userEvent.click(screen.getByText('profil'));
    await userEvent.click(screen.getByText('écran profil'));
    expect(screen.getByText('écran création Mel')).toBeInTheDocument();
  });

  it.each([
    ['access_denied', 'Connexion Spotify refusée'],
    ['login_required', 'Session expirée, reconnecte-toi'],
    ['token_exchange_failed', 'Échec de la liaison Spotify'],
  ])('affiche l\'erreur %s renvoyée par Spotify et nettoie l\'URL', (code, message) => {
    history.replaceState({}, '', `/?error=${code}`);
    render(<App />);
    expect(toast).toHaveBeenCalledWith(message);
    expect(location.search).toBe('');
  });

  it('lance une partie puis la quitte', async () => {
    store.snapshot = { status: 'ready', user };
    let connected;
    ensurePlayer.mockReturnValue(new Promise(r => { connected = r; }));
    startQueue.mockResolvedValue();
    render(<App />);
    await userEvent.click(screen.getByText('écran création Mel'));
    expect(screen.getByText(/écran lecture loading Connexion au lecteur Spotify…/)).toBeInTheDocument();
    await act(async () => connected());
    expect(startQueue).toHaveBeenCalledWith([{ uri: 'a' }], {
      timer: '30s', start: 'middle', onTrackStart: expect.any(Function), onPlayback: expect.any(Function),
    });
    expect(screen.getByText('écran lecture ready 1 1')).toBeInTheDocument();
    expect(screen.getByText('direct oui')).toBeInTheDocument();
    expect(sendRoom).toHaveBeenCalledWith({ type: 'game:start', gameId: 'g1' });

    const { onTrackStart, onPlayback } = startQueue.mock.calls[0][1];
    markPlayed.mockRejectedValue(new Error('down'));
    onTrackStart(2, 180000, true);
    expect(markPlayed).toHaveBeenCalledWith('g1', 2);
    expect(sendRoom).toHaveBeenLastCalledWith({ type: 'round:start', position: 2, durationMs: 180000 });
    onTrackStart(1, 90000, false);
    expect(markPlayed).toHaveBeenCalledTimes(1);
    onPlayback(true);
    expect(sendRoom).toHaveBeenLastCalledWith({ type: 'playback', paused: true });

    sendRoom.mockClear();
    host.onReconnect();
    expect(sendRoom.mock.calls).toEqual([
      [{ type: 'game:start', gameId: 'g1' }],
      [{ type: 'round:start', position: 1, durationMs: 90000 }],
    ]);

    endGame.mockResolvedValue({ status: 'finished' });
    await userEvent.click(screen.getByText('quitter'));
    expect(pause).toHaveBeenCalled();
    expect(endGame).toHaveBeenCalledWith('g1');
    expect(sendRoom).toHaveBeenLastCalledWith({ type: 'game:end' });
    sendRoom.mockClear();
    host.onReconnect();
    expect(sendRoom).not.toHaveBeenCalled();
    expect(screen.getByText('écran création Mel')).toBeInTheDocument();
  });

  it('affiche l\'erreur du lecteur et permet de revenir', async () => {
    store.snapshot = { status: 'ready', user };
    ensurePlayer.mockRejectedValue(new Error('Spotify Premium requis'));
    render(<App />);
    await userEvent.click(screen.getByText('écran création Mel'));
    expect(await screen.findByText(/écran lecture error\s+Spotify Premium requis/)).toBeInTheDocument();
    endGame.mockRejectedValue(new Error('down'));
    await userEvent.click(screen.getByText('retour'));
    expect(endGame).toHaveBeenCalledWith('g1');
    expect(screen.getByText('écran création Mel')).toBeInTheDocument();
  });

  it('navigue dans l\'historique et la liste à revoir', async () => {
    store.snapshot = { status: 'ready', user };
    render(<App />);
    await userEvent.click(screen.getByText('historique'));
    await userEvent.click(screen.getByText('ouvrir g9'));
    await userEvent.click(screen.getByText('détail g9'));
    await userEvent.click(screen.getByText('retour historique'));
    await userEvent.click(screen.getByText('à revoir'));
    await userEvent.click(screen.getByText('liste à revoir'));
    expect(screen.getByText('écran création Mel')).toBeInTheDocument();
  });

  it('affiche la room et permet de la fermer', async () => {
    store.snapshot = { status: 'ready', user };
    render(<App />);
    expect(screen.getByText('room ABC234 1')).toBeInTheDocument();
    await userEvent.click(screen.getByText('fermer room'));
    expect(host.value.close).toHaveBeenCalled();
  });

  it('reprend une partie dont aucune chanson n\'a encore démarré', async () => {
    store.snapshot = { status: 'ready', user };
    ensurePlayer.mockResolvedValue();
    startQueue.mockResolvedValue();
    render(<App />);
    await userEvent.click(screen.getByText('écran création Mel'));
    sendRoom.mockClear();
    host.onReconnect();
    expect(sendRoom.mock.calls).toEqual([[{ type: 'game:start', gameId: 'g1' }]]);
  });

  it('ouvre l\'écran pour rejoindre depuis un lien /r/CODE, sans ouvrir de room créateur', () => {
    history.replaceState({}, '', '/r/ABC234');
    store.snapshot = { status: 'ready', user };
    render(<App />);
    expect(screen.getByText('rejoindre [ABC234] Mel')).toBeInTheDocument();
    expect(host.enabled).toBe(false);
  });

  it('fait rejoindre un invité sans session puis revient à l\'accueil', async () => {
    history.replaceState({}, '', '/r/abc%20234');
    store.snapshot = { status: 'anonymous', user: null };
    render(<App />);
    await userEvent.click(screen.getByText('rejoindre [abc 234] invité'));
    expect(location.pathname).toBe('/');
    expect(screen.getByText('écran connexion')).toBeInTheDocument();
  });

  it.each([
    ['la connexion', { status: 'anonymous', user: null }, 'écran connexion'],
    ['la liaison Spotify', { status: 'ready', user: { ...user, spotifyLinked: false } }, 'relier spotify Mel'],
    ['la création', { status: 'ready', user }, 'rejoindre une partie'],
  ])('propose de rejoindre une partie depuis %s', async (_, snapshot, button) => {
    store.snapshot = snapshot;
    render(<App />);
    await userEvent.click(screen.getByText(button));
    expect(location.pathname).toBe('/r/');
    expect(screen.getByText(/rejoindre \[\]/)).toBeInTheDocument();
  });

  it('attend la session avant d\'afficher l\'écran pour rejoindre', () => {
    history.replaceState({}, '', '/r/ABC234');
    const { container } = render(<App />);
    expect(container.querySelector('.player-loading-spinner')).toBeInTheDocument();
  });

  it('termine la partie orpheline laissée par un rechargement de la page du créateur', () => {
    store.snapshot = { status: 'ready', user };
    host.value.live = { connected: true, state: { participants: [], game: { id: 'ancienne' }, phase: 'playing' } };
    render(<App />);
    expect(sendRoom).toHaveBeenCalledWith({ type: 'game:end' });
    expect(endGame).toHaveBeenCalledWith('ancienne');
  });

  it('ne touche pas à la partie en cours de lancement', async () => {
    store.snapshot = { status: 'ready', user };
    ensurePlayer.mockReturnValue(new Promise(() => {}));
    const { rerender } = render(<App />);
    await userEvent.click(screen.getByText('écran création Mel'));
    host.value = { ...host.value, live: { connected: true, state: { participants: [], game: { id: 'g1' }, phase: 'playing' } } };
    sendRoom.mockClear();
    rerender(<App />);
    expect(sendRoom).not.toHaveBeenCalledWith({ type: 'game:end' });
  });

  describe('correction et classement', () => {
    async function playing(state) {
      store.snapshot = { status: 'ready', user };
      ensurePlayer.mockResolvedValue();
      startQueue.mockResolvedValue();
      const view = render(<App />);
      await userEvent.click(screen.getByText('écran création Mel'));
      host.value = { ...host.value, live: { connected: true, state: { participants: [], game: { id: 'g1' }, ...state } } };
      view.rerender(<App />);
      return view;
    }

    it('affiche l\'écran de correction à la fin et pilote la correction', async () => {
      await playing({ phase: 'correcting', correction: { position: 1 } });
      sendRoom.mockClear();
      await userEvent.click(screen.getByText('valider'));
      expect(sendRoom).toHaveBeenCalledWith({ type: 'correct', position: 1, participantId: 'p1', field: 'title', ok: true });
      await userEvent.click(screen.getByText('révéler'));
      expect(sendRoom).toHaveBeenCalledWith({ type: 'reveal', position: 1 });
      await userEvent.click(screen.getByText('suivante'));
      expect(sendRoom).toHaveBeenLastCalledWith({ type: 'correction:next' });
    });

    it('affiche le classement final, met la musique en pause et laisse le classement aux joueurs', async () => {
      await playing({ phase: 'final', scores: [{ id: 'p1' }], final: { details: { p1: [] } } });
      expect(pause).toHaveBeenCalled();
      expect(endGame).toHaveBeenCalledWith('g1');
      sendRoom.mockClear();
      await userEvent.click(screen.getByText('classement 1 1'));
      expect(sendRoom).not.toHaveBeenCalledWith({ type: 'game:end' });
      expect(screen.getByText('écran création Mel')).toBeInTheDocument();
    });

    it('reprend la correction ou le classement après un rechargement de la page', async () => {
      store.snapshot = { status: 'ready', user };
      host.value = { ...host.value, live: { connected: true, state: { participants: [], game: { id: 'g7' }, phase: 'correcting', correction: { position: 3 } } } };
      const { unmount } = render(<App />);
      expect(screen.getByText('correction 3')).toBeInTheDocument();
      expect(sendRoom).not.toHaveBeenCalledWith({ type: 'game:end' });
      await userEvent.click(screen.getByRole('button', { name: '← Retour' }));
      expect(endGame).toHaveBeenCalledWith('g7');
      unmount();
      host.value = { ...host.value, live: { connected: true, state: { participants: [], game: { id: 'g7' }, phase: 'final', scores: [], final: { details: {} } } } };
      render(<App />);
      expect(screen.getByText('classement 0 0')).toBeInTheDocument();
    });

    it('quitte la correction en terminant la partie', async () => {
      await playing({ phase: 'correcting', correction: { position: 0 } });
      await userEvent.click(screen.getByRole('button', { name: '← Retour' }));
      expect(sendRoom).toHaveBeenCalledWith({ type: 'game:end' });
      expect(endGame).toHaveBeenCalledWith('g1');
    });

    it('renvoie la phase de correction après une coupure', async () => {
      await playing({ phase: 'playing' });
      sendRoom.mockClear();
      roomStore.state = { phase: 'correcting', correction: { position: 4 } };
      startQueue.mock.calls[0][1].onTrackStart(1, 9000, true);
      sendRoom.mockClear();
      host.onReconnect();
      expect(sendRoom.mock.calls).toEqual([
        [{ type: 'game:start', gameId: 'g1' }],
        [{ type: 'correction:start', position: 4 }],
      ]);
      roomStore.state = { phase: 'final' };
      host.onReconnect();
      expect(sendRoom).toHaveBeenLastCalledWith({ type: 'game:final' });
      roomStore.state = null;
    });
  });

  it('ouvre le profil d\'un joueur sans Spotify puis revient', async () => {
    store.snapshot = { status: 'ready', user: { ...user, spotifyLinked: false } };
    render(<App />);
    await userEvent.click(screen.getByText('profil sans spotify'));
    await userEvent.click(screen.getByText('écran profil'));
    expect(screen.getByText('relier spotify Mel')).toBeInTheDocument();
  });
});
