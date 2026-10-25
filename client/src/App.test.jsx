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
vi.mock('./lib/room.js', () => ({ sendRoom: vi.fn() }));
vi.mock('./components/useHostRoom.js', () => ({ useHostRoom: (user, enabled, onReconnect) => { host.onReconnect = onReconnect; return host.value; } }));
vi.mock('./components/History.jsx', () => ({ default: ({ onOpen, onBack }) => <div><button onClick={() => onOpen('g9')}>ouvrir g9</button><button onClick={onBack}>retour historique</button></div> }));
vi.mock('./components/GameDetail.jsx', () => ({ default: ({ gameId, onBack }) => <button onClick={onBack}>détail {gameId}</button> }));
vi.mock('./components/ReviewList.jsx', () => ({ default: ({ onBack }) => <button onClick={onBack}>liste à revoir</button> }));
vi.mock('./lib/toast.js', async importOriginal => ({ ...(await importOriginal()), toast: vi.fn() }));
vi.mock('./components/Auth.jsx', () => ({ default: () => <p>écran connexion</p> }));
vi.mock('./components/LinkSpotify.jsx', () => ({ default: ({ user }) => <p>relier spotify {user.username}</p> }));
vi.mock('./components/Profile.jsx', () => ({ default: ({ onBack }) => <button onClick={onBack}>écran profil</button> }));
vi.mock('./components/Create.jsx', () => ({
  default: ({ user, onStart, onProfile, onHistory, onReview, room, roomState, onCloseRoom }) => (
    <div>
      <p>room {room?.code} {roomState?.participants?.length}</p>
      <button onClick={onCloseRoom}>fermer room</button>
      <button onClick={() => onStart([{ uri: 'a' }], '📻', { gameId: 'g1', timer: '30s', start: 'middle', reviewUris: new Set(['u']) })}>écran création {user.username}</button>
      <button onClick={onProfile}>profil</button>
      <button onClick={onHistory}>historique</button>
      <button onClick={onReview}>à revoir</button>
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
});
