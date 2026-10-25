import { useEffect, useState } from 'react';
import { fetchReview, getGame } from '../lib/games.js';
import Screen from './Screen.jsx';
import TrackRow from './TrackRow.jsx';
import { useReview } from './useReview.js';

const describe = ({ timer, start, perTheme }) => [
  timer === '30s' ? 'Extrait 30 s' : 'Chanson entière',
  start === 'middle' ? 'Départ au milieu' : 'Départ au début',
  `${perTheme} sons/thème`,
].join(' · ');

export default function GameDetail({ gameId, onBack }) {
  const [game, setGame] = useState(null);
  const [error, setError] = useState(false);
  const review = useReview(new Set());
  const { replace } = review;

  useEffect(() => {
    Promise.all([getGame(gameId), fetchReview()])
      .then(([g, list]) => {
        setGame(g);
        replace(new Set(list.map(t => t.uri)));
      })
      .catch(() => setError(true));
  }, [gameId, replace]);

  return (
    <Screen title="Partie" onBack={onBack}>
      {error && <div className="empty-state">Partie introuvable</div>}
      {game && (
        <>
          <p className="game-settings">{describe(game.settings)}</p>
          <div className="playlist-list">
            {game.tracks.map(t => (
              <TrackRow key={t.position} track={t} played={t.played} actionLabel="⭐ À revoir"
                actionPressed={review.has(t.uri)} onAction={() => review.toggle(t)} />
            ))}
          </div>
        </>
      )}
    </Screen>
  );
}
