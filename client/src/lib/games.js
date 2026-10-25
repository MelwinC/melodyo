import { request } from './http.js';

export const fetchExclusions = async () => new Set((await request('GET', '/api/games/exclusions')).uris);
export const fetchReview = async () => (await request('GET', '/api/review')).tracks;
export const createGame = async (settings, tracks, roomId) =>
  (await request('POST', '/api/games', roomId ? { settings, tracks, roomId } : { settings, tracks })).id;
export const markPlayed = (gameId, position) => request('POST', `/api/games/${gameId}/played`, { position });
export const endGame = gameId => request('POST', `/api/games/${gameId}/end`);
export const listGames = async () => (await request('GET', '/api/games')).games;
export const getGame = async gameId => (await request('GET', `/api/games/${gameId}`)).game;
export const addToReview = track => request('POST', '/api/review', { track });
export const removeFromReview = uri => request('DELETE', '/api/review', { uri });
