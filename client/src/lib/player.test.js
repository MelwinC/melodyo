import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./spotify.js', () => ({ api: vi.fn(), ensureToken: vi.fn(), getToken: vi.fn(() => 'tok') }));
vi.mock('./toast.js', () => ({ toast: vi.fn() }));

let instances;
let mod, spotify, toast;

class FakePlayer {
  constructor(options) {
    this.options = options;
    this.listeners = {};
    for (const m of ['togglePlay', 'nextTrack', 'previousTrack', 'disconnect', 'seek', 'getCurrentState', 'activateElement', 'connect']) {
      this[m] = vi.fn();
    }
    this.pause = vi.fn().mockResolvedValue();
    instances.push(this);
  }
  addListener(event, fn) { this.listeners[event] = fn; }
  emit(event, arg) { this.listeners[event](arg); }
}

async function load() {
  vi.resetModules();
  instances = [];
  window.spotifySdkReady = Promise.resolve();
  window.Spotify = { Player: FakePlayer };
  mod = await import('./player.js');
  spotify = await import('./spotify.js');
  ({ toast } = await import('./toast.js'));
  spotify.ensureToken.mockResolvedValue();
}

async function readyPlayer() {
  const promise = mod.ensurePlayer();
  await vi.waitFor(() => expect(instances).toHaveLength(1));
  instances[0].emit('ready', { device_id: 'dev1' });
  await promise;
  return instances[0];
}

