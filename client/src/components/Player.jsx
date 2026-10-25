import { useEffect, useState, useSyncExternalStore } from 'react';
import { findTheme } from '../lib/themes.js';
import { toTrackInput } from '../lib/tracks.js';
import { useReview } from './useReview.js';
import {
  getPlayerSnapshot, subscribePlayer, pollPosition,
  togglePlay, nextTrack, previousTrack, seek, seekBy,
} from '../lib/player.js';

// Décompte de l'extrait : arrondi à la seconde supérieure (0:01 jusqu'au dernier instant)
const fmtCountdown = ms => fmtTime(Math.ceil(ms / 1000) * 1000);

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function Player({ title, status, loadingText, error, onExit, onBack, tracks, reviewUris }) {
  const snap = useSyncExternalStore(subscribePlayer, getPlayerSnapshot);
  const review = useReview(reviewUris ?? new Set());
  const [revealed, setRevealed] = useState(false);
  const [hintShown, setHintShown] = useState(false);

  // Nouveau son : on masque à nouveau la réponse et l'indice
  const uri = snap.sdkTrack?.uri;
  const [shownUri, setShownUri] = useState(uri);
  if (uri !== shownUri) {
    setShownUri(uri);
    setRevealed(false);
    setHintShown(false);
  }

  useEffect(() => {
    if (status !== 'ready') return;
    const id = setInterval(pollPosition, 500);
    return () => clearInterval(id);
  }, [status]);

  function skip(action) {
    setRevealed(false);
    setHintShown(false);
    action();
  }

  function seekClick(e) {
    if (!snap.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(pct * snap.duration);
  }

  const track = snap.sdkTrack;
  const cover = track?.album?.images?.[0]?.url;
  const theme = snap.theme && findTheme(snap.theme.id);
  const current = tracks?.[snap.index] && toTrackInput(tracks[snap.index]);
  const inReview = current && review.has(current.uri);

  return (
    <div className="screen player-screen">
      <header>
        <button className="btn-back" onClick={onExit}>← Quitter</button>
        <h1>{title}</h1>
        <span style={{ width: 60 }}></span>
      </header>

      {status === 'loading' && (
        <div className="player-loading">
          <div className="player-loading-spinner"></div>
          {loadingText}
        </div>
      )}

      {status === 'error' && (
        <div className="player-loading">
          <div style={{ color: 'var(--danger)' }}>{error}</div>
          <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={onBack}>← Retour</button>
        </div>
      )}

      {status === 'ready' && (
        <div className="player-body show">
          <div className="album-wrap">
            {/* Une nouvelle chanson remplace l'élément : aucune transition ne peut montrer la pochette nette */}
            <div key={uri} className={`album-cover${revealed ? '' : ' blur'}`}
              style={cover ? { backgroundImage: `url(${cover})` } : undefined}></div>
            <div className={`album-counter${revealed ? ' hide' : ''}`}>
              {snap.index + 1} / {snap.total || '?'}
            </div>
          </div>

          {snap.remaining != null && <div className="extract-timer">{fmtCountdown(snap.remaining)}</div>}

          <div className={`track-info${revealed ? ' show' : ''}`}>
            <div className="track-artists">{revealed && (track?.artists || []).map(a => a.name).join(', ')}</div>
            <div className="track-name">{revealed && (track?.name || '—')}</div>
          </div>

          <div className="player-controls">
            <button className="ctrl-btn seek-btn" onClick={() => seekBy(-10000)}>-10s</button>
            <button className="ctrl-btn" onClick={() => skip(previousTrack)}>⏮</button>
            <button className="ctrl-btn play" onClick={togglePlay}>{snap.paused ? '▶' : '⏸'}</button>
            <button className="ctrl-btn" onClick={() => skip(nextTrack)}>⏭</button>
            <button className="ctrl-btn seek-btn" onClick={() => seekBy(10000)}>+10s</button>
          </div>

          <div className="timeline-wrap">
            <span className="time-label">{fmtTime(snap.position)}</span>
            <div className="timeline" onClick={seekClick}>
              <div className="timeline-fill"
                style={{ width: snap.duration > 0 ? `${snap.position / snap.duration * 100}%` : '0%' }}></div>
            </div>
            <span className="time-label">{fmtTime(snap.duration)}</span>
          </div>

          <div className="hint-row">
            {hintShown && snap.theme
              ? <div className="hint-text">{theme?.emoji || '💡'} {snap.theme.label}</div>
              : <button className="btn-hint" onClick={() => setHintShown(true)}>💡 Indice : thème</button>}
          </div>

          {!revealed && <button className="btn-reveal" onClick={() => setRevealed(true)}>👁 Révéler</button>}
          {revealed && current && (
            <button className="btn-hint btn-review" aria-pressed={inReview} onClick={() => review.toggle(current)}>
              {inReview ? '✓ À revoir' : '⭐ À revoir'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
