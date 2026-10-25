import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/http.js';
import { login, register } from '../lib/session.js';
import Auth from './Auth.jsx';

vi.mock('../lib/session.js', async importOriginal => ({ ...(await importOriginal()), login: vi.fn(), register: vi.fn() }));

afterEach(() => vi.clearAllMocks());

async function fill(username, password) {
  await userEvent.type(screen.getByLabelText('Pseudo'), username);
  await userEvent.type(screen.getByLabelText('Mot de passe'), password);
}

describe('Auth', () => {
  it('connecte un compte existant', async () => {
    login.mockResolvedValue();
    render(<Auth />);
    await fill('Mel', 'motdepasse');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(login).toHaveBeenCalledWith('Mel', 'motdepasse');
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('crée un compte', async () => {
    register.mockResolvedValue();
    render(<Auth />);
    await userEvent.click(screen.getByRole('tab', { name: 'Créer un compte' }));
    expect(screen.getByRole('tab', { name: 'Créer un compte' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/3 à 20 caractères/)).toBeInTheDocument();
    await fill('Nouveau', 'motdepasse');
    await userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect(register).toHaveBeenCalledWith('Nouveau', 'motdepasse');
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('affiche l\'erreur en français et l\'efface en changeant d\'onglet', async () => {
    login.mockRejectedValue(new ApiError(401, 'invalid_credentials'));
    render(<Auth />);
    await fill('Mel', 'mauvaismdp');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pseudo ou mot de passe incorrect');
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeEnabled();
    await userEvent.click(screen.getByRole('tab', { name: 'Créer un compte' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Connexion' }));
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  });

  it('désactive le bouton pendant l\'envoi', async () => {
    login.mockReturnValue(new Promise(() => {}));
    render(<Auth />);
    await fill('Mel', 'motdepasse');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeDisabled();
  });
});
