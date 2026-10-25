import { render, screen } from '@testing-library/react';
import QRCode from 'qrcode';
import { describe, expect, it, vi } from 'vitest';
import QrCode from './QrCode.jsx';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async text => `data:image/png;base64,${btoa(text)}`) } }));

describe('QrCode', () => {
  it('affiche le QR code du texte', async () => {
    render(<QrCode text="https://melodyo.fr/r/ABC234" size={150} />);
    const img = await screen.findByAltText('QR code');
    expect(img).toHaveAttribute('src', `data:image/png;base64,${btoa('https://melodyo.fr/r/ABC234')}`);
    expect(img).toHaveAttribute('width', '150');
    expect(QRCode.toDataURL).toHaveBeenCalledWith('https://melodyo.fr/r/ABC234', { width: 300, margin: 1 });
  });

  it('a une taille par défaut', async () => {
    render(<QrCode text="x" />);
    expect(await screen.findByAltText('QR code')).toHaveAttribute('width', '200');
  });
});
