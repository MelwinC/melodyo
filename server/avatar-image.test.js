import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { InvalidImageError, toAvatarImage } from './avatar-image.js';

const solid = (width, height) => sharp({ create: { width, height, channels: 3, background: '#e84393' } });

describe('toAvatarImage', () => {
  it('ré-encode en WebP 256×256', async () => {
    const out = await toAvatarImage(await solid(600, 300).png().toBuffer());
    const meta = await sharp(out).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });
  });

  it('retire les métadonnées', async () => {
    const jpeg = await solid(300, 300).withExif({ IFD0: { Copyright: 'secret' } }).jpeg().toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();
    expect((await sharp(await toAvatarImage(jpeg)).metadata()).exif).toBeUndefined();
  });

  it('accepte le WebP', async () => {
    await expect(toAvatarImage(await solid(64, 64).webp().toBuffer())).resolves.toBeInstanceOf(Buffer);
  });

  it.each([
    ['un PDF renommé', () => Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF')],
    ['un SVG avec script', () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>')],
    ['un GIF', () => solid(32, 32).gif().toBuffer()],
    ['une image géante (bombe de décompression)', () => solid(5000, 5000).png().toBuffer()],
  ])('refuse %s', async (_, make) => {
    await expect(toAvatarImage(await make())).rejects.toBeInstanceOf(InvalidImageError);
  });
});
