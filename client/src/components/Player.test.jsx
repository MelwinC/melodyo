import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTrack, pollPosition, previousTrack, seek, seekBy, togglePlay } from '../lib/player.js';
import { addToReview } from '../lib/games.js';
import { sendRoom } from '../lib/room.js';
import Player from './Player.jsx';

const store = vi.hoisted(() => ({ snapshot: null, listeners: new Set() }));

vi.mock('../lib/games.js', () => ({ addToReview: vi.fn(), removeFromReview: vi.fn() }));
vi.mock('../lib/room.js', () => ({ sendRoom: vi.fn() }));
vi.mock('../lib/toast.js', () => ({ toast: vi.fn() }));
vi.mock('../lib/player.js', () => ({
  subscribePlayer: fn => { store.listeners.add(fn); return () => store.listeners.delete(fn); },
  getPlayerSnapshot: () => store.snapshot,
  pollPosition: vi.fn(), togglePlay: vi.fn(), nextTrack: vi.fn(), previousTrack: vi.fn(), seek: vi.fn(), seekBy: vi.fn(),
}));

const sdkTrack = (uri, extra = {}) => ({
  uri, name: `Titre ${uri}`, artists: [{ name: 'A1' }, { name: 'A2' }], album: { images: [{ url: `https://i.scdn.co/${uri}` }] }, ...extra,
});

function setSnapshot(patch) {
  act(() => {
    store.snapshot = { ...store.snapshot, ...patch };
    store.listeners.forEach(fn => fn());
  });
}

const ready = props => render(<Player title="📻" status="ready" onExit={vi.fn()} onBack={vi.fn()} {...props} />);
const cover = () => document.querySelector('.album-cover');
const reveal = () => screen.queryByRole('button', { name: /Révéler/ });

beforeEach(() => {
  store.listeners.clear();
  store.snapshot = { paused: true, position: 30000, duration: 120000, sdkTrack: sdkTrack('a'), index: 2, total: 20, theme: { id: '80s', label: 'Années 80' } };
});
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

