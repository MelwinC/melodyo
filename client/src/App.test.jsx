import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensurePlayer, pause, startQueue } from './lib/player.js';
import { loadSession } from './lib/session.js';
import { toast } from './lib/toast.js';
import App from './App.jsx';

const store = vi.hoisted(() => ({ snapshot: { status: 'loading', user: null }, listeners: new Set() }));

vi.mock('./lib/session.js', () => ({
  getSession: () => store.snapshot,
  subscribeSession: fn => { store.listeners.add(fn); return () => store.listeners.delete(fn); },
  loadSession: vi.fn(),
}));
vi.mock('./lib/player.js', () => ({ ensurePlayer: vi.fn(), pause: vi.fn(), startQueue: vi.fn() }));
vi.mock('./lib/toast.js', async importOriginal => ({ ...(await importOriginal()), toast: vi.fn() }));
vi.mock('./components/Auth.jsx', () => ({ default: () => <p>écran connexion</p> }));
vi.mock('./components/LinkSpotify.jsx', () => ({ default: ({ user }) => <p>relier spotify {user.username}</p> }));
vi.mock('./components/Profile.jsx', () => ({ default: ({ onBack }) => <button onClick={onBack}>écran profil</button> }));
vi.mock('./components/Create.jsx', () => ({
  default: ({ user, onStart, onProfile }) => (
    <div>
      <button onClick={() => onStart([{ uri: 'a' }], '📻')}>écran création {user.username}</button>
      <button onClick={onProfile}>profil</button>
    </div>
  ),
}));
vi.mock('./components/Player.jsx', () => ({
  default: ({ status, loadingText, error, onExit, onBack }) => (
    <div>
      <p>écran lecture {status} {loadingText} {error}</p>
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
    expect(startQueue).toHaveBeenCalledWith([{ uri: 'a' }]);
    expect(screen.getByText(/écran lecture ready/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('quitter'));
    expect(pause).toHaveBeenCalled();
    expect(screen.getByText('écran création Mel')).toBeInTheDocument();
  });

  it('affiche l\'erreur du lecteur et permet de revenir', async () => {
    store.snapshot = { status: 'ready', user };
    ensurePlayer.mockRejectedValue(new Error('Spotify Premium requis'));
    render(<App />);
    await userEvent.click(screen.getByText('écran création Mel'));
    expect(await screen.findByText(/écran lecture error\s+Spotify Premium requis/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('retour'));
    expect(screen.getByText('écran création Mel')).toBeInTheDocument();
  });
});
