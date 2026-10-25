# Revue de sécurité — étape 6 (statistiques)

Date : 2026-10-26 · Périmètre : `git diff main..etape-6-stats`

## Vérifié

| Sujet | Constat |
|---|---|
| **Accès** | `GET /api/me/stats` exige une session et ne calcule que pour le compte connecté (`req.user.id`). Il n'existe pas de route pour consulter les stats d'un autre joueur. |
| **Données renvoyées** | Uniquement des agrégats du compte : compteurs, pourcentages, rangs, et par thème des nombres de chansons et de bonnes réponses. Aucun nom ni aucune réponse d'un autre joueur. Le rang d'une partie révèle seulement la place du joueur. |
| **SQL** | Deux requêtes entièrement paramétrées (`$1`, tableaux typés via `unnest($1::uuid[], $2::uuid[])`), sans interpolation. |
| **Profil sans Spotify** | Le profil est désormais accessible aux comptes sans Spotify. Il ne permet que de changer son avatar et de lire ses propres stats. |
| **Dépendances** | `npm audit` : 0 vulnérabilité. |

## Points ouverts (non bloquants)

- Les stats sont recalculées à chaque ouverture du profil. Le coût est raisonnable pour un usage entre amis, mais une table de cache serait à prévoir si l'historique devient très volumineux.
