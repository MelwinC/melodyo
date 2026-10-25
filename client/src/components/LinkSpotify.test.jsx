import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logout } from '../lib/session.js';
import LinkSpotify from './LinkSpotify.jsx';

vi.mock('../lib/session.js', () => ({ logout: vi.fn() }));
afterEach(() => vi.clearAllMocks());

const user = { username: 'Mel', avatar: { kind: 'preset', value: 'micro' } };

describe('LinkSpotify', () => {
  it('propose de relier Spotify', () => {
    render(<LinkSpotify user={user} />);
    expect(screen.getByText('Mel')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Relier mon compte Spotify' })).toHaveAttribute('href', '/api/spotify/connect');
    expect(screen.getByText(/Premium/)).toBeInTheDocument();
  });

  it('permet de se déconnecter', async () => {
    render(<LinkSpotify user={user} />);
    await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(logout).toHaveBeenCalled();
  });

  it('propose de rejoindre une partie', async () => {
    const onJoin = vi.fn();
    render(<LinkSpotify user={user} onJoin={onJoin} />);
    await userEvent.click(screen.getByRole('button', { name: '🎮 Rejoindre une partie' }));
    expect(onJoin).toHaveBeenCalled();
  });
});
