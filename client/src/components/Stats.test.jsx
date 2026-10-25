import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStats } from '../lib/stats.js';
import Stats from './Stats.jsx';

vi.mock('../lib/stats.js', () => ({ fetchStats: vi.fn() }));
afterEach(() => vi.clearAllMocks());

const full = {
  games: 12, wins: 5, losses: 6, titleRate: 64, artistRate: 51, overallRate: 58, averageRank: 1.8, bestRank: 1,
  themes: [
    { themeId: '80s', songs: 40, titleOk: 30, artistOk: 21 },
    { themeId: 'theme-retire', songs: 3, titleOk: 1, artistOk: 0 },
  ],
};
const tile = label => within(document.querySelector('.stat-grid')).getByText(label).closest('.stat-tile');

describe('Stats', () => {
  it('affiche les tuiles et le tableau des thèmes', async () => {
    fetchStats.mockResolvedValue(full);
    render(<Stats />);
    expect(screen.getByText('Chargement des statistiques…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Mes statistiques' })).toBeInTheDocument();
    expect(tile('Parties')).toHaveTextContent('12');
    expect(tile('Victoires')).toHaveTextContent('5');
    expect(tile('Défaites')).toHaveTextContent('6');
    expect(tile('Bonnes réponses')).toHaveTextContent('58 %');
    expect(tile('Titres')).toHaveTextContent('64 %');
    expect(tile('Artistes')).toHaveTextContent('51 %');
    expect(tile('Classement moyen')).toHaveTextContent('1,8');
    expect(tile('Meilleur classement')).toHaveTextContent('1er');
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('📻 Années 80');
    expect(rows[1]).toHaveTextContent('40');
    expect(rows[1]).toHaveTextContent('75 %');
    expect(rows[1]).toHaveTextContent('53 %');
    expect(rows[2]).toHaveTextContent('theme-retire');
  });

  it('affiche un tiret pour les classements sans partie à plusieurs', async () => {
    fetchStats.mockResolvedValue({ ...full, wins: 0, losses: 0, averageRank: null, bestRank: null });
    render(<Stats />);
    expect(await screen.findByRole('heading', { name: 'Mes statistiques' })).toBeInTheDocument();
    expect(tile('Classement moyen')).toHaveTextContent('—');
    expect(tile('Meilleur classement')).toHaveTextContent('—');
  });

  it('affiche un meilleur classement au-delà de la première place', async () => {
    fetchStats.mockResolvedValue({ ...full, bestRank: 3 });
    render(<Stats />);
    expect(await screen.findByText('3e')).toBeInTheDocument();
  });

  it('indique l\'absence de partie', async () => {
    fetchStats.mockResolvedValue({ ...full, games: 0, themes: [] });
    render(<Stats />);
    expect(await screen.findByText('Pas encore de partie')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('signale une erreur de chargement', async () => {
    fetchStats.mockRejectedValue(new Error('down'));
    render(<Stats />);
    expect(await screen.findByText('Statistiques indisponibles')).toBeInTheDocument();
  });
});
