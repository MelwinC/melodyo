import { request } from './http.js';

export const fetchStats = async () => (await request('GET', '/api/me/stats')).stats;
