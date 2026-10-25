// Délai d'une manche : ne s'écoule que pendant la lecture (une pause le fige)
export const openClock = (now, durationMs) => ({ durationMs, startedAt: now, pausedAt: null, elapsedBeforePause: 0 });

const elapsed = (c, now) => c.elapsedBeforePause + (c.pausedAt === null ? now - c.startedAt : 0);

export const remainingMs = (c, now) => Math.max(0, c.durationMs - elapsed(c, now));
export const isPaused = c => c.pausedAt !== null;

export const pauseClock = (c, now) => (isPaused(c) ? c : { ...c, elapsedBeforePause: elapsed(c, now), pausedAt: now });
export const resumeClock = (c, now) => (isPaused(c) ? { ...c, pausedAt: null, startedAt: now } : c);
