import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/http.js';
import { connectRoom, disconnectRoom, getRoomInfo, joinRoom, myParticipant } from '../lib/room.js';
import Join from './Join.jsx';

vi.mock('../lib/room.js', () => ({ getRoomInfo: vi.fn(), joinRoom: vi.fn(), myParticipant: vi.fn(), connectRoom: vi.fn(), disconnectRoom: vi.fn() }));
vi.mock('./PlayerSeat.jsx', () => ({ default: ({ code, participant, onLeave }) => <button onClick={onLeave}>siège {code} {participant.name}</button> }));

beforeEach(() => {
  getRoomInfo.mockResolvedValue({ code: 'ABC234', hostName: 'Mel' });
  joinRoom.mockResolvedValue({ id: 'p1', name: 'Les Rouges' });
  myParticipant.mockResolvedValue(null);
});
afterEach(() => vi.clearAllMocks());

describe('Join', () => {
  it('cherche la room du lien et fait rejoindre un invité', async () => {
    const onLeave = vi.fn();
    render(<Join code="abc234" user={null} onLeave={onLeave} />);
    expect(await screen.findByText('Room de Mel')).toBeInTheDocument();
    expect(getRoomInfo).toHaveBeenCalledWith('abc234');
    expect(screen.queryByRole('button', { name: /mon compte/ })).toBeNull();
    await userEvent.type(screen.getByLabelText('Nom de ton équipe'), 'Les Rouges');
    await userEvent.click(screen.getByRole('button', { name: 'Rejoindre en invité' }));
    expect(joinRoom).toHaveBeenCalledWith('ABC234', 'Les Rouges');
    expect(connectRoom).toHaveBeenCalledWith('ABC234', 'player');
    await userEvent.click(screen.getByRole('button', { name: 'siège ABC234 Les Rouges' }));
    expect(disconnectRoom).toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalled();
  });

  it('fait rejoindre avec son compte', async () => {
    render(<Join code="ABC234" user={{ username: 'Melwin' }} onLeave={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Jouer avec mon compte (Melwin)' }));
    expect(joinRoom).toHaveBeenCalledWith('ABC234', undefined);
  });

  it('cherche une room tapée à la main', async () => {
    render(<Join code="" user={null} onLeave={vi.fn()} />);
    expect(getRoomInfo).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Code de la room'), 'ab c234');
    await userEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(getRoomInfo).toHaveBeenCalledWith('ab c234');
    expect(await screen.findByText('Room de Mel')).toBeInTheDocument();
  });

  it('signale une room tapée à la main introuvable', async () => {
    getRoomInfo.mockRejectedValue(new ApiError(404, 'room_not_found'));
    render(<Join code="" user={null} onLeave={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Code de la room'), 'ZZZZZZ');
    await userEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Room introuvable');
  });

  it('signale une room introuvable', async () => {
    getRoomInfo.mockRejectedValue(new ApiError(404, 'room_not_found'));
    render(<Join code="ZZZZZZ" user={null} onLeave={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Room introuvable');
  });

  it('signale un nom invalide sans quitter le formulaire', async () => {
    joinRoom.mockRejectedValue(new ApiError(400, 'invalid_name'));
    render(<Join code="ABC234" user={null} onLeave={vi.fn()} />);
    await screen.findByText('Room de Mel');
    await userEvent.type(screen.getByLabelText('Nom de ton équipe'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Rejoindre en invité' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nom : 1 à 20 caractères');
    expect(connectRoom).not.toHaveBeenCalled();
  });

  it('revient à l\'accueil', async () => {
    const onLeave = vi.fn();
    render(<Join code="" user={null} onLeave={onLeave} />);
    await userEvent.click(screen.getByRole('button', { name: '← Retour' }));
    expect(onLeave).toHaveBeenCalled();
    expect(disconnectRoom).not.toHaveBeenCalled();
  });

  it('reprend directement sa place après un rechargement de la page', async () => {
    myParticipant.mockResolvedValue({ id: 'p9', name: 'Déjà là' });
    render(<Join code="abc234" user={null} onLeave={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'siège ABC234 Déjà là' })).toBeInTheDocument();
    expect(myParticipant).toHaveBeenCalledWith('ABC234');
    expect(connectRoom).toHaveBeenCalledWith('ABC234', 'player');
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it('reprend sa place après avoir tapé le code et met le lien dans l\'adresse', async () => {
    myParticipant.mockResolvedValue({ id: 'p9', name: 'Déjà là' });
    history.replaceState({}, '', '/r/');
    render(<Join code="" user={null} onLeave={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Code de la room'), 'abc234');
    await userEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByRole('button', { name: 'siège ABC234 Déjà là' })).toBeInTheDocument();
    expect(location.pathname).toBe('/r/ABC234');
  });
});
