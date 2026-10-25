import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resizeForAvatar } from './image.js';

let drawImage, toBlob;

beforeEach(() => {
  drawImage = vi.fn();
  toBlob = vi.fn(function (cb, type) { cb(new Blob(['img'], { type })); });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlob);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const bitmap = (width, height) => ({ width, height, close: vi.fn() });

describe('resizeForAvatar', () => {
  it('réduit une grande photo à 512 px en WebP', async () => {
    const bmp = bitmap(4000, 3000);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bmp));
    const blob = await resizeForAvatar(new Blob(['x']));
    expect(blob.type).toBe('image/webp');
    expect(drawImage).toHaveBeenCalledWith(bmp, 0, 0, 512, 384);
    expect(toBlob.mock.calls[0][2]).toBe(0.9);
    expect(bmp.close).toHaveBeenCalled();
  });

  it('n\'agrandit pas une petite image', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap(200, 100)));
    await resizeForAvatar(new Blob(['x']));
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 200, 100);
  });

  it('échoue si le navigateur ne sait pas lire le fichier', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('format')));
    await expect(resizeForAvatar(new Blob(['x']))).rejects.toMatchObject({ code: 'invalid_image' });
  });

  it('échoue si la conversion ne produit rien', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap(10, 10)));
    toBlob.mockImplementation(cb => cb(null));
    await expect(resizeForAvatar(new Blob(['x']))).rejects.toMatchObject({ code: 'invalid_image' });
  });
});
