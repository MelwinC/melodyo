import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeRoom, connectRoom, disconnectRoom, openRoom } from '../lib/room.js';
import { toast } from '../lib/toast.js';
import { useHostRoom } from './useHostRoom.js';

const store = vi.hoisted(() => ({ snapshot: { connected: false, state: null }, listeners: new Set() }));
vi.mock('../lib/room.js', () => ({
  openRoom: vi.fn(), closeRoom: vi.fn(), connectRoom: vi.fn(), disconnectRoom: vi.fn(),
  getRoomState: () => store.snapshot,
  subscribeRoom: fn => { store.listeners.add(fn); return () => store.listeners.delete(fn); },
}));
vi.mock('../lib/toast.js', () => ({ toast: vi.fn() }));

const linked = { id: 'u1', spotifyLinked: true };

beforeEach(() => {
  openRoom.mockResolvedValue({ id: 'r1', code: 'ABC234' });
  closeRoom.mockResolvedValue(null);
});
afterEach(() => vi.clearAllMocks());

describe('useHostRoom', () => {
  it('ouvre la room du créateur et s\'y connecte comme créateur', async () => {
    const { result } = renderHook(() => useHostRoom(linked, true));
    await waitFor(() => expect(result.current.room).toEqual({ id: 'r1', code: 'ABC234' }));
    expect(connectRoom).toHaveBeenCalledWith('ABC234', 'host', { onReconnect: expect.any(Function) });
    expect(result.current.live).toBe(store.snapshot);
  });

  it('rejoue la reprise fournie par l\'appelant à la reconnexion', async () => {
    const resync = vi.fn();
    renderHook(() => useHostRoom(linked, true, resync));
    await waitFor(() => expect(connectRoom).toHaveBeenCalled());
    connectRoom.mock.calls[0][2].onReconnect();
    expect(resync).toHaveBeenCalled();
  });

  it('accepte de ne pas fournir de reprise', async () => {
    renderHook(() => useHostRoom(linked, true));
    await waitFor(() => expect(connectRoom).toHaveBeenCalled());
    expect(() => connectRoom.mock.calls[0][2].onReconnect()).not.toThrow();
  });

  it('ne fait rien sans Spotify relié ou quand l\'appareil joue en participant', () => {
    renderHook(() => useHostRoom({ id: 'u1', spotifyLinked: false }, true));
    renderHook(() => useHostRoom(linked, false));
    renderHook(() => useHostRoom(null, true));
    expect(openRoom).not.toHaveBeenCalled();
  });

  it('ferme la room et en ouvre une nouvelle', async () => {
    const { result } = renderHook(() => useHostRoom(linked, true));
    await waitFor(() => expect(result.current.room).not.toBeNull());
    openRoom.mockResolvedValue({ id: 'r2', code: 'XYZ789' });
    await act(() => result.current.close());
    expect(closeRoom).toHaveBeenCalled();
    expect(disconnectRoom).toHaveBeenCalled();
    await waitFor(() => expect(result.current.room).toEqual({ id: 'r2', code: 'XYZ789' }));
  });

  it('signale une fermeture impossible', async () => {
    closeRoom.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useHostRoom(linked, true));
    await waitFor(() => expect(result.current.room).not.toBeNull());
    await act(() => result.current.close());
    expect(toast).toHaveBeenCalledWith('Impossible de fermer la room');
  });

  it('signale une room indisponible', async () => {
    openRoom.mockRejectedValue(new Error('down'));
    renderHook(() => useHostRoom(linked, true));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Room indisponible : les participants ne peuvent pas rejoindre'));
  });

  it('se déconnecte quand le compte change et ignore une ouverture tardive', async () => {
    let resolveFirst;
    openRoom.mockReturnValueOnce(new Promise(r => { resolveFirst = r; }));
    const { result, rerender, unmount } = renderHook(({ user }) => useHostRoom(user, true), { initialProps: { user: linked } });
    rerender({ user: { id: 'u2', spotifyLinked: true } });
    await act(async () => resolveFirst({ id: 'old', code: 'OLD000' }));
    await waitFor(() => expect(result.current.room).toEqual({ id: 'r1', code: 'ABC234' }));
    expect(connectRoom).not.toHaveBeenCalledWith('OLD000', 'host', expect.anything());
    unmount();
    expect(disconnectRoom).toHaveBeenCalled();
  });
});
