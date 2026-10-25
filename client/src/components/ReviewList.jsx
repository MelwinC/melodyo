import { useEffect, useState } from 'react';
import { fetchReview, removeFromReview } from '../lib/games.js';
import { toast } from '../lib/toast.js';
import Screen from './Screen.jsx';
import TrackRow from './TrackRow.jsx';

export default function ReviewList({ onBack }) {
  const [tracks, setTracks] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchReview().then(setTracks).catch(() => setError(true));
  }, []);

  async function remove(uri) {
    try {
      await removeFromReview(uri);
      setTracks(list => list.filter(t => t.uri !== uri));
    } catch {
      toast('Une erreur est survenue');
    }
  }

  return (
    <Screen title="À revoir" onBack={onBack}>
      {error && <div className="empty-state">Impossible de charger la liste</div>}
      {tracks?.length === 0 && <div className="empty-state">Aucune chanson à revoir</div>}
      <div className="playlist-list">
        {tracks?.map(t => <TrackRow key={t.uri} track={t} actionLabel="Retirer" onAction={() => remove(t.uri)} />)}
      </div>
    </Screen>
  );
}
