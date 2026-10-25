import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listGames } from '../lib/games.js';
import { summary } from '../../test/fixtures.js';
import History from './History.jsx';

vi.mock('../lib/games.js', () => ({ listGames: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('History', () => {
  it('liste les parties et ouvre le détail', async () => {
    listGames.mockResolvedValue([summary(), summary({ id: 'g2', status: 'interrupted', playedCount: 3 }), summary({ id: 'g3', status: 'playing' })]);
    const onOpen = vi.fn();
    render(<History onOpen={onOpen} onBack={vi.fn()} />);
    expect(screen.getByText('Chargement…')).toBeInTheDocument();
    const rows = await screen.findAllByRole('button', { name: /sons/ });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('📻 🏰');
    expect(rows[0]).toHaveTextContent('8/10 sons');
    expect(rows[0]).toHaveTextContent('Terminée');
    expect(rows[0]).toHaveTextContent('24 oct. 2026');
    expect(rows[1]).toHaveTextContent('Interrompue');
    expect(rows[2]).toHaveTextContent('En cours');
    await userEvent.click(rows[1]);
    expect(onOpen).toHaveBeenCalledWith('g2');
  });

  it('affiche une liste vide', async () => {
    listGames.mockResolvedValue([]);
    render(<History onOpen={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByText('Aucune partie pour l\'instant')).toBeInTheDocument();
  });

  it('signale une erreur et revient en arrière', async () => {
    listGames.mockRejectedValue(new Error('down'));
    const onBack = vi.fn();
    render(<History onOpen={vi.fn()} onBack={onBack} />);
    expect(await screen.findByText('Impossible de charger l\'historique')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '← Retour' }));
    expect(onBack).toHaveBeenCalled();
  });
});
