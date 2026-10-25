import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Avatar from './Avatar.jsx';

describe('Avatar', () => {
  it('affiche un avatar proposé en pastille colorée', () => {
    const { container } = render(<Avatar avatar={{ kind: 'preset', value: 'guitare' }} size={64} />);
    const el = container.firstChild;
    expect(el).toHaveTextContent('🎸');
    expect(el).toHaveStyle({ width: '64px', height: '64px', background: '#e67e22' });
  });

  it('retombe sur la note pour un avatar inconnu', () => {
    const { container } = render(<Avatar avatar={{ kind: 'preset', value: 'disparu' }} />);
    expect(container.firstChild).toHaveTextContent('🎵');
    expect(container.firstChild).toHaveStyle({ width: '40px' });
  });

  it('affiche une image envoyée', () => {
    const { container } = render(<Avatar avatar={{ kind: 'upload', value: 'a.webp' }} />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/avatars/a.webp');
  });
});
