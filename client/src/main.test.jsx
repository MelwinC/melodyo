import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./App.jsx', () => ({ default: () => <p>application</p> }));

describe('main', () => {
  it('monte l\'application dans #app', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    await import('./main.jsx');
    expect(await screen.findByText('application')).toBeInTheDocument();
  });
});
