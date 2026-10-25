import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTracks, getThemeCounts, loadThemePool } from '../lib/tracks.js';
import { activate, disconnect, ensurePlayer } from '../lib/player.js';
import { toast } from '../lib/toast.js';
import Create from './Create.jsx';

const state = vi.hoisted(() => ({ firefox: false }));

vi.mock('../lib/tracks.js', () => ({ buildTracks: vi.fn(), getThemeCounts: vi.fn(), loadThemePool: vi.fn() }));
vi.mock('../lib/toast.js', () => ({ toast: vi.fn() }));
vi.mock('../lib/player.js', () => ({
  activate: vi.fn(), disconnect: vi.fn(), ensurePlayer: vi.fn(),
  get isFirefox() { return state.firefox; },
}));

const pool = n => Array.from({ length: n }, (_, i) => ({ uri: `u${i}` }));
const card = label => screen.getByText(label).closest('label');
const badgeOf = text => screen.getByText(text).closest('label').querySelector('.badge');
const launch = () => screen.getByRole('button', { name: /Lancer la partie/ });
const slider = () => screen.getByRole('slider');

beforeEach(() => {
  getThemeCounts.mockReturnValue({});
  ensurePlayer.mockResolvedValue();
  state.firefox = false;
});
afterEach(() => vi.clearAllMocks());

describe('Create', () => {
  it('prépare le lecteur et ignore son échec', async () => {
    ensurePlayer.mockRejectedValue(new Error('x'));
    render(<Create onStart={vi.fn()} />);
    await waitFor(() => expect(ensurePlayer).toHaveBeenCalled());
  });

  it('compte les sons d\'un thème coché', async () => {
    let resolve;
    loadThemePool.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<Create onStart={vi.fn()} />);
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
    getThemeCounts.mockReturnValue({ pop: 80 });
    render(<Create onStart={vi.fn()} />);
    await userEvent.click(card('Années 80'));
    await userEvent.click(card('Années 80'));
    await userEvent.click(card('Années 80'));
    await userEvent.click(card('Pop'));
    expect(loadThemePool).toHaveBeenCalledOnce();
    expect(card('Pop')).toHaveTextContent('80 sons');
  });

  it('décoche un thème indisponible', async () => {
    loadThemePool.mockRejectedValue(new Error('vide'));
    render(<Create onStart={vi.fn()} />);
    await userEvent.click(card('Disney FR'));
    await waitFor(() => expect(card('Disney FR')).toHaveTextContent('indispo'));
    expect(card('Disney FR')).not.toHaveClass('selected');
    expect(toast).toHaveBeenCalledWith('⚠️ Disney FR : vide');
  });

  it('limite le curseur au thème le plus petit, avec Min et Max', async () => {
    getThemeCounts.mockReturnValue({ '80s': 120, disney: 23 });
    render(<Create onStart={vi.fn()} />);
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
    getThemeCounts.mockReturnValue({ '80s': 120, pop: 80 });
    let finish;
    buildTracks.mockImplementation((ids, perTheme, onProgress) => {
      onProgress('📻 Chargement : Années 80…', 40);
      return new Promise(r => { finish = r; });
    });
    const onStart = vi.fn();
    render(<Create onStart={onStart} />);
    await userEvent.click(card('Années 80'));
    await userEvent.click(card('Pop'));
    await userEvent.click(launch());
    expect(activate).toHaveBeenCalled();
    expect(buildTracks).toHaveBeenCalledWith(['80s', 'pop'], 5, expect.any(Function));
    expect(screen.getByText('📻 Chargement : Années 80…')).toBeInTheDocument();
    expect(launch()).toBeDisabled();
    await act(async () => finish(pool(10)));
    expect(onStart).toHaveBeenCalledWith(pool(10), '📻 🎵');
    expect(screen.getByText('Lancement…')).toBeInTheDocument();
  });

  it('signale une partie sans aucun son', async () => {
    getThemeCounts.mockReturnValue({ '80s': 120 });
    buildTracks.mockResolvedValue([]);
    render(<Create onStart={vi.fn()} />);
    await userEvent.click(card('Années 80'));
    await userEvent.click(launch());
    expect(toast).toHaveBeenCalledWith('Erreur : Aucun son trouvé pour ces thèmes.');
    expect(launch()).toBeEnabled();
    expect(screen.queryByText('Démarrage…')).not.toBeInTheDocument();
  });

  it('avertit les utilisateurs de Firefox', () => {
    state.firefox = true;
    render(<Create onStart={vi.fn()} />);
    expect(screen.getByText(/Firefox ne peut pas lire l'audio Spotify/)).toBeInTheDocument();
  });

  it('déconnecte et recharge la page', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    localStorage.setItem('bt_token', 't');
    render(<Create onStart={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Déco.' }));
    expect(disconnect).toHaveBeenCalled();
    expect(localStorage.getItem('bt_token')).toBeNull();
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
