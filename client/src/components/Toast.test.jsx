import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { toast } from '../lib/toast.js';
import Toast from './Toast.jsx';

describe('Toast', () => {
  it('affiche le dernier message', () => {
    const { container } = render(<Toast />);
    expect(container.firstChild).not.toHaveClass('show');
    act(() => toast('Coucou'));
    expect(screen.getByText('Coucou')).toHaveClass('toast', 'show');
  });
});
