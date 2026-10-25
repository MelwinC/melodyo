# Revue de sécurité — étape 2 (comptes, avatars, liaison Spotify)

Date : 2026-10-25 · Périmètre : `git diff main..etape-2-comptes`

## Ce que l'étape corrige

- **Tokens Spotify hors du navigateur** (constat reporté depuis l'étape 1) :
  - plus de `/?access_token=…` dans l'URL ni de `localStorage` ;
  - les tokens sont stockés côté serveur, chiffrés en AES-256-GCM avec une clé présente uniquement dans `.env` sur le serveur ;
  - le navigateur ne reçoit que le token d'accès de courte durée nécessaire au SDK (`GET /api/spotify/token`, propriétaire seulement).
- **Limites de tentatives** (constat reporté depuis l'étape 1) :
  - connexion : 20 par IP et 10 par pseudo par tranche de 15 min, seuls les échecs comptent ;
  - inscription : 10 par IP et par heure.

## Vérifié

| Sujet | Constat |
|---|---|
| **Mots de passe** | scrypt (N=16384, r=8, p=1, sel de 16 octets), comparaison en temps constant. Un pseudo inconnu passe aussi par un hash factice : même réponse et même durée qu'un mauvais mot de passe, ce qui ne révèle pas si le pseudo existe. |
| **Sessions** | Token de 32 octets aléatoires ; seul son SHA-256 est en base. Cookie `HttpOnly`, `SameSite=Lax`, `Secure` en prod, 30 jours. Nouveau token à chaque connexion. La déconnexion supprime la session en base. Vérifié dans Chrome : cookie illisible par JavaScript, `localStorage` vide. |
| **CSRF** | Les écritures exigent un corps JSON ou image, que le navigateur ne peut pas envoyer d'un autre site sans pré-contrôle CORS. Le cookie `Lax` n'est pas envoyé sur un POST venant d'un autre site. Le `callback` Spotify vérifie que la session correspond au compte qui a lancé la liaison, ce qui empêche d'injecter le Spotify d'un attaquant dans le compte d'une victime. |
| **SQL** | Toutes les requêtes sont paramétrées. La seule interpolation est une liste de colonnes constante (`users.js`). |
| **Avatars envoyés** | PNG, JPEG ou WebP, 2 Mo maximum, au plus 4096×4096 pixels (bombe de décompression). Image entièrement ré-encodée en WebP 256×256, métadonnées retirées. SVG, GIF et PDF sont refusés. Nom de fichier généré (UUID). La route de lecture n'accepte que le format `<uuid>.webp`, ce qui empêche de remonter l'arborescence. Le client réduit l'image avant l'envoi. |
| **Logs** | Ni mot de passe ni token journalisé. Les erreurs Spotify sont journalisées par statut ou par message. |
| **Erreurs** | Toute erreur non prévue donne `500 { error: 'server_error' }`. Avant, une erreur de base laissait la requête sans réponse (Express 4). |
| **Dépendances** | `npm audit` : 0 vulnérabilité. |

## Points ouverts (non bloquants)

- **`TRUST_PROXY=2`** fait confiance aux deux derniers sauts (Cloudflare puis Traefik). Une requête envoyée directement à l'IP du serveur, sans passer par Cloudflare, peut fournir un faux `X-Forwarded-For` et contourner les limites par IP. La limite par pseudo, elle, tient toujours. Correctif possible : n'accepter que les IP Cloudflare dans Traefik.
- **Sessions expirées** : elles ne sont jamais purgées de la table. Elles sont sans effet, mais la table grossit. À purger périodiquement.
- **Pas de récupération de mot de passe** : voulu par le spec, puisqu'aucun e-mail n'est collecté.
