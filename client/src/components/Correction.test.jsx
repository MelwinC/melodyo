import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Correction from './Correction.jsx';

const participants = [
  { id: 'p1', name: 'Les Rouges', avatar: { kind: 'preset', value: 'note' }, connected: true },
  { id: 'p2', name: 'Les Bleus', avatar: { kind: 'preset', value: 'micro' }, connected: true },
];
const state = (over = {}) => ({
  participants,
  game: { id: 'g', total: 3, correction: 'end' },
  correction: { position: 1 },
  revealed: [],
  answers: [
    { participantId: 'p1', title: 'Take On Me', artist: 'a-ha', titleOk: true, artistOk: null },
    { participantId: 'p2', title: '', artist: '', titleOk: null, artistOk: null },
  ],
  ...over,
});
const props = over => ({ state: state(over), onCorrect: vi.fn(), onReveal: vi.fn(), onNext: vi.fn() });
const row = name => screen.getByText(name).closest('li');

describe('Correction', () => {
  it('liste les réponses de chaque participant avec les boutons de validation', async () => {
    const p = props();
    render(<Correction {...p} />);
    expect(screen.getByText('Chanson 2/3')).toBeInTheDocument();
    const rouges = within(row('Les Rouges'));
    expect(rouges.getByText('Take On Me')).toBeInTheDocument();
    expect(rouges.getByRole('button', { name: 'Titre correct' })).toHaveAttribute('aria-pressed', 'true');
    expect(rouges.getByRole('button', { name: 'Titre faux' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(rouges.getByRole('button', { name: 'Artiste faux' }));
    expect(p.onCorrect).toHaveBeenCalledWith('p1', 'artist', false);
    await userEvent.click(rouges.getByRole('button', { name: 'Artiste correct' }));
    expect(p.onCorrect).toHaveBeenLastCalledWith('p1', 'artist', true);
    const bleus = within(row('Les Bleus'));
    expect(bleus.getAllByText('—')).toHaveLength(2);
    expect(bleus.getByRole('button', { name: 'Titre correct' })).toBeDisabled();
  });

  it('révèle la chanson puis passe à la suivante', async () => {
    const p = props();
    const { rerender } = render(<Correction {...p} />);
    expect(screen.getByText('Pas encore révélée')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '👁 Révéler' }));
    expect(p.onReveal).toHaveBeenCalledWith(1);
    rerender(<Correction {...p} state={state({ revealed: [{ position: 1, name: 'Take On Me', artists: ['a-ha', 'X'], albumImage: 'https://i.scdn.co/c' }] })} />);
    expect(screen.getByText('Take On Me — a-ha, X')).toBeInTheDocument();
    expect(document.querySelector('.correction-cover')).toHaveAttribute('src', 'https://i.scdn.co/c');
    await userEvent.click(screen.getByRole('button', { name: 'Chanson suivante' }));
    expect(p.onNext).toHaveBeenCalled();
  });

  it('propose le classement sur la dernière chanson et rien en correction à la volée', () => {
    const { rerender } = render(<Correction {...props({ correction: { position: 2 } })} />);
    expect(screen.getByRole('button', { name: 'Voir le classement' })).toBeInTheDocument();
    rerender(<Correction {...props({ game: { id: 'g', total: 3, correction: 'live' }, revealed: [{ position: 1, name: 'T', artists: ['A'], albumImage: null }] })} />);
    expect(screen.queryByRole('button', { name: /suivante|classement/ })).toBeNull();
    expect(document.querySelector('.correction-cover')).toBeNull();
  });

  it('indique l\'absence de participant', () => {
    render(<Correction {...props({ participants: [], answers: [] })} />);
    expect(screen.getByText('Aucun participant : révèle la chanson et continue')).toBeInTheDocument();
  });

  it('affiche un participant arrivé sans réponse enregistrée', () => {
    const extra = { id: 'p3', name: 'Les Verts', avatar: { kind: 'preset', value: 'note' }, connected: true };
    render(<Correction {...props({ participants: [...participants, extra] })} />);
    expect(within(row('Les Verts')).getAllByText('—')).toHaveLength(2);
  });
});
