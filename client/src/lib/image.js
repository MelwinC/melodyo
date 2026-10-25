import { ApiError } from './http.js';

// Les photos de téléphone dépassent souvent 2 Mo : on les réduit avant l'envoi
export async function resizeForAvatar(file, size = 512) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ApiError(0, 'invalid_image');
  }
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new ApiError(0, 'invalid_image'))), 'image/webp', 0.9);
  });
}
