import { useEffect, useState } from 'react';

export function fmtClock(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Temps restant d'une manche : le serveur l'envoie à chaque état, l'appareil le décompte entre deux états
export function useCountdown(round, receivedAt) {
  const [now, setNow] = useState(() => Date.now());
  const running = round?.status === 'open' && !round.paused;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  if (!round || round.status !== 'open') return 0;
  if (round.paused) return round.remainingMs;
  return Math.max(0, round.remainingMs - Math.max(0, now - receivedAt));
}
