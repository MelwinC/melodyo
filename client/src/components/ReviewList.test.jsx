import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchReview, removeFromReview } from '../lib/games.js';
import { toast } from '../lib/toast.js';
import { savedTrack } from '../../test/fixtures.js';
import ReviewList from './ReviewList.jsx';

vi.mock('../lib/games.js', () => ({ fetchReview: vi.fn(), removeFromReview: vi.fn() }));
vi.mock('../lib/toast.js', () => ({ toast: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('ReviewList', () => {
  it('liste les chansons et en retire une', async () => {
    fetchReview.mockResolvedValue([savedTrack(1), savedTrack(2)]);
    render(<ReviewList onBack={vi.fn()} />);
    expect(await screen.findByText('Titre 1')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Retirer' })[0]);
    expect(removeFromReview).toHaveBeenCalledWith('spotify:track:t1');
    expect(screen.queryByText('Titre 1')).not.toBeInTheDocument();
    expect(screen.getByText('Titre 2')).toBeInTheDocument();
  });

  it('signale l\'échec du retrait', async () => {
    fetchReview.mockResolvedValue([savedTrack(1)]);
    removeFromReview.mockRejectedValue(new Error('down'));
    render(<ReviewList onBack={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Une erreur est survenue'));
    expect(screen.getByText('Titre 1')).toBeInTheDocument();
  });

  it('affiche une liste vide ou une erreur', async () => {
    fetchReview.mockResolvedValue([]);
    const { unmount } = render(<ReviewList onBack={vi.fn()} />);
    expect(await screen.findByText('Aucune chanson à revoir')).toBeInTheDocument();
    unmount();
    fetchReview.mockRejectedValue(new Error('down'));
    const onBack = vi.fn();
    render(<ReviewList onBack={onBack} />);
    expect(await screen.findByText('Impossible de charger la liste')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '← Retour' }));
    expect(onBack).toHaveBeenCalled();
  });
});
