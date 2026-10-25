import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addToReview, fetchReview, getGame } from '../lib/games.js';
import { savedTrack, summary } from '../../test/fixtures.js';
import GameDetail from './GameDetail.jsx';

vi.mock('../lib/games.js', () => ({ getGame: vi.fn(), fetchReview: vi.fn(), addToReview: vi.fn(), removeFromReview: vi.fn() }));
vi.mock('../lib/toast.js', () => ({ toast: vi.fn() }));
afterEach(() => vi.clearAllMocks());

const game = (over = {}) => ({
  ...summary(over),
  tracks: [
    { ...savedTrack(1), fromReview: false, position: 0, played: true },
    { ...savedTrack(2), fromReview: true, position: 1, played: false },
  ],
});

describe('GameDetail', () => {
  it('affiche les réglages et les chansons, et ajoute à la liste à revoir', async () => {
    getGame.mockResolvedValue(game());
    fetchReview.mockResolvedValue([savedTrack(2)]);
    render(<GameDetail gameId="g1" onBack={vi.fn()} />);
    expect(await screen.findByText('Titre 1')).toBeInTheDocument();
    expect(getGame).toHaveBeenCalledWith('g1');
    expect(screen.getByText('Extrait 30 s · Départ au milieu · 5 sons/thème')).toBeInTheDocument();
    expect(screen.getByText('non jouée')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /À revoir/ });
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(buttons[0]);
    expect(addToReview).toHaveBeenCalledWith(savedTrack(1));
  });

  it('décrit une partie en chanson entière depuis le début', async () => {
    getGame.mockResolvedValue(game({ settings: { themes: ['pop'], perTheme: 3, timer: 'full', start: 'start' } }));
    fetchReview.mockResolvedValue([]);
    render(<GameDetail gameId="g1" onBack={vi.fn()} />);
    expect(await screen.findByText('Chanson entière · Départ au début · 3 sons/thème')).toBeInTheDocument();
  });

  it('signale une partie introuvable', async () => {
    getGame.mockRejectedValue(new Error('404'));
    fetchReview.mockResolvedValue([]);
    const onBack = vi.fn();
    render(<GameDetail gameId="g1" onBack={onBack} />);
    expect(await screen.findByText('Partie introuvable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '← Retour' }));
    expect(onBack).toHaveBeenCalled();
  });
});