describe('Player', () => {
  it('affiche le chargement', () => {
    render(<Player title="T" status="loading" loadingText="Connexion au lecteur Spotify…" />);
    expect(screen.getByText('Connexion au lecteur Spotify…')).toBeInTheDocument();
  });

  it('affiche une erreur avec un retour', async () => {
    const onBack = vi.fn();
    render(<Player title="T" status="error" error="Spotify Premium requis" onBack={onBack} />);
    expect(screen.getByText('Spotify Premium requis')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '← Retour' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('quitte la partie', async () => {
    const onExit = vi.fn();
    ready({ onExit });
    await userEvent.click(screen.getByRole('button', { name: '← Quitter' }));
    expect(onExit).toHaveBeenCalled();
  });

  it('cache la réponse jusqu\'à la révélation', async () => {
    ready();
    expect(screen.getByText('3 / 20')).toBeInTheDocument();
    expect(cover()).toHaveClass('blur');
    expect(cover().style.backgroundImage).toContain('https://i.scdn.co/a');
    expect(screen.queryByText('Titre a')).not.toBeInTheDocument();
    await userEvent.click(reveal());
    expect(cover()).not.toHaveClass('blur');
    expect(screen.getByText('Titre a')).toBeInTheDocument();
    expect(screen.getByText('A1, A2')).toBeInTheDocument();
    expect(reveal()).not.toBeInTheDocument();
    expect(document.querySelector('.album-counter')).toHaveClass('hide');
  });

  it('masque à nouveau la réponse et l\'indice au son suivant', async () => {
    ready();
    await userEvent.click(reveal());
    await userEvent.click(screen.getByRole('button', { name: /Indice/ }));
    setSnapshot({ sdkTrack: sdkTrack('b'), index: 3 });
    expect(cover()).toHaveClass('blur');
    expect(reveal()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Indice/ })).toBeInTheDocument();
  });

  it('montre le thème en indice', async () => {
    ready();
    await userEvent.click(screen.getByRole('button', { name: /Indice/ }));
    expect(screen.getByText('📻 Années 80')).toBeInTheDocument();
  });

  it('utilise une ampoule pour un thème inconnu', async () => {
    store.snapshot.theme = { id: 'inconnu', label: 'Autre' };
    ready();
    await userEvent.click(screen.getByRole('button', { name: /Indice/ }));
    expect(screen.getByText('💡 Autre')).toBeInTheDocument();
  });

  it('garde le bouton d\'indice sans thème connu', async () => {
    store.snapshot.theme = null;
    ready();
    await userEvent.click(screen.getByRole('button', { name: /Indice/ }));
    expect(screen.getByRole('button', { name: /Indice/ })).toBeInTheDocument();
  });

  it('pilote la lecture', async () => {
    ready();
    await userEvent.click(screen.getByRole('button', { name: '▶' }));
    await userEvent.click(screen.getByRole('button', { name: '-10s' }));
    await userEvent.click(screen.getByRole('button', { name: '+10s' }));
    expect(togglePlay).toHaveBeenCalled();
    expect(seekBy).toHaveBeenCalledWith(-10000);
    expect(seekBy).toHaveBeenCalledWith(10000);
    setSnapshot({ paused: false });
    expect(screen.getByRole('button', { name: '⏸' })).toBeInTheDocument();
  });

  it.each([['⏭', nextTrack], ['⏮', previousTrack]])('%s re-masque la réponse et change de son', async (label, action) => {
    ready();
    await userEvent.click(reveal());
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(action).toHaveBeenCalled();
    expect(cover()).toHaveClass('blur');
  });

  it('se positionne en cliquant sur la timeline', () => {
    ready();
    const timeline = document.querySelector('.timeline');
    timeline.getBoundingClientRect = () => ({ left: 100, width: 200 });
    fireEvent.click(timeline, { clientX: 150 });
    expect(seek).toHaveBeenCalledWith(30000);
    fireEvent.click(timeline, { clientX: 999 });
    expect(seek).toHaveBeenLastCalledWith(120000);
    expect(document.querySelector('.timeline-fill').style.width).toBe('25%');
    expect(screen.getByText('0:30')).toBeInTheDocument();
    expect(screen.getByText('2:00')).toBeInTheDocument();
  });

  it('ignore la timeline tant que la durée est inconnue', () => {
    store.snapshot = { ...store.snapshot, duration: 0, total: 0, sdkTrack: null };
    ready();
    fireEvent.click(document.querySelector('.timeline'), { clientX: 10 });
    expect(seek).not.toHaveBeenCalled();
    expect(document.querySelector('.timeline-fill').style.width).toBe('0%');
    expect(screen.getByText('3 / ?')).toBeInTheDocument();
    expect(cover().style.backgroundImage).toBe('');
  });

  it('affiche un tiret si la réponse est révélée sans son', async () => {
    store.snapshot = { ...store.snapshot, sdkTrack: null };
    ready();
    await userEvent.click(reveal());
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('interroge la position toutes les 500 ms pendant la partie', () => {
    vi.useFakeTimers();
    const { unmount } = ready();
    vi.advanceTimersByTime(1000);
    expect(pollPosition).toHaveBeenCalledTimes(2);
    unmount();
    vi.advanceTimersByTime(1000);
    expect(pollPosition).toHaveBeenCalledTimes(2);
  });

  it('affiche le décompte de l\'extrait de 30 s', () => {
    store.snapshot = { ...store.snapshot, timer: '30s', remaining: 12400 };
    ready();
    expect(screen.getByText('0:13')).toHaveClass('extract-timer');
  });

  it('n\'affiche pas de décompte en mode chanson entière', () => {
    store.snapshot = { ...store.snapshot, timer: 'full', remaining: null };
    ready();
    expect(document.querySelector('.extract-timer')).toBeNull();
  });

  it('remplace la pochette à chaque chanson pour qu\'elle n\'apparaisse jamais nette', async () => {
    ready();
    await userEvent.click(reveal());
    const before = cover();
    setSnapshot({ sdkTrack: sdkTrack('b'), index: 3 });
    expect(cover()).not.toBe(before);
    expect(cover()).toHaveClass('blur');
  });

  it('ajoute la chanson révélée à la liste à revoir', async () => {
    const tracks = [0, 1, 2].map(i => ({ ...sdkTrack(`q${i}`), _themeId: '80s' }));
    ready({ tracks, reviewUris: new Set(['spotify:track:dejà']) });
    expect(screen.queryByRole('button', { name: /À revoir/ })).toBeNull();
    await userEvent.click(reveal());
    const button = screen.getByRole('button', { name: '⭐ À revoir' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    expect(addToReview).toHaveBeenCalledWith({ uri: 'q2', name: 'Titre q2', artists: ['A1', 'A2'], albumImage: 'https://i.scdn.co/q2', themeId: '80s' });
    expect(screen.getByRole('button', { name: '✓ À revoir' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('affiche le nombre de réponses et le temps restant de la manche', () => {
    const round = { position: 2, status: 'open', remainingMs: 65000, paused: false };
    const room = { state: { round, participants: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], answered: ['a'] }, receivedAt: Date.now() };
    const { rerender } = ready({ room });
    expect(screen.getByText('1/3 ont répondu')).toBeInTheDocument();
    expect(screen.getByText('⏱ 1:05')).toBeInTheDocument();
    rerender(<Player title="📻" status="ready" onExit={vi.fn()} onBack={vi.fn()} room={{ ...room, state: { ...room.state, round: { ...round, status: 'closed' } } }} />);
    expect(screen.getByText('Réponses verrouillées')).toBeInTheDocument();
  });

  it('n\'affiche rien de la room sans participant ni manche', () => {
    ready({ room: { state: { round: null, participants: [], answered: [] }, receivedAt: 0 } });
    expect(screen.queryByText(/ont répondu/)).toBeNull();
    ready({ room: { state: { round: { status: 'open', remainingMs: 1, paused: false }, participants: [], answered: [] }, receivedAt: 0 } });
    expect(screen.queryByText(/ont répondu/)).toBeNull();
  });

  describe('correction', () => {
    const participants = [{ id: 'a', name: 'Les Rouges', avatar: { kind: 'preset', value: 'note' } }];
    const roomOf = (over = {}) => ({
      receivedAt: Date.now(),
      state: {
        participants, answered: [], phase: 'playing', revealed: [], answers: [{ participantId: 'a', title: 'T', artist: '', titleOk: null, artistOk: null }],
        game: { id: 'g', total: 20, correction: 'live' },
        round: { position: 2, status: 'closed', remainingMs: 0, paused: false },
        correction: { position: 2 },
        ...over,
      },
    });

    it('à la volée : corrige la chanson fermée, révèle aux joueurs et propose le classement', async () => {
      ready({ room: roomOf() });
      await userEvent.click(screen.getByRole('button', { name: 'Titre correct' }));
      expect(sendRoom).toHaveBeenCalledWith({ type: 'correct', position: 2, participantId: 'a', field: 'title', ok: true });
      await userEvent.click(screen.getAllByRole('button', { name: '👁 Révéler' })[0]);
      expect(sendRoom).toHaveBeenCalledWith({ type: 'reveal', position: 2 });
      expect(cover()).not.toHaveClass('blur');
      await userEvent.click(screen.getByRole('button', { name: '🏆 Classement' }));
      expect(sendRoom).toHaveBeenLastCalledWith({ type: 'game:final' });
    });

    it('révèle localement sans prévenir le serveur quand la manche est encore ouverte', async () => {
      ready({ room: roomOf({ correction: null, round: { position: 2, status: 'open', remainingMs: 1000, paused: false } }) });
      await userEvent.click(reveal());
      expect(sendRoom).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'reveal' }));
    });

    it('révèle depuis le panneau une chanson qui n\'est plus celle jouée', async () => {
      store.snapshot = { ...store.snapshot, index: 3 };
      ready({ room: roomOf() });
      await userEvent.click(screen.getAllByRole('button', { name: '👁 Révéler' }).at(-1));
      expect(sendRoom).toHaveBeenCalledWith({ type: 'reveal', position: 2 });
      expect(cover()).toHaveClass('blur');
    });

    it('à la fin : propose de lancer la correction', async () => {
      ready({ room: roomOf({ game: { id: 'g', total: 20, correction: 'end' }, correction: null }) });
      expect(screen.queryByRole('button', { name: 'Titre correct' })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: '✅ Corriger les réponses' }));
      expect(sendRoom).toHaveBeenCalledWith({ type: 'correction:start' });
    });
  });
});
