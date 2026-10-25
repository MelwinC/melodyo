import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/http.js';
import { choosePreset, uploadAvatar } from '../lib/session.js';
import { toast } from '../lib/toast.js';
import Profile from './Profile.jsx';

vi.mock('../lib/session.js', async importOriginal => ({ ...(await importOriginal()), choosePreset: vi.fn(), uploadAvatar: vi.fn() }));
vi.mock('../lib/toast.js', () => ({ toast: vi.fn() }));
vi.mock('./Stats.jsx', () => ({ default: () => <p>statistiques du compte</p> }));
afterEach(() => vi.clearAllMocks());

const user = { username: 'Mel', avatar: { kind: 'preset', value: 'note' } };
const fileInput = () => document.querySelector('input[type="file"]');

describe('Profile', () => {
  it('affiche le compte et revient en arrière', async () => {
    const onBack = vi.fn();
    render(<Profile user={user} onBack={onBack} />);
    expect(screen.getByRole('heading', { name: 'Mon profil' })).toBeInTheDocument();
    expect(screen.getByText('Mel')).toBeInTheDocument();
    expect(screen.getByText('statistiques du compte')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'note' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(11);
    await userEvent.click(screen.getByRole('button', { name: '← Retour' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('choisit un avatar proposé', async () => {
    choosePreset.mockResolvedValue();
    render(<Profile user={user} onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'guitare' }));
    expect(choosePreset).toHaveBeenCalledWith('guitare');
    expect(toast).toHaveBeenCalledWith('Avatar mis à jour');
  });

  it('signale l\'échec du choix', async () => {
    choosePreset.mockRejectedValue(new ApiError(500, 'server_error'));
    render(<Profile user={user} onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'micro' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Une erreur est survenue'));
  });

  it('envoie une image', async () => {
    uploadAvatar.mockResolvedValue();
    render(<Profile user={user} onBack={vi.fn()} />);
    expect(fileInput()).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
    const file = new File(['x'], 'moi.png', { type: 'image/png' });
    await userEvent.upload(fileInput(), file);
    expect(uploadAvatar).toHaveBeenCalledWith(file);
    expect(toast).toHaveBeenCalledWith('Avatar mis à jour');
    expect(fileInput().value).toBe('');
  });

  it('signale une image refusée', async () => {
    uploadAvatar.mockRejectedValue(new ApiError(400, 'invalid_image'));
    render(<Profile user={user} onBack={vi.fn()} />);
    await userEvent.upload(fileInput(), new File(['x'], 'x.png', { type: 'image/png' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Image illisible (PNG, JPEG ou WebP)'));
  });

  it('ignore une sélection vide', () => {
    render(<Profile user={user} onBack={vi.fn()} />);
    fireEvent.change(fileInput(), { target: { files: [] } });
    expect(uploadAvatar).not.toHaveBeenCalled();
  });
});
