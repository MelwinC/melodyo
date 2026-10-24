import { useEffect, useState } from 'react';
import { THEMES, MIN_PER_THEME, MAX_PER_THEME, findTheme } from '../lib/themes.js';
import { buildTracks, getThemeCounts, loadThemePool } from '../lib/tracks.js';
import { activate, disconnect, ensurePlayer, isFirefox } from '../lib/player.js';
import { toast } from '../lib/toast.js';

function logout() {
  disconnect();
  localStorage.clear();
  location.reload();
}

// Nombre de sons d'un thème : un nombre, 'loading' ou 'error'
function countLabel(count) {
  if (typeof count === 'number') return `${count} sons`;
  if (count === 'loading') return '…';
  if (count === 'error') return 'indispo';
  return '';
}

export default function Create({ onStart }) {
  const [selected, setSelected] = useState([]);
  const [counts, setCounts] = useState(getThemeCounts);
  const [perTheme, setPerTheme] = useState(5);
  const [progress, setProgress] = useState(null);

  // Lancer la connexion SDK dès l'affichage de l'écran pour éviter le délai au lancement
  useEffect(() => { ensurePlayer().catch(() => {}); }, []);

  function toggleTheme(theme) {
    const willSelect = !selected.includes(theme.id);
    setSelected(s => willSelect ? [...s, theme.id] : s.filter(id => id !== theme.id));
    if (!willSelect || typeof counts[theme.id] === 'number' || counts[theme.id] === 'loading') return;

    // Compte les sons disponibles du thème (une seule fois, mis en cache)
    setCounts(c => ({ ...c, [theme.id]: 'loading' }));
    loadThemePool(theme)
      .then(pool => setCounts(c => ({ ...c, [theme.id]: pool.length })))
      .catch(e => {
        toast(`⚠️ ${theme.label} : ${e.message}`);
        setCounts(c => ({ ...c, [theme.id]: 'error' }));
        setSelected(s => s.filter(id => id !== theme.id));
      });
  }

  // La borne max du slider = le plus petit nombre de sons disponibles parmi les thèmes sélectionnés
  const pending = selected.some(id => typeof counts[id] !== 'number');
  let max = MAX_PER_THEME;
  let limitedBy = null;
  selected.forEach(id => {
    if (counts[id] < max) { max = counts[id]; limitedBy = findTheme(id); }
  });
  const min = Math.min(MIN_PER_THEME, max);
  const value = Math.max(min, Math.min(perTheme, max));

  const maxInfo = pending ? 'calcul des sons…'
    : limitedBy ? `max ${max} (${limitedBy.emoji} ${limitedBy.label})` : `max ${max}`;

  async function doCreate() {
    if (!selected.length) return;
    activate();
    setProgress({ label: 'Démarrage…', pct: 0 });
    try {
      const tracks = await buildTracks(selected, value, (label, pct) => setProgress({ label, pct }));
      if (!tracks.length) throw new Error('Aucun son trouvé pour ces thèmes.');
      setProgress({ label: 'Lancement…', pct: 95 });
      const title = selected.map(id => findTheme(id)?.emoji || '').join(' ');
      onStart(tracks, title || 'Melodyo');
    } catch (e) {
      toast('Erreur : ' + e.message);
      setProgress(null);
    }
  }

  return (
    <div className="screen">
      <header>
        <span style={{ width: 60 }}></span>
        <h1>🎵 Melodyo</h1>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Déco.</button>
      </header>
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
        <button className="btn btn-green btn-full" disabled={!selected.length || pending || !!progress} onClick={doCreate}>
          ▶ Lancer le Blind Test
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
