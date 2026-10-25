import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Scoreboard from './Scoreboard.jsx';

const participants = [
  { id: 'p1', name: 'Les Rouges', avatar: { kind: 'preset', value: 'note' } },
  { id: 'p2', name: 'Les Bleus', avatar: { kind: 'preset', value: 'micro' } },
];
const scores = [
  { id: 'p2', name: 'Les Bleus', score: 3, rank: 1 },
  { id: 'p1', name: 'Les Rouges', score: 3, rank: 1 },
];
const details = {
  p1: [
    { position: 0, track: { name: 'Take On Me', artists: ['a-ha'] }, answer: { title: 'Take on me', artist: 'Aha' }, titleOk: true, artistOk: false },
    { position: 1, track: { name: 'Africa', artists: ['Toto'] }, answer: null, titleOk: null, artistOk: null },
    { position: 2, track: { name: 'Hello', artists: ['Adele'] }, answer: { title: '', artist: 'Adele' }, titleOk: null, artistOk: true },
    { position: 3, track: { name: 'Yesterday', artists: ['The Beatles'] }, answer: { title: 'Yesterday', artist: '' }, titleOk: true, artistOk: null },
  ],
  p2: [],
};

describe('Scoreboard', () => {
  it('affiche le classement avec les ex æquo', () => {
    render(<Scoreboard scores={scores} participants={participants} details={details} />);
    const rows = screen.getAllByRole('button', { name: /pts/ });
    expect(rows[0]).toHaveTextContent(/^1.*Les Bleus3 pts$/);
    expect(rows[1]).toHaveTextContent(/^1.*Les Rouges3 pts$/);
  });

  it('déplie le détail des réponses d\'un participant', async () => {
    render(<Scoreboard scores={scores} participants={participants} details={details} />);
    await userEvent.click(screen.getByRole('button', { name: /Les Rouges/ }));
    const detail = within(screen.getByRole('list', { name: 'Réponses de Les Rouges' }));
    expect(detail.getByText('Take On Me — a-ha')).toBeInTheDocument();
    expect(detail.getByText('✓ Take on me')).toBeInTheDocument();
    expect(detail.getByText('✗ Aha')).toBeInTheDocument();
    expect(detail.getByText('Africa — Toto')).toBeInTheDocument();
    expect(detail.getByText('Pas de réponse')).toBeInTheDocument();
    expect(detail.getAllByText('✗ —')).toHaveLength(2);
    expect(detail.getByText('✓ Adele')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Les Rouges/ }));
    expect(screen.queryByRole('list', { name: 'Réponses de Les Rouges' })).toBeNull();
  });

  it('gère un participant parti et la fermeture', async () => {
    const onClose = vi.fn();
    render(<Scoreboard scores={[{ id: 'px', name: 'Parti', score: 0, rank: 1 }]} participants={[]} details={{}} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /Parti/ }));
    expect(screen.getByText('Aucune réponse')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('n\'affiche pas Terminer sans action', () => {
    render(<Scoreboard scores={[]} participants={[]} details={{}} />);
    expect(screen.getByText('Personne n\'a joué')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Terminer' })).toBeNull();
  });
});
