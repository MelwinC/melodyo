import crypto from 'node:crypto';

// AES-256-GCM : les tokens Spotify ne sont jamais stockés en clair en base
export function encrypt(plain, keyHex) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}

export function decrypt(payload, keyHex) {
  const [iv, tag, data] = payload.split('.').map(p => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
