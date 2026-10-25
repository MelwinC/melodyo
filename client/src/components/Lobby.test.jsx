import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from '../lib/toast.js';
import Lobby from './Lobby.jsx';

vi.mock('./QrCode.jsx', () => ({ default: ({ text }) => <img alt="QR code" data-text={text} /> }));
vi.mock('../lib/toast.js', () => ({ toast: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

const room = { id: 'r1', code: 'ABC234' };
const state = {
  participants: [
    { id: 'p1', name: 'Les Rouges', avatar: { kind: 'preset', value: 'micro' }, connected: true },
    { id: 'p2', name: 'Les Bleus', avatar: { kind: 'preset', value: 'note' }, connected: false },
  ],
};

describe('Lobby', () => {
  it('affiche le code, le QR code du lien et les participants', () => {
    render(<Lobby room={room} state={state} onClose={vi.fn()} />);
    expect(screen.getByText('ABC234')).toBeInTheDocument();
    expect(screen.getByAltText('QR code')).toHaveAttribute('data-text', `${location.origin}/r/ABC234`);
    expect(screen.getByText('Les Rouges').closest('li')).not.toHaveClass('offline');
    expect(screen.getByText('Les Bleus').closest('li')).toHaveClass('offline');
    expect(screen.getByText('2 participants')).toBeInTheDocument();
  });

  it('accorde au singulier', () => {
    render(<Lobby room={room} state={{ participants: state.participants.slice(0, 1) }} onClose={vi.fn()} />);
    expect(screen.getByText('1 participant')).toBeInTheDocument();
  });

  it('invite à rejoindre tant que personne n\'est là', () => {
    render(<Lobby room={room} state={null} onClose={vi.fn()} />);
    expect(screen.getByText('En attente des participants…')).toBeInTheDocument();
  });

  it('copie le lien', async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<Lobby room={room} state={state} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copier le lien' }));
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/r/ABC234`);
    expect(toast).toHaveBeenCalledWith('Lien copié');
  });

  it('signale l\'échec de la copie', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) } });
    render(<Lobby room={room} state={state} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copier le lien' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(`Copie impossible : ${location.origin}/r/ABC234`));
  });

  it('ferme la room', async () => {
    const onClose = vi.fn();
    render(<Lobby room={room} state={state} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fermer la room' }));
    expect(onClose).toHaveBeenCalled();
  });
});
