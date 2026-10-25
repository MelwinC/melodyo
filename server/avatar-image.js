import sharp from 'sharp';

export class InvalidImageError extends Error {}

const ALLOWED_FORMATS = new Set(['png', 'jpeg', 'webp']);
// Une petite image compressée peut décoder en centaines de Mo : on plafonne avant de décoder
const MAX_INPUT_PIXELS = 4096 * 4096;

// Ré-encodage complet : retire métadonnées et contenu caché, et impose un format sûr à servir
export async function toAvatarImage(buffer) {
  try {
    const image = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS });
    const { format } = await image.metadata();
    if (!ALLOWED_FORMATS.has(format)) throw new Error(`format refusé : ${format}`);
    return await image.rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
  } catch (err) {
    throw new InvalidImageError(err.message, { cause: err });
  }
}
