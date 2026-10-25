import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendRoom } from '../lib/room.js';
import PlayerSeat from './PlayerSeat.jsx';

const store = vi.hoisted(() => ({ snapshot: null, listeners: new Set() }));
vi.mock('../lib/room.js', () => ({
  sendRoom: vi.fn(),
  getRoomState: () => store.snapshot,
  subscribeRoom: fn => { store.listeners.add(fn); return () => store.listeners.delete(fn); },
}));

const participant = { id: 'p1', name: 'Les Rouges' };
const others = [{ id: 'p1', name: 'Les Rouges', avatar: { kind: 'preset', value: 'note' }, connected: true }, { id: 'p2', name: 'Les Bleus', avatar: { kind: 'preset', value: 'micro' }, connected: true }];
const game = { id: 'g1', total: 20, timer: '30s' };
const open = (over = {}) => ({ position: 3, status: 'open', remainingMs: 42000, paused: false, ...over });

function live(state, extra = {}) {
  return { connected: true, error: null, lastAck: null, receivedAt: Date.now(), state: { participants: others, game: null, round: null, you: { id: 'p1', answer: null }, ...state }, ...extra };
}

function setLive(next) {
  act(() => {
    store.snapshot = next;
    store.listeners.forEach(fn => fn());
  });
}

const seat = (onLeave = vi.fn()) => render(<PlayerSeat code="ABC234" participant={participant} onLeave={onLeave} />);
const title = () => screen.getByLabelText('Titre');
const artist = () => screen.getByLabelText('Artiste');

beforeEach(() => { store.listeners.clear(); store.snapshot = live({}); });
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

