import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, fetchExclusions, fetchReview } from '../lib/games.js';
import { buildTracks, getThemePools, loadThemePool } from '../lib/tracks.js';
import { activate, disconnect, ensurePlayer } from '../lib/player.js';
import { logout } from '../lib/session.js';
import { toast } from '../lib/toast.js';
import Create from './Create.jsx';

const state = vi.hoisted(() => ({ firefox: false }));

vi.mock('../lib/tracks.js', async importOriginal => ({ ...(await importOriginal()), buildTracks: vi.fn(), getThemePools: vi.fn(), loadThemePool: vi.fn() }));
vi.mock('../lib/games.js', () => ({ createGame: vi.fn(), fetchExclusions: vi.fn(), fetchReview: vi.fn() }));
vi.mock('./Lobby.jsx', () => ({ default: ({ room, state, onClose }) => <button onClick={onClose}>salon {room.code} {state?.participants.length}</button> }));
vi.mock('../lib/toast.js', () => ({ toast: vi.fn() }));
vi.mock('../lib/session.js', () => ({ logout: vi.fn() }));
vi.mock('../lib/player.js', () => ({
  activate: vi.fn(), disconnect: vi.fn(), ensurePlayer: vi.fn(),
  get isFirefox() { return state.firefox; },
}));

const user = { username: 'Mel', avatar: { kind: 'preset', value: 'micro' } };
const pool = n => Array.from({ length: n }, (_, i) => ({ uri: `spotify:track:u${i}`, name: `Son ${i}`, artists: [{ name: 'A' }], album: { images: [] }, _themeId: '80s' }));
const card = label => screen.getByText(label).closest('label');
const badgeOf = text => screen.getByText(text).closest('label').querySelector('.badge');
const launch = () => screen.getByRole('button', { name: /Lancer la partie/ });
const slider = () => screen.getByRole('slider');

beforeEach(() => {
  getThemePools.mockReturnValue({});
  fetchExclusions.mockResolvedValue(new Set());
  fetchReview.mockResolvedValue([]);
  createGame.mockResolvedValue('g1');
  ensurePlayer.mockResolvedValue();
  state.firefox = false;
});
afterEach(() => vi.clearAllMocks());

