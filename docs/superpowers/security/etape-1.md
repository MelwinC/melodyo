# Revue de sécurité — étape 1 (fondations)

Date : 2026-10-25 · Périmètre : `git diff main..etape-1-fondations` (serveur modulaire, PostgreSQL, front, CI, Docker)

## Corrigé dans cette étape

| Constat | Correctif | Test |
|---|---|---|
| Aucun en-tête de sécurité HTTP | `helmet` : CSP stricte en prod (scripts `self` + `sdk.scdn.co`, iframe `sdk.scdn.co`, images `i.scdn.co`, connexions `self`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, HSTS | `server/app.test.js` |
| Script inline dans `index.html` (incompatible avec une CSP stricte) | déplacé dans `client/public/sdk-ready.js` | vérifié dans Chrome headless : SDK chargé, iframe créée, 0 violation CSP |
| `/login` en rafale : chaque appel garde un `state` 10 min en mémoire, sans limite | plafond de 1000 connexions en attente, les plus anciennes sont évincées | `auth.test.js` › limite des connexions en attente |
| Corps JSON invalide ou énorme : page d'erreur HTML d'Express | limite 10 kB, réponses JSON 400/413 | `auth.test.js` |
| Spotify injoignable : exception non gérée possible | proxy → 502 JSON, refresh → 400 JSON | `spotify-proxy.test.js`, `auth.test.js` |
| Le code de sortie de Vitest était forcé à 0 (seuil de couverture non bloquant) | PostgreSQL de test dans un processus séparé | vérifié : test retiré → `npm test` sort en 1 |

## Vérifié sans constat

- **SQL** : une seule requête (`SELECT 1`), aucune entrée utilisateur.
- **Dépendances** : `npm audit` → 0 vulnérabilité (prod et dev).
- **Proxy `/spotify/*`** : l'hôte est fixé à `api.spotify.com/v1`, et le chemin commence toujours par `/`. Il ne peut donc pas viser un autre hôte. Il n'utilise que le token fourni par l'appelant.
- **Logs** : ni token ni mot de passe journalisé (chemins Spotify sans query, messages d'erreur Spotify).
- **Base de prod** : pas de port exposé sur l'hôte (réseau Docker interne). Mot de passe aléatoire dans `~/docker/melodyo/.env` (droits 600), fichier ignoré par git.

## Connu, traité à l'étape 2

- Les tokens Spotify transitent par l'URL de retour (`/?access_token=…`). Ils restent visibles dans l'historique du navigateur. Ils passeront côté serveur avec les comptes et les sessions (spec, « Session du créateur »).
- Aucune limitation de débit sur les routes. À ajouter avec les comptes (connexion, accès aux rooms).
