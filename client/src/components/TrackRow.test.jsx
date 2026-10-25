import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { savedTrack } from '../../test/fixtures.js';
import TrackRow from './TrackRow.jsx';

describe('TrackRow', () => {
  it('affiche la chanson et son action', async () => {
    const onAction = vi.fn();
    render(<TrackRow track={savedTrack(1)} actionLabel="Retirer" onAction={onAction} />);
    expect(screen.getByText('Titre 1')).toBeInTheDocument();
    expect(screen.getByText('Artiste 1, Feat')).toBeInTheDocument();
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://i.scdn.co/1');
    await userEvent.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(onAction).toHaveBeenCalled();
  });

  it('grise une chanson non jouée et affiche un emplacement sans pochette', () => {
    const { container } = render(<TrackRow track={savedTrack(2, { albumImage: null })} played={false} actionLabel="x" onAction={vi.fn()} actionPressed />);
    expect(container.firstChild).toHaveClass('unplayed');
    expect(screen.getByText('non jouée')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'x' })).toHaveAttribute('aria-pressed', 'true');
  });
});
