# Revue de sécurité — étape 3 (parties, historique, « à revoir »)

Date : 2026-10-25 · Périmètre : `git diff main..etape-3-parties`

## Vérifié

| Sujet | Constat |
|---|---|
| **Accès aux données d'un autre compte** (IDOR : lire ou modifier une partie en changeant son id) | Chaque requête sur `games`, `game_tracks` et `review_tracks` filtre sur le compte connecté (`host_id`). `markPlayed` passe par une jointure sur `games.host_id`. Les chansons d'une partie ne sont lues qu'après la vérification du propriétaire. Une partie d'un autre compte, ou un id qui n'est pas un UUID, donne `404 not_found`. Ces cas sont testés. |
| **Validation** | zod sur les réglages (thèmes connus, 1 à 50 sons, `timer` et `start` dans une liste fermée) et sur chaque chanson : URI `spotify:track:…`, longueurs bornées, 1 à 20 artistes, pochette en `https://` ou `null`. 1 à 500 chansons par partie. Corps limité à 300 ko pour `/api/games`, 10 ko ailleurs. |
| **SQL** | Requêtes paramétrées. L'insertion groupée des chansons ne construit que des marqueurs `$n`, aucune donnée n'est interpolée. Création en transaction, avec annulation testée. |
| **Affichage** | Titres, artistes et pochettes passent par React (échappement automatique), sans `innerHTML`. Une pochette hors de `i.scdn.co` serait bloquée par la CSP `img-src`. Seul le propriétaire de la partie la voit, donc l'impact serait nul. |
| **Dépendances** | `npm audit` : 0 vulnérabilité. |

## Points ouverts (non bloquants)

- Pas de limite sur le nombre de parties ou de chansons « à revoir » qu'un compte peut enregistrer. Seul un compte connecté peut écrire, mais la base peut grossir.
- Une partie dont l'onglet a été fermé reste « en cours » jusqu'à la partie suivante du même compte, qui l'interrompt.
