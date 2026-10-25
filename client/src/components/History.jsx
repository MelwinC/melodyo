import { useEffect, useState } from 'react';
import { listGames } from '../lib/games.js';
import { findTheme } from '../lib/themes.js';
import Screen from './Screen.jsx';

const STATUS = { finished: 'Terminée', interrupted: 'Interrompue', playing: 'En cours' };
const formatDate = iso => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export default function History({ onOpen, onBack }) {
  const [games, setGames] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    listGames().then(setGames).catch(() => setError(true));
  }, []);

  return (
    <Screen title="Historique" onBack={onBack}>
      {error && <div className="empty-state">Impossible de charger l&apos;historique</div>}
      {!error && !games && <div className="empty-state">Chargement…</div>}
      {games?.length === 0 && <div className="empty-state">Aucune partie pour l&apos;instant</div>}
      <div className="playlist-list">
        {games?.map(g => (
          <button key={g.id} type="button" className="playlist-item game-item" onClick={() => onOpen(g.id)}>
            <div className="playlist-item-info">
              <div className="playlist-item-name">{g.settings.themes.map(id => findTheme(id).emoji).join(' ')}</div>
              <div className="playlist-item-meta">{formatDate(g.createdAt)} · {g.playedCount}/{g.trackCount} sons</div>
            </div>
            <span className={`badge status-${g.status}`}>{STATUS[g.status]}</span>
          </button>
        ))}
      </div>
    </Screen>
  );
}
