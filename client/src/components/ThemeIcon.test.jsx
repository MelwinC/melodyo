import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../lib/themes.js';
import ThemeIcon from './ThemeIcon.jsx';

describe('ThemeIcon', () => {
  it.each(THEMES.map(t => t.id))('illustre le thème %s', id => {
    const { container } = render(<ThemeIcon id={id} size={50} />);
    expect(container.firstChild).toHaveStyle({ width: '50px', height: '50px' });
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('retombe sur des notes pour un thème inconnu, à 40 px par défaut', () => {
    const { container } = render(<ThemeIcon id="inconnu" />);
    expect(container.firstChild).toHaveStyle({ width: '40px' });
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
