import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, getToken, loadTokens, saveTokens } from './lib/spotify.js';
import { ensurePlayer, pause, startQueue } from './lib/player.js';
import App from './App.jsx';

vi.mock('./lib/spotify.js', () => ({ api: vi.fn(), getToken: vi.fn(), loadTokens: vi.fn(), saveTokens: vi.fn() }));
vi.mock('./lib/player.js', () => ({ ensurePlayer: vi.fn(), pause: vi.fn(), startQueue: vi.fn() }));
vi.mock('./components/Create.jsx', () => ({
  default: ({ onStart }) => <button onClick={() => onStart([{ uri: 'a' }], '📻')}>écran création</button>,
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

function loggedIn() {
  loadTokens.mockReturnValue(true);
  getToken.mockReturnValue('tok');
  api.mockResolvedValue({ id: 'u' });
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  history.replaceState({}, '', '/');
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('App', () => {
  it('affiche la connexion sans session', () => {
    loadTokens.mockReturnValue(false);
    render(<App />);
    expect(screen.getByRole('link', { name: 'Se connecter avec Spotify' })).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it('enregistre les tokens renvoyés par Spotify et nettoie l\'URL', async () => {
    history.replaceState({}, '', '/?access_token=a&refresh_token=r&expires_in=3600');
    loggedIn();
    render(<App />);
    expect(saveTokens).toHaveBeenCalledWith('a', 'r', 3600);
    expect(location.search).toBe('');
    expect(await screen.findByText('écran création')).toBeInTheDocument();
  });

  it('signale une erreur de connexion', () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    history.replaceState({}, '', '/?error=access_denied');
    loadTokens.mockReturnValue(false);
    render(<App />);
    expect(alert).toHaveBeenCalledWith('Erreur de connexion : access_denied');
    expect(location.search).toBe('');
  });

  it('revient à la connexion si la session est invalide', async () => {
    loadTokens.mockReturnValue(true);
    getToken.mockReturnValue('tok');
    api.mockRejectedValue(new Error('401'));
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Se connecter avec Spotify' })).toBeInTheDocument();
  });

  it('lance une partie puis la quitte', async () => {
    loggedIn();
    let connected;
    ensurePlayer.mockReturnValue(new Promise(r => { connected = r; }));
    startQueue.mockResolvedValue();
    render(<App />);
    await userEvent.click(await screen.findByText('écran création'));
    expect(screen.getByText(/écran lecture loading Connexion au lecteur Spotify…/)).toBeInTheDocument();
    await act(async () => connected());
    expect(startQueue).toHaveBeenCalledWith([{ uri: 'a' }]);
    expect(screen.getByText(/écran lecture ready/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('quitter'));
    expect(pause).toHaveBeenCalled();
    expect(screen.getByText('écran création')).toBeInTheDocument();
  });

  it('affiche l\'erreur du lecteur et permet de revenir', async () => {
    loggedIn();
    ensurePlayer.mockRejectedValue(new Error('Spotify Premium requis'));
    render(<App />);
    await userEvent.click(await screen.findByText('écran création'));
    expect(await screen.findByText(/écran lecture error\s+Spotify Premium requis/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('retour'));
    expect(screen.getByText('écran création')).toBeInTheDocument();
  });
});
