import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { closeRoom, connectRoom, disconnectRoom, getRoomState, openRoom, subscribeRoom } from '../lib/room.js';
import { toast } from '../lib/toast.js';

// Room du créateur : ouverte dès que son Spotify est relié, connectée en temps réel comme créateur.
// onReconnect est rejoué à chaque reconnexion (l'appelant y renvoie la partie et la chanson en cours).
export function useHostRoom(user, enabled, onReconnect = () => {}) {
  const live = useSyncExternalStore(subscribeRoom, getRoomState);
  const [opened, setOpened] = useState(null);
  const [generation, setGeneration] = useState(0);
  const reconnect = useRef(onReconnect);
  useEffect(() => { reconnect.current = onReconnect; });
  const ownerId = enabled && user?.spotifyLinked ? user.id : null;

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    openRoom()
      .then(room => {
        if (cancelled) return;
        setOpened({ room, ownerId, generation });
        connectRoom(room.code, 'host', { onReconnect: () => reconnect.current() });
      })
      .catch(() => toast('Room indisponible : les participants ne peuvent pas rejoindre'));
    return () => {
      cancelled = true;
      disconnectRoom();
    };
  }, [ownerId, generation]);

  async function close() {
    try {
      await closeRoom();
      setGeneration(g => g + 1);
    } catch {
      toast('Impossible de fermer la room');
    }
  }

  const current = opened?.ownerId === ownerId && opened.generation === generation;
  return { room: current ? opened.room : null, live, close };
}
