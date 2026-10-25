import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./http.js', async importOriginal => ({ ...(await importOriginal()), request: vi.fn(), uploadImage: vi.fn() }));
vi.mock('./image.js', () => ({ resizeForAvatar: vi.fn() }));
vi.mock('./toast.js', () => ({ toast: vi.fn() }));

let session, http, image, toast;
const user = { id: 'u1', username: 'Mel', avatar: { kind: 'preset', value: 'note' }, spotifyLinked: true };

beforeEach(async () => {
  vi.resetModules();
  session = await import('./session.js');
  http = await import('./http.js');
  image = await import('./image.js');
  ({ toast } = await import('./toast.js'));
});
afterEach(() => vi.clearAllMocks());

describe('session', () => {
  it('démarre en chargement', () => {
    expect(session.getSession()).toEqual({ status: 'loading', user: null });
  });

  it('charge le compte connecté et prévient les abonnés', async () => {
    const listener = vi.fn();
    const unsubscribe = session.subscribeSession(listener);
    http.request.mockResolvedValue({ user });
    await session.loadSession();
    expect(http.request).toHaveBeenCalledWith('GET', '/api/me');
    expect(session.getSession()).toEqual({ status: 'ready', user });
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('passe en anonyme sans session', async () => {
    http.request.mockRejectedValue(new http.ApiError(401, 'not_logged_in'));
    await session.loadSession();
    expect(session.getSession()).toEqual({ status: 'anonymous', user: null });
  });

  it('passe en anonyme et prévient si le serveur ne répond pas', async () => {
    http.request.mockRejectedValue(new http.ApiError(502, 'http_502'));
    await session.loadSession();
    expect(session.getSession().status).toBe('anonymous');
    expect(toast).toHaveBeenCalledWith('Serveur injoignable, réessaie dans un instant');
  });

  it.each([
    ['login', '/api/auth/login'],
    ['register', '/api/auth/register'],
  ])('%s ouvre la session', async (fn, path) => {
    http.request.mockResolvedValue({ user });
    await session[fn]('Mel', 'motdepasse');
    expect(http.request).toHaveBeenCalledWith('POST', path, { username: 'Mel', password: 'motdepasse' });
    expect(session.getSession()).toEqual({ status: 'ready', user });
  });

  it('logout ferme la session', async () => {
    http.request.mockResolvedValue(null);
    await session.logout();
    expect(http.request).toHaveBeenCalledWith('POST', '/api/auth/logout');
    expect(session.getSession()).toEqual({ status: 'anonymous', user: null });
  });

  it('choosePreset met à jour l\'avatar', async () => {
    const updated = { ...user, avatar: { kind: 'preset', value: 'guitare' } };
    http.request.mockResolvedValue({ user: updated });
    await session.choosePreset('guitare');
    expect(http.request).toHaveBeenCalledWith('PUT', '/api/me/avatar', { preset: 'guitare' });
    expect(session.getSession().user).toEqual(updated);
  });

  it('uploadAvatar réduit puis envoie l\'image', async () => {
    const resized = new Blob(['r'], { type: 'image/webp' });
    const updated = { ...user, avatar: { kind: 'upload', value: 'a.webp' } };
    image.resizeForAvatar.mockResolvedValue(resized);
    http.uploadImage.mockResolvedValue({ user: updated });
    await session.uploadAvatar(new Blob(['photo']));
    expect(http.uploadImage).toHaveBeenCalledWith('/api/me/avatar', resized);
    expect(session.getSession().user).toEqual(updated);
  });

  it('markSpotifyUnlinked retire la liaison du compte en cours', async () => {
    http.request.mockResolvedValue({ user });
    await session.loadSession();
    session.markSpotifyUnlinked();
    expect(session.getSession().user.spotifyLinked).toBe(false);
  });

  it('markSpotifyUnlinked ne fait rien sans session', () => {
    session.markSpotifyUnlinked();
    expect(session.getSession()).toEqual({ status: 'loading', user: null });
  });
});

describe('messageFor', () => {
  it.each([
    ['username_taken', 'Ce pseudo est déjà pris'],
    ['invalid_credentials', 'Pseudo ou mot de passe incorrect'],
    ['invalid_username', 'Pseudo : 3 à 20 caractères (lettres, chiffres, . _ -)'],
    ['invalid_password', 'Mot de passe : 8 caractères minimum'],
    ['too_many_requests', 'Trop de tentatives, réessaie dans quelques minutes'],
    ['invalid_image', 'Image illisible (PNG, JPEG ou WebP)'],
    ['unsupported_type', 'Format non supporté (PNG, JPEG ou WebP)'],
    ['entity.too.large', 'Image trop lourde (2 Mo max)'],
    ['room_not_found', 'Room introuvable'],
    ['invalid_name', 'Nom : 1 à 20 caractères'],
    ['autre', 'Une erreur est survenue'],
    [undefined, 'Une erreur est survenue'],
  ])('traduit %s', (code, message) => {
    expect(session.messageFor(code)).toBe(message);
  });
});

describe('session terminée pendant l\'usage', () => {
  it('repasse en anonyme quand le serveur répond 401 not_logged_in', async () => {
    http.request.mockResolvedValue({ user });
    await session.loadSession();
    http.notifyUnauthorized();
    expect(session.getSession()).toEqual({ status: 'anonymous', user: null });
  });
});

describe('anciens tokens de l\'étape 1', () => {
  it('sont effacés du navigateur au chargement', async () => {
    for (const k of ['bt_token', 'bt_refresh', 'bt_expiry']) localStorage.setItem(k, 'x');
    localStorage.setItem('autre', 'garde');
    http.request.mockResolvedValue({ user });
    await session.loadSession();
    expect(Object.keys(localStorage)).toEqual(['autre']);
    localStorage.clear();
  });
});
