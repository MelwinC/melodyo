import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Icon, { Logo } from './Icon.jsx';

describe('Icon', () => {
  it('affiche une icône décorative à la taille demandée', () => {
    const { container } = render(<Icon name="play" size={30} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('icon');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '30');
  });

  it('prend 18 px par défaut', () => {
    const { container } = render(<Icon name="check" />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '18');
  });
});

describe('Logo', () => {
  it('affiche le logo à la taille demandée', () => {
    const { container } = render(<Logo size={72} />);
    expect(container.querySelector('svg.logo')).toHaveAttribute('width', '72');
  });

  it('prend 40 px par défaut', () => {
    const { container } = render(<Logo />);
    expect(container.querySelector('svg.logo')).toHaveAttribute('width', '40');
  });
});
