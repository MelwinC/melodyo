import { useState } from 'react';
import { addToReview, removeFromReview } from '../lib/games.js';
import { toast } from '../lib/toast.js';

// Ajout / retrait dans la liste « à revoir » ; replace() recale sur la liste chargée du serveur
export function useReview(initialUris) {
  const [uris, setUris] = useState(initialUris);

  async function toggle({ uri, name, artists, albumImage, themeId }) {
    const inList = uris.has(uri);
    try {
      await (inList ? removeFromReview(uri) : addToReview({ uri, name, artists, albumImage, themeId }));
      setUris(prev => {
        const next = new Set(prev);
        if (inList) next.delete(uri);
        else next.add(uri);
        return next;
      });
      toast(inList ? 'Retirée de la liste à revoir' : 'Ajoutée à la liste à revoir');
    } catch {
      toast('Une erreur est survenue');
    }
  }

  return { has: uri => uris.has(uri), toggle, replace: setUris };
}
