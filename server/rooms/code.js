import crypto from 'node:crypto';

// Sans 0/O ni 1/I/L : un code lu à voix haute ou recopié d'un écran ne prête pas à confusion
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function generateRoomCode(random = crypto.randomInt) {
  return Array.from({ length: CODE_LENGTH }, () => ROOM_CODE_ALPHABET[random(ROOM_CODE_ALPHABET.length)]).join('');
}

export function normalizeRoomCode(input) {
  const code = String(input ?? '').toUpperCase().replace(/\s+/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}
