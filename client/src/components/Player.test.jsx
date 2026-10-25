import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTrack, pollPosition, previousTrack, seek, seekBy, togglePlay } from '../lib/player.js';
import Player from './Player.jsx';

const store = vi.hoisted(() => ({ snapshot: null, listeners: new Set() }));

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
});