describe('Create', () => {
  it('prépare le lecteur et ignore son échec', async () => {
    ensurePlayer.mockRejectedValue(new Error('x'));
    render(<Create user={user} onProfile={vi.fn()} onStart={vi.fn()} />);
    await waitFor(() => expect(ensurePlayer).toHaveBeenCalled());
  });

  it('compte les sons d\'un thème coché', async () => {
    let resolve;
    loadThemePool.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<Create user={user} onProfile={vi.fn()} onStart={vi.fn()} />);
    await userEvent.click(card('Années 80'));
    expect(card('Années 80')).toHaveClass('selected');
    expect(card('Années 80')).toHaveTextContent('…');
    expect(badgeOf('Sons par thème')).toHaveTextContent('calcul des sons…');
    expect(launch()).toBeDisabled();
    await act(async () => resolve(pool(120)));
    expect(card('Années 80')).toHaveTextContent('120 sons');
    expect(badgeOf('Sons par thème')).toHaveTextContent('max 50');
    expect(badgeOf('Thèmes')).toHaveTextContent('1 sélectionné');
    expect(launch()).toBeEnabled();
  });

  it('ne recompte pas un thème en cours de chargement ou déjà compté', async () => {
    loadThemePool.mockReturnValue(new Promise(() => {}));
    getThemePools.mockReturnValue({ pop: pool(80) });
    render(<Create user={user} onProfile={vi.fn()} onStart={vi.fn()} />);
    await userEvent.click(card('Années 80'));
    await userEvent.click(card('Années 80'));
    await userEvent.click(card('Années 80'));
    await userEvent.click(card('Pop'));
    expect(loadThemePool).toHaveBeenCalledOnce();
    expect(card('Pop')).toHaveTextContent('80 sons');
  });

  it('décoche un thème indisponible', async () => {
    loadThemePool.mockRejectedValue(new Error('vide'));
    render(<Create user={user} onProfile={vi.fn()} onStart={vi.fn()} />);
    await userEvent.click(card('Disney FR'));
    await waitFor(() => expect(card('Disney FR')).toHaveTextContent('indispo'));
    expect(card('Disney FR')).not.toHaveClass('selected');
    expect(toast).toHaveBeenCalledWith('⚠️ Disney FR : vide');
  });

  it('limite le curseur au thème le plus petit, avec Min et Max', async () => {
    getThemePools.mockReturnValue({ '80s': pool(120), disney: pool(23) });
    render(<Create user={user} onProfile={vi.fn()} onStart={vi.fn()} />);
    await userEvent.click(card('Années 80'));
    await userEvent.click(screen.getByRole('button', { name: 'Max' }));
    expect(slider()).toHaveValue('50');
    await userEvent.click(card('Disney FR'));
    expect(badgeOf('Sons par thème')).toHaveTextContent('max 23 (🏰 Disney FR)');
    expect(slider()).toHaveValue('23');
    expect(screen.getByText('— 46 sons au total')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Min' }));
    expect(slider()).toHaveValue('2');
    fireEvent.change(slider(), { target: { value: '7' } });
    expect(screen.getByText('7 sons/thème')).toBeInTheDocument();
    expect(badgeOf('Thèmes')).toHaveTextContent('2 sélectionnés');
  });

  it('lance la partie avec les sons construits', async () => {
    getThemePools.mockReturnValue({ '80s': pool(120), pop: pool(80) });
    let finish;
    buildTracks.mockImplementation((ids, perTheme, onProgress) => {
      onProgress('📻 Chargement : Années 80…', 40);
      return new Promise(r => { finish = r; });
    });
    const onStart = vi.fn();
    render(<Create user={user} onProfile={vi.fn()} onStart={onStart} />);
    await userEvent.click(card('Années 80'));
    await userEvent.click(card('Pop'));
    await userEvent.click(launch());
    expect(activate).toHaveBeenCalled();
    expect(buildTracks).toHaveBeenCalledWith(['80s', 'pop'], 5, expect.any(Function), { excluded: new Set(), review: [] });
    expect(screen.getByText('📻 Chargement : Années 80…')).toBeInTheDocument();
    expect(launch()).toBeDisabled();
    await act(async () => finish(pool(10)));
    expect(onStart).toHaveBeenCalledWith(pool(10), '📻 🎵', { gameId: 'g1', timer: 'full', start: 'start', reviewUris: new Set() });
    expect(screen.getByText('Lancement…')).toBeInTheDocument();
  });

  it('signale une partie sans aucun son', async () => {
    getThemePools.mockReturnValue({ '80s': pool(120) });
    buildTracks.mockResolvedValue([]);
    render(<Create user={user} onProfile={vi.fn()} onStart={vi.fn()} />);
    await userEvent.click(card('Années 80'));
    await userEvent.click(launch());
    expect(toast).toHaveBeenCalledWith('Erreur : Aucun son trouvé pour ces thèmes.');
    expect(launch()).toBeEnabled();
    expect(screen.queryByText('Démarrage…')).not.toBeInTheDocument();
  });

  it('avertit les utilisateurs de Firefox', () => {
    state.firefox = true;
    render(<Create user={user} onProfile={vi.fn()} onStart={vi.fn()} />);
    expect(screen.getByText(/Firefox ne peut pas lire l'audio Spotify/)).toBeInTheDocument();
  });

  it('se déconnecte et coupe le lecteur', async () => {
    render(<Create user={user} onProfile={vi.fn()} onStart={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Déco.' }));
    expect(disconnect).toHaveBeenCalled();
    expect(logout).toHaveBeenCalled();
  });

  it('affiche le compte et ouvre le profil', async () => {
    const onProfile = vi.fn();
    render(<Create user={user} onProfile={onProfile} onStart={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Mon profil' })).toHaveTextContent('🎤Mel');
    await userEvent.click(screen.getByRole('button', { name: 'Mon profil' }));
    expect(onProfile).toHaveBeenCalled();
  });

  it('attend l\'historique avant d\'afficher les sons disponibles', async () => {
    let resolve;
    fetchExclusions.mockReturnValue(new Promise(r => { resolve = r; }));
    getThemePools.mockReturnValue({ '80s': pool(120) });
    render(<Create user={user} onProfile={vi.fn()} onStart={vi.fn()} />);
    await userEvent.click(card('Années 80'));
    expect(badgeOf('Sons par thème')).toHaveTextContent('calcul des sons…');
    expect(launch()).toBeDisabled();
    await act(async () => resolve(new Set()));
    expect(card('Années 80')).toHaveTextContent('120 sons');
  });

  it('retire les sons de la partie précédente du nombre disponible', async () => {
    const p = pool(30);
    getThemePools.mockReturnValue({ '80s': p });
    fetchExclusions.mockResolvedValue(new Set(p.slice(0, 25).map(t => t.uri)));
    fetchReview.mockResolvedValue([{ uri: p[0].uri, themeId: '80s' }]);
    render(<Create user={user} onProfile={vi.fn()} onStart={vi.fn()} />);
    await userEvent.click(card('Années 80'));
    expect(card('Années 80')).toHaveTextContent('6 sons');
    expect(badgeOf('Sons par thème')).toHaveTextContent('max 6');
  });

  it('enregistre la partie avec ses options', async () => {
    getThemePools.mockReturnValue({ '80s': pool(120) });
    const review = [{ uri: 'spotify:track:r', themeId: '80s' }];
    fetchReview.mockResolvedValue(review);
    buildTracks.mockResolvedValue(pool(5));
    const onStart = vi.fn();
    render(<Create user={user} onProfile={vi.fn()} onStart={onStart} />);
    await userEvent.click(card('Années 80'));
    await userEvent.click(screen.getByRole('radio', { name: 'Extrait 30 s' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Milieu' }));
    expect(screen.getByRole('radio', { name: 'Milieu' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(launch());
    expect(buildTracks).toHaveBeenCalledWith(['80s'], 5, expect.any(Function), { excluded: new Set(), review });
    expect(createGame).toHaveBeenCalledWith(
      { themes: ['80s'], perTheme: 5, timer: '30s', start: 'middle' },
      expect.arrayContaining([expect.objectContaining({ uri: 'spotify:track:u0', artists: ['A'], themeId: '80s' })]),
      undefined,
    );
    expect(onStart.mock.calls[0][2]).toEqual({ gameId: 'g1', timer: '30s', start: 'middle', reviewUris: new Set(['spotify:track:r']) });
  });

  it('signale l\'échec de l\'enregistrement de la partie', async () => {
    getThemePools.mockReturnValue({ '80s': pool(120) });
    buildTracks.mockResolvedValue(pool(5));
    createGame.mockRejectedValue(new Error('Serveur indisponible'));
    const onStart = vi.fn();
    render(<Create user={user} onProfile={vi.fn()} onStart={onStart} />);
    await userEvent.click(card('Années 80'));
    await userEvent.click(launch());
    expect(toast).toHaveBeenCalledWith('Erreur : Serveur indisponible');
    expect(onStart).not.toHaveBeenCalled();
    expect(launch()).toBeEnabled();
  });

  it('continue sans historique s\'il est indisponible', async () => {
    fetchReview.mockRejectedValue(new Error('down'));
    getThemePools.mockReturnValue({ '80s': pool(12) });
    render(<Create user={user} onProfile={vi.fn()} onStart={vi.fn()} />);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Historique indisponible : la partie précédente ne sera pas exclue'));
    await userEvent.click(card('Années 80'));
    expect(card('Années 80')).toHaveTextContent('12 sons');
  });

  it('ouvre l\'historique et la liste à revoir', async () => {
    const onHistory = vi.fn();
    const onReview = vi.fn();
    render(<Create user={user} onProfile={vi.fn()} onStart={vi.fn()} onHistory={onHistory} onReview={onReview} />);
    await userEvent.click(screen.getByRole('button', { name: '📜 Historique' }));
    await userEvent.click(screen.getByRole('button', { name: '⭐ À revoir' }));
    expect(onHistory).toHaveBeenCalled();
    expect(onReview).toHaveBeenCalled();
  });

  it('propose de rejoindre une partie', async () => {
    const onJoin = vi.fn();
    render(<Create user={user} onProfile={vi.fn()} onStart={vi.fn()} onJoin={onJoin} />);
    await userEvent.click(screen.getByRole('button', { name: '🎮 Rejoindre' }));
    expect(onJoin).toHaveBeenCalled();
  });

  it('affiche le salon de la room et y rattache la partie', async () => {
    getThemePools.mockReturnValue({ '80s': pool(120) });
    buildTracks.mockResolvedValue(pool(5));
    const onCloseRoom = vi.fn();
    render(<Create user={user} onProfile={vi.fn()} onStart={vi.fn()} room={{ id: 'r1', code: 'ABC234' }}
      roomState={{ participants: [1, 2] }} onCloseRoom={onCloseRoom} />);
    await userEvent.click(screen.getByRole('button', { name: 'salon ABC234 2' }));
    expect(onCloseRoom).toHaveBeenCalled();
    await userEvent.click(card('Années 80'));
    await userEvent.click(launch());
    expect(createGame.mock.calls[0][2]).toBe('r1');
  });
});
