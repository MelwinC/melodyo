import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Login from './Login.jsx';

describe('Login', () => {
  it('propose la connexion Spotify', () => {
    render(<Login />);
    expect(screen.getByRole('link', { name: 'Se connecter avec Spotify' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('heading', { name: 'Melodyo' })).toBeInTheDocument();
  });
});