describe('PlayerSeat', () => {
  it('attend le lancement en montrant les participants', async () => {
    const onLeave = vi.fn();
    seat(onLeave);
    expect(screen.getByText('ABC234')).toBeInTheDocument();
    expect(screen.getByText('En attente du lancement…')).toBeInTheDocument();
    expect(screen.getByText('Les Bleus')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quitter' }));
    expect(onLeave).toHaveBeenCalled();
  });

  it('grise un participant hors ligne', () => {
    store.snapshot = live({ participants: [{ ...others[1], connected: false }] });
    seat();
    expect(screen.getByText('Les Bleus').closest('li')).toHaveClass('offline');
  });

  it('ne confirme pas une réponse vide', () => {
    store.snapshot = live({ game, round: open(), you: { id: 'p1', answer: { title: '', artist: '' } } });
    seat();
    expect(screen.queryByText('Enregistré ✓')).toBeNull();
  });

  it('annonce le début de la partie', () => {
    store.snapshot = live({ game });
    seat();
    expect(screen.getByText('La partie commence…')).toBeInTheDocument();
  });

  it('envoie la réponse 400 ms après la dernière frappe, une seule fois', () => {
    vi.useFakeTimers();
    store.snapshot = live({ game, round: open() });
    seat();
    expect(screen.getByText('Son 4/20')).toBeInTheDocument();
    expect(screen.getByText('0:42')).toBeInTheDocument();
    fireEvent.change(title(), { target: { value: 'Take' } });
    fireEvent.change(title(), { target: { value: 'Take On Me' } });
    act(() => vi.advanceTimersByTime(399));
    expect(sendRoom).not.toHaveBeenCalled();
    fireEvent.change(artist(), { target: { value: 'a-ha' } });
    act(() => vi.advanceTimersByTime(400));
    expect(sendRoom).toHaveBeenCalledOnce();
    expect(sendRoom).toHaveBeenCalledWith({ type: 'answer', position: 3, title: 'Take On Me', artist: 'a-ha' });
  });

  it('confirme une réponse enregistrée par le serveur', () => {
    store.snapshot = live({ game, round: open(), you: { id: 'p1', answer: { title: 'Take On Me', artist: '' } } });
    seat();
    expect(title()).toHaveValue('Take On Me');
    expect(screen.getByText('Enregistré ✓')).toBeInTheDocument();
    fireEvent.change(title(), { target: { value: 'Take On Me!' } });
    expect(screen.queryByText('Enregistré ✓')).toBeNull();
  });

  it('verrouille les réponses à la fin de la manche', () => {
    store.snapshot = live({ game, round: open({ status: 'closed', remainingMs: 0 }), you: { id: 'p1', answer: { title: 'Mon titre', artist: '' } } });
    seat();
    expect(screen.getByText('Réponses verrouillées')).toBeInTheDocument();
    expect(title()).toBeDisabled();
    expect(title()).toHaveValue('Mon titre');
  });

  it('ne reste pas verrouillé par un vieil accusé quand la manche est rouverte', () => {
    store.snapshot = live({ game, round: open() }, { lastAck: { type: 'answer:ack', position: 3, status: 'closed' } });
    seat();
    expect(screen.queryByText('Réponses verrouillées')).toBeNull();
    expect(title()).toBeEnabled();
  });

  it('renvoie la réponse si le serveur ne l\'a pas reçue (téléphone qui se réveille)', () => {
    vi.useFakeTimers();
    store.snapshot = live({ game, round: open() });
    seat();
    fireEvent.change(title(), { target: { value: 'Perdue' } });
    act(() => vi.advanceTimersByTime(400));
    expect(sendRoom).toHaveBeenCalledOnce();
    setLive(live({ game, round: open(), you: { id: 'p1', answer: null } }, { receivedAt: Date.now() + 1 }));
    expect(sendRoom).toHaveBeenCalledTimes(2);
    expect(sendRoom).toHaveBeenLastCalledWith({ type: 'answer', position: 3, title: 'Perdue', artist: '' });
    setLive(live({ game, round: open(), you: { id: 'p1', answer: { title: 'Perdue', artist: '' } } }, { receivedAt: Date.now() + 2 }));
    expect(sendRoom).toHaveBeenCalledTimes(2);
  });

  it('n\'envoie rien de plus pendant la frappe', () => {
    vi.useFakeTimers();
    store.snapshot = live({ game, round: open() });
    seat();
    fireEvent.change(title(), { target: { value: 'En cours' } });
    setLive(live({ game, round: open() }, { receivedAt: Date.now() + 1 }));
    expect(sendRoom).not.toHaveBeenCalled();
  });

  it('fige le décompte pendant la pause', () => {
    store.snapshot = live({ game, round: open({ paused: true }) });
    seat();
    expect(screen.getByText('En pause')).toBeInTheDocument();
  });

  it('reprend la réponse déjà saisie à la chanson suivante ou après reconnexion', () => {
    store.snapshot = live({ game, round: open() });
    seat();
    fireEvent.change(title(), { target: { value: 'brouillon' } });
    setLive(live({ game, round: open({ position: 4 }), you: { id: 'p1', answer: null } }));
    expect(title()).toHaveValue('');
    setLive(live({ game, round: open({ position: 3 }), you: { id: 'p1', answer: { title: 'Gardée', artist: 'A' } } }));
    expect(title()).toHaveValue('Gardée');
    expect(artist()).toHaveValue('A');
  });

  it('signale la reconnexion et l\'exclusion de la room', () => {
    store.snapshot = { ...live({}), connected: false };
    const { unmount } = seat();
    expect(screen.getByText('Reconnexion…')).toBeInTheDocument();
    unmount();
    store.snapshot = { ...live({}), connected: false, error: 'forbidden', state: null };
    seat();
    expect(screen.getByText('Tu ne fais plus partie de cette room')).toBeInTheDocument();
  });

  it('annule l\'envoi en attente en quittant', () => {
    vi.useFakeTimers();
    store.snapshot = live({ game, round: open() });
    const { unmount } = seat();
    fireEvent.change(title(), { target: { value: 'x' } });
    unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(sendRoom).not.toHaveBeenCalled();
  });
});
