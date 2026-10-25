import { useEffect, useState } from 'react';
import { THEMES, findTheme, sliderBounds } from '../lib/themes.js';
import { createGame, fetchExclusions, fetchReview } from '../lib/games.js';
import { availableCount, buildTracks, getThemePools, loadThemePool, toTrackInput } from '../lib/tracks.js';
import { activate, disconnect, ensurePlayer, isFirefox } from '../lib/player.js';
import { logout } from '../lib/session.js';
import { toast } from '../lib/toast.js';
import Avatar from './Avatar.jsx';

// Nombre de sons d'un thème : un nombre, 'loading' ou 'error'
function countLabel(count) {
  if (typeof count === 'number') return `${count} sons`;
  if (count === 'loading') return '…';
  if (count === 'error') return 'indispo';
  return '';
}

// Groupe de choix exclusifs (boutons radio)
function Choice({ label, value, options, onChange }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

export default function Create({ user, onStart, onProfile, onHistory, onReview }) {
  const [selected, setSelected] = useState([]);
  const [pools, setPools] = useState(getThemePools);
  const [context, setContext] = useState(null);
  const [perTheme, setPerTheme] = useState(5);
  const [timer, setTimer] = useState('full');
  const [start, setStart] = useState('start');
  const [progress, setProgress] = useState(null);

  // Lancer la connexion SDK dès l'affichage de l'écran pour éviter le délai au lancement
  useEffect(() => { ensurePlayer().catch(() => {}); }, []);

  // Sons de la partie précédente (exclus) et liste « à revoir » du compte
  useEffect(() => {
    Promise.all([fetchExclusions(), fetchReview()])
      .then(([excluded, review]) => setContext({ excluded, review }))
      .catch(() => {
        toast('Historique indisponible : la partie précédente ne sera pas exclue');
        setContext({ excluded: new Set(), review: [] });
      });
  }, []);

  function toggleTheme(theme) {
    const willSelect = !selected.includes(theme.id);
    setSelected(s => willSelect ? [...s, theme.id] : s.filter(id => id !== theme.id));
    if (!willSelect || Array.isArray(pools[theme.id]) || pools[theme.id] === 'loading') return;

    // Charge les sons du thème (une seule fois, mis en cache)
    setPools(p => ({ ...p, [theme.id]: 'loading' }));
    loadThemePool(theme)
      .then(pool => setPools(p => ({ ...p, [theme.id]: pool })))
      .catch(e => {
        toast(`⚠️ ${theme.label} : ${e.message}`);
        setPools(p => ({ ...p, [theme.id]: 'error' }));
        setSelected(s => s.filter(id => id !== theme.id));
      });
  }

  // Nombre de sons jouables par thème, une fois connues l'exclusion et la liste « à revoir »
  const counts = Object.fromEntries(Object.entries(pools).map(([id, pool]) => [
    id,
    !Array.isArray(pool) ? pool : context ? availableCount(id, pool, context.excluded, context.review) : 'loading',
  ]));

  const { min, max, limitedBy, pending } = sliderBounds(selected, counts);
  const value = Math.max(min, Math.min(perTheme, max));

  const maxInfo = pending ? 'calcul des sons…'
    : limitedBy ? `max ${max} (${limitedBy.emoji} ${limitedBy.label})` : `max ${max}`;

  async function doCreate() {
    activate();
    setProgress({ label: 'Démarrage…', pct: 0 });
    try {
      const tracks = await buildTracks(selected, value, (label, pct) => setProgress({ label, pct }), context);
      if (!tracks.length) throw new Error('Aucun son trouvé pour ces thèmes.');
      setProgress({ label: 'Lancement…', pct: 95 });
      const gameId = await createGame({ themes: selected, perTheme: value, timer, start }, tracks.map(toTrackInput));
      onStart(tracks, selected.map(id => findTheme(id).emoji).join(' '), {
        gameId, timer, start, reviewUris: new Set(context.review.map(r => r.uri)),
      });
    } catch (e) {
      toast('Erreur : ' + e.message);
      setProgress(null);
    }
  }

  return (
    <div className="screen">
      <header>
        <button className="user-chip" onClick={onProfile} aria-label="Mon profil">
          <Avatar avatar={user.avatar} size={28} />
          <span>{user.username}</span>
        </button>
        <h1>🎵 Melodyo</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => { disconnect(); logout(); }}>Déco.</button>
      </header>
      <div className="home-links">
        <button className="btn btn-ghost btn-sm" onClick={onHistory}>📜 Historique</button>
        <button className="btn btn-ghost btn-sm" onClick={onReview}>⭐ À revoir</button>
      </div>
      {isFirefox && (
        <div className="browser-warning">
          ⚠️ Firefox ne peut pas lire l'audio Spotify (DRM refusé par Spotify). Utilise Chrome, Edge ou Safari.
        </div>
      )}
      <div className="form">
        <div className="form-group">
          <label>
            Thèmes <span className="badge">{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</span>
          </label>
          <div className="theme-grid">
            {THEMES.map(t => (
              <label key={t.id} className={`theme-card${selected.includes(t.id) ? ' selected' : ''}`}>
                <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggleTheme(t)} />
                <span className="theme-emoji">{t.emoji}</span>
                <span className="theme-label">{t.label}</span>
                <span className="theme-count">{countLabel(counts[t.id])}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label>Sons par thème <span className="badge">{maxInfo}</span></label>
          <div className="slider-row">
            <div className="slider-controls">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPerTheme(min)}>Min</button>
              <input type="range" min={min} max={max} value={value}
                onChange={e => setPerTheme(Number(e.target.value))} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPerTheme(max)}>Max</button>
            </div>
            <div className="slider-info">
              <span>{min}</span>
              <span>{value} sons/thème</span>
              <span className="total-count">— {selected.length * value} sons au total</span>
              <span>{max}</span>
            </div>
          </div>
        </div>
        <Choice label="Durée" value={timer} onChange={setTimer}
          options={[['full', 'Chanson entière'], ['30s', 'Extrait 30 s']]} />
        <Choice label="Départ" value={start} onChange={setStart}
          options={[['start', 'Début'], ['middle', 'Milieu']]} />
        <button className="btn btn-green btn-full" disabled={!selected.length || pending || !!progress} onClick={doCreate}>
          ▶ Lancer la partie
        </button>
        {progress && (
          <div className="progress-box show">
            <div className="progress-label">{progress.label}</div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress.pct}%` }}></div></div>
          </div>
        )}
      </div>
    </div>
  );
}