const track = (uri, extra = {}) => ({ uri, name: uri, _themeId: '80s', _themeLabel: 'Années 80', ...extra });

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await load();
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('ensurePlayer', () => {
  it('crée un seul lecteur nommé Melodyo, même appelé deux fois', async () => {
    const first = mod.ensurePlayer();
    const second = mod.ensurePlayer();
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    instances[0].emit('ready', { device_id: 'd' });
    expect(await first).toBe(instances[0]);
    expect(await second).toBe(instances[0]);
    expect(await mod.ensurePlayer()).toBe(instances[0]);
    expect(instances[0].options.name).toBe('Melodyo');
    expect(instances[0].connect).toHaveBeenCalledOnce();
  });

  it.each([
    ['initialization_error', 'Failed to initialize', 'Failed to initialize'],
    ['authentication_error', 'bad token', 'Erreur d\'authentification Spotify'],
    ['account_error', 'free', 'Spotify Premium requis pour la lecture dans le navigateur'],
  ])('rejette sur %s puis permet de réessayer', async (event, message, expected) => {
    const promise = mod.ensurePlayer();
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    instances[0].emit(event, { message });
    await expect(promise).rejects.toThrow(expected);
    mod.ensurePlayer();
    await vi.waitFor(() => expect(instances).toHaveLength(2));
  });

  it('abandonne après 20 secondes sans réponse du SDK', async () => {
    vi.useFakeTimers();
    const promise = mod.ensurePlayer();
    const assertion = expect(promise).rejects.toThrow(/Délai dépassé/);
    await vi.advanceTimersByTimeAsync(20000);
    await assertion;
  });

  it('abandonne après 20 secondes si le SDK ne se charge jamais (bloqueur, réseau)', async () => {
    vi.useFakeTimers();
    window.spotifySdkReady = new Promise(() => {});
    const promise = mod.ensurePlayer();
    const assertion = expect(promise).rejects.toThrow(/Délai dépassé/);
    await vi.advanceTimersByTimeAsync(20000);
    await assertion;
    expect(instances).toHaveLength(0);
  });

  it('rejette si la session Spotify ne peut pas être renouvelée', async () => {
    spotify.ensureToken.mockRejectedValue(new Error('Session expirée'));
    await expect(mod.ensurePlayer()).rejects.toThrow('Session expirée');
  });

  it('fournit le token au SDK', async () => {
    const p = await readyPlayer();
    const cb = vi.fn();
    await p.options.getOAuthToken(cb);
    expect(cb).toHaveBeenCalledWith('tok');
  });

  it('affiche un message si le token ne peut pas être renouvelé', async () => {
    const p = await readyPlayer();
    spotify.ensureToken.mockRejectedValue(new Error('Session expirée'));
    const cb = vi.fn();
    await p.options.getOAuthToken(cb);
    expect(cb).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('Session expirée');
  });

  it('journalise un appareil hors ligne', async () => {
    const p = await readyPlayer();
    p.emit('not_ready', { device_id: 'dev1' });
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('erreurs de lecture', () => {
  it('signale une première erreur, puis met en pause et explique le problème DRM', async () => {
    const p = await readyPlayer();
    p.emit('playback_error', { message: 'Playback error' });
    expect(toast).toHaveBeenLastCalledWith('⚠️ Lecture impossible : Playback error');
    expect(p.pause).not.toHaveBeenCalled();
    p.emit('playback_error', { message: 'Playback error' });
    expect(p.pause).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenLastCalledWith(expect.stringContaining('DRM'));
  });

  it('remet le compteur à zéro dès qu\'un son joue', async () => {
    const p = await readyPlayer();
    p.emit('playback_error', { message: 'x' });
    p.emit('player_state_changed', { paused: false, position: 1200, duration: 1000, track_window: {} });
    p.emit('playback_error', { message: 'x' });
    expect(p.pause).not.toHaveBeenCalled();
  });

  it('ignore l\'échec de la mise en pause', async () => {
    const p = await readyPlayer();
    p.pause.mockRejectedValue(new Error('no'));
    p.emit('playback_error', { message: 'x' });
    p.emit('playback_error', { message: 'x' });
    await Promise.resolve();
    expect(p.pause).toHaveBeenCalled();
  });

  it('prévient quand l\'autoplay est bloqué', async () => {
    const p = await readyPlayer();
    p.emit('autoplay_failed');
    expect(toast).toHaveBeenCalledWith('Lecture bloquée par le navigateur — appuie sur ▶');
  });
});

describe('startQueue', () => {
  it('transfère la lecture puis lance les URIs 600 ms plus tard', async () => {
    await readyPlayer();
    vi.useFakeTimers();
    const listener = vi.fn();
    mod.subscribePlayer(listener);
    const done = mod.startQueue([track('a'), track('b')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(spotify.api).toHaveBeenCalledWith('PUT', '/me/player', { device_ids: ['dev1'], play: false });
    expect(spotify.api).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600);
    await done;
    expect(spotify.api).toHaveBeenLastCalledWith('PUT', '/me/player/play?device_id=dev1', {
      uris: ['a', 'b'], offset: { position: 0 },
    });
    expect(mod.getPlayerSnapshot()).toMatchObject({ index: 0, total: 2, sdkTrack: null });
    expect(listener).toHaveBeenCalled();
  });

  it('n\'avertit plus un abonné désinscrit', async () => {
    const listener = vi.fn();
    mod.subscribePlayer(listener)();
    mod.getPlayerSnapshot();
    (await readyPlayer()).emit('player_state_changed', { paused: true, position: 0, duration: 0 });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('état du lecteur', () => {
  async function playing(tracks) {
    const p = await readyPlayer();
    vi.useFakeTimers();
    const done = mod.startQueue(tracks);
    await vi.advanceTimersByTimeAsync(600);
    await done;
    vi.useRealTimers();
    return p;
  }

  const state = (current, extra = {}) => ({ paused: false, position: 10, duration: 100, track_window: { current_track: current }, ...extra });

  it('ignore un état vide', async () => {
    const p = await readyPlayer();
    const before = mod.getPlayerSnapshot();
    p.emit('player_state_changed', null);
    expect(mod.getPlayerSnapshot()).toBe(before);
  });

  it('retrouve le son en cours et son thème', async () => {
    const p = await playing([track('a'), track('b', { _themeId: 'pop', _themeLabel: 'Pop' })]);
    p.emit('player_state_changed', state({ uri: 'b' }));
    expect(mod.getPlayerSnapshot()).toMatchObject({ index: 1, theme: { id: 'pop', label: 'Pop' }, paused: false, position: 10 });
  });

  it('reconnaît un son remplacé par Spotify via linked_from', async () => {
    const p = await playing([track('a'), track('b', { linked_from: { uri: 'b-original' } })]);
    p.emit('player_state_changed', state({ uri: 'b-relinked', linked_from: { uri: 'b-original' } }));
    expect(mod.getPlayerSnapshot().index).toBe(1);
  });

  it('garde l\'index et retire le thème pour un son inconnu', async () => {
    const p = await playing([track('a'), track('b')]);
    p.emit('player_state_changed', state({ uri: 'b' }));
    p.emit('player_state_changed', state({ uri: 'zzz' }));
    expect(mod.getPlayerSnapshot()).toMatchObject({ index: 1, theme: null });
  });

  it('ne recalcule pas le son quand seule la position change', async () => {
    const p = await playing([track('a')]);
    p.emit('player_state_changed', state({ uri: 'a' }));
    p.emit('player_state_changed', state({ uri: 'a' }, { position: 50, paused: true }));
    expect(mod.getPlayerSnapshot()).toMatchObject({ index: 0, position: 50, paused: true });
  });

  it('accepte un état sans son en cours', async () => {
    const p = await readyPlayer();
    p.emit('player_state_changed', { paused: true, position: 0, duration: 0 });
    expect(mod.getPlayerSnapshot().sdkTrack).toBeNull();
  });
});

describe('commandes', () => {
  it('ne font rien tant que le lecteur n\'existe pas', async () => {
    await mod.pollPosition();
    await mod.togglePlay();
    await mod.seekBy(1000);
    expect([mod.activate(), mod.nextTrack(), mod.previousTrack(), mod.pause(), mod.disconnect(), mod.seek(1)])
      .toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  it('sont déléguées au lecteur', async () => {
    const p = await readyPlayer();
    await mod.togglePlay();
    expect(p.activateElement).toHaveBeenCalled();
    expect(p.togglePlay).toHaveBeenCalled();
    mod.nextTrack();
    mod.previousTrack();
    mod.pause();
    mod.disconnect();
    mod.seek(1234.7);
    expect(p.nextTrack).toHaveBeenCalled();
    expect(p.previousTrack).toHaveBeenCalled();
    expect(p.pause).toHaveBeenCalled();
    expect(p.disconnect).toHaveBeenCalled();
    expect(p.seek).toHaveBeenCalledWith(1234);
  });

  it('ignore l\'échec de pause', async () => {
    const p = await readyPlayer();
    p.pause.mockRejectedValue(new Error('no'));
    await expect(mod.pause()).resolves.toBeUndefined();
  });

  it('met à jour la position depuis le SDK', async () => {
    const p = await readyPlayer();
    p.getCurrentState.mockResolvedValue({ position: 42, duration: 100 });
    await mod.pollPosition();
    expect(mod.getPlayerSnapshot()).toMatchObject({ position: 42, duration: 100 });
    p.getCurrentState.mockResolvedValue(null);
    await mod.pollPosition();
    expect(mod.getPlayerSnapshot().position).toBe(42);
  });

  it('borne les sauts de ±10 s au début et à 1 s de la fin', async () => {
    const p = await readyPlayer();
    p.getCurrentState.mockResolvedValue({ position: 5000, duration: 60000 });
    await mod.seekBy(-10000);
    expect(p.seek).toHaveBeenLastCalledWith(0);
    await mod.seekBy(60000);
    expect(p.seek).toHaveBeenLastCalledWith(59000);
    p.getCurrentState.mockResolvedValue(null);
    p.seek.mockClear();
    await mod.seekBy(1000);
    expect(p.seek).not.toHaveBeenCalled();
  });
});

describe('isFirefox', () => {
  it('est faux hors Firefox', () => {
    expect(mod.isFirefox).toBe(false);
  });

  it('détecte Firefox', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Gecko/20100101 Firefox/131.0' });
    await load();
    expect(mod.isFirefox).toBe(true);
  });
});

describe('options de lecture', () => {
  async function queued(options, tracks = [track('a'), track('b')]) {
    const p = await readyPlayer();
    vi.useFakeTimers({ now: 1_000_000 });
    const done = mod.startQueue(tracks, options);
    await vi.advanceTimersByTimeAsync(600);
    await done;
    return p;
  }
  const playingState = (uri, extra = {}) => ({ paused: false, position: 0, duration: 200000, track_window: { current_track: { uri } }, ...extra });

  it('démarre au milieu de la chanson', async () => {
    const p = await queued({ start: 'middle' });
    p.emit('player_state_changed', playingState('a'));
    expect(p.seek).toHaveBeenCalledWith(100000);
  });

  it('centre l\'extrait de 30 s au milieu, sans passer sous zéro', async () => {
    const p = await queued({ start: 'middle', timer: '30s' });
    p.emit('player_state_changed', playingState('a'));
    expect(p.seek).toHaveBeenLastCalledWith(85000);
    p.emit('player_state_changed', playingState('b', { duration: 20000 }));
    expect(p.seek).toHaveBeenLastCalledWith(0);
  });

  it('ne déplace pas la lecture en mode début', async () => {
    const p = await queued({});
    p.emit('player_state_changed', playingState('a'));
    expect(p.seek).not.toHaveBeenCalled();
    expect(mod.getPlayerSnapshot()).toMatchObject({ timer: 'full', remaining: null });
  });

  it('signale chaque chanson avec sa durée restante depuis le départ', async () => {
    const onTrackStart = vi.fn();
    const p = await queued({ onTrackStart, start: 'middle' });
    for (const uri of ['a', 'b', 'a', 'zzz']) p.emit('player_state_changed', playingState(uri));
    expect(onTrackStart.mock.calls).toEqual([[0, 100000, true], [1, 100000, true], [0, 100000, false]]);
  });

  it('donne la durée complète en mode début', async () => {
    const onTrackStart = vi.fn();
    const p = await queued({ onTrackStart });
    p.emit('player_state_changed', playingState('a'));
    expect(onTrackStart).toHaveBeenCalledWith(0, 200000, true);
  });

  it('signale les pauses et reprises', async () => {
    const onPlayback = vi.fn();
    const p = await queued({ onPlayback });
    p.emit('player_state_changed', playingState('a'));
    p.emit('player_state_changed', playingState('a', { position: 10 }));
    p.emit('player_state_changed', playingState('a', { paused: true }));
    p.emit('player_state_changed', playingState('a', { paused: true, position: 20 }));
    p.emit('player_state_changed', playingState('a'));
    expect(onPlayback.mock.calls).toEqual([[false], [true], [false]]);
  });

  it('met en pause au bout de 30 s de lecture', async () => {
    const p = await queued({ timer: '30s' });
    p.getCurrentState.mockImplementation(async () => playingState('a'));
    p.emit('player_state_changed', playingState('a'));
    expect(mod.getPlayerSnapshot().remaining).toBe(30000);
    vi.advanceTimersByTime(29000);
    await mod.pollPosition();
    expect(mod.getPlayerSnapshot().remaining).toBe(1000);
    expect(p.pause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    await mod.pollPosition();
    expect(mod.getPlayerSnapshot().remaining).toBe(0);
    expect(p.pause).toHaveBeenCalledOnce();
  });

  it('arrête le décompte pendant la pause et l\'ignore aux sauts de ±10 s', async () => {
    const p = await queued({ timer: '30s' });
    p.emit('player_state_changed', playingState('a'));
    vi.advanceTimersByTime(10000);
    p.emit('player_state_changed', playingState('a', { paused: true, position: 10000 }));
    vi.advanceTimersByTime(60000);
    p.getCurrentState.mockResolvedValue(playingState('a', { paused: true, position: 10000 }));
    await mod.pollPosition();
    expect(mod.getPlayerSnapshot().remaining).toBe(20000);
    p.emit('player_state_changed', playingState('a', { position: 80000 }));
    expect(mod.getPlayerSnapshot().remaining).toBe(20000);
    expect(p.pause).not.toHaveBeenCalled();
  });

  it('repart à 30 s sur la chanson suivante ou précédente', async () => {
    const p = await queued({ timer: '30s' });
    p.emit('player_state_changed', playingState('a'));
    vi.advanceTimersByTime(20000);
    p.emit('player_state_changed', playingState('b'));
    expect(mod.getPlayerSnapshot().remaining).toBe(30000);
  });

  it('ne met jamais en pause en mode chanson entière', async () => {
    const p = await queued({ timer: 'full' });
    p.getCurrentState.mockImplementation(async () => playingState('a'));
    p.emit('player_state_changed', playingState('a'));
    vi.advanceTimersByTime(120000);
    await mod.pollPosition();
    expect(p.pause).not.toHaveBeenCalled();
  });

  it('ignore l\'échec de la pause automatique', async () => {
    const p = await queued({ timer: '30s' });
    p.pause.mockRejectedValue(new Error('no'));
    p.emit('player_state_changed', playingState('a'));
    vi.advanceTimersByTime(30000);
    p.emit('player_state_changed', playingState('a', { position: 30000 }));
    await Promise.resolve();
    expect(p.pause).toHaveBeenCalled();
  });

  it('ne remet pas en pause après l\'extrait si l\'on relance la lecture', async () => {
    const p = await queued({ timer: '30s' });
    p.emit('player_state_changed', playingState('a'));
    vi.advanceTimersByTime(30000);
    p.emit('player_state_changed', playingState('a', { position: 30000 }));
    expect(p.pause).toHaveBeenCalledOnce();
    p.emit('player_state_changed', playingState('a', { paused: true, position: 30000 }));
    p.emit('player_state_changed', playingState('a', { position: 30500 }));
    vi.advanceTimersByTime(5000);
    p.emit('player_state_changed', playingState('a', { position: 35500 }));
    expect(p.pause).toHaveBeenCalledOnce();
  });
});
