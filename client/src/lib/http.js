export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

// Session terminée ailleurs (autre onglet, expiration) : le store de session repasse en anonyme
let unauthorizedHandler = () => {};
export const onUnauthorized = fn => { unauthorizedHandler = fn; };
export const notifyUnauthorized = () => unauthorizedHandler();
export const isSessionExpired = (status, json) => status === 401 && json?.error === 'not_logged_in';

async function parse(res) {
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (isSessionExpired(res.status, json)) notifyUnauthorized();
  if (!res.ok) throw new ApiError(res.status, json.error ?? `http_${res.status}`);
  return json;
}

// Appels à l'API Melodyo : JSON, cookie de session same-origin
export async function request(method, path, body) {
  const hasBody = body !== undefined;
  return parse(await fetch(path, {
    method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  }));
}

export async function uploadImage(path, file) {
  return parse(await fetch(path, { method: 'POST', headers: { 'Content-Type': file.type }, body: file }));
}
