# Étape 2 — Comptes, avatars et liaison Spotify côté serveur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Des comptes Melodyo (pseudo, mot de passe, avatar choisi ou envoyé), des sessions par cookie valables sur plusieurs appareils, et la liaison Spotify du créateur stockée côté serveur : plus aucun token Spotify dans l'URL ni dans le `localStorage`.

**Architecture:** Nouvelles tables `users`, `sessions`, `spotify_links` (migration node-pg-migrate). Un middleware charge l'utilisateur depuis le cookie `melodyo_sid` (token aléatoire, seul son SHA-256 est stocké). Les tokens Spotify sont chiffrés (AES-256-GCM) en base ; le proxy `/spotify/*` et le SDK obtiennent un token d'accès via le serveur. Le client gagne un store de session et les écrans Connexion/Inscription, « Relier Spotify » et Profil (avatar).

**Tech Stack:** existant + `zod` (validation), `express-rate-limit` (limites), `sharp` (ré-encodage des avatars), `cookie` (lecture des cookies), `crypto.scrypt` natif (mots de passe).

**Spec:** `docs/superpowers/specs/2026-10-25-melodyo-multijoueur-design.md` (objectifs 1–5, « Session du créateur », « Sessions », « Avatars envoyés »).

## Global Constraints

- Couverture 100 % (lignes, branches, fonctions, instructions) sur `server/**`, `shared/**`, `client/src/**`. Pas de commentaire d'exclusion.
- Pseudo : 3 à 20 caractères `[A-Za-z0-9_.-]`, unique sans tenir compte de la casse, affiché tel que saisi. Mot de passe : 8 à 200 caractères.
- Mots de passe : `crypto.scrypt`, N=16384, r=8, p=1, sel de 16 octets, clé de 64 octets, format `scrypt$16384$8$1$<sel b64>$<hash b64>`, comparaison `timingSafeEqual`.
- Session : cookie `melodyo_sid`, `HttpOnly`, `SameSite=Lax`, `Secure` en prod, `Path=/`, 30 jours. Token de 32 octets aléatoires en base64url ; en base, uniquement son SHA-256 hex.
- Tokens Spotify chiffrés en AES-256-GCM avec `TOKEN_ENCRYPTION_KEY` (64 caractères hex), format `<iv b64>.<tag b64>.<données b64>`. En prod, la clé est obligatoire. En dev et en test, une clé fixe de développement.
- Avatars proposés : liste partagée `shared/avatars.js`. Images envoyées : PNG, JPEG ou WebP, 2 Mo maximum, ré-encodées en WebP 256×256 (recadrage centré), nom `<uuid>.webp` dans `AVATAR_DIR`, servies sous `/avatars/<uuid>.webp`.
- Limites : 20 tentatives de connexion par IP et 10 par pseudo par tranche de 15 min, 10 inscriptions par IP par heure. Réponse `429 { error: 'too_many_requests' }`.
- Réponses d'erreur JSON `{ error: '<code>' }` ; les codes sont listés dans chaque tâche. Les messages affichés à l'utilisateur sont en français, côté client.
- L'URL de callback Spotify reste `/callback` (déclarée dans le dashboard).

## Review Focus

- Deux comptes « Melwin » et « melwin » : le second est refusé (`username_taken`), y compris en cas de course entre deux inscriptions simultanées (contrainte unique en base) → test Task 2.
- Session expirée ou supprimée (déconnexion sur un autre appareil) : l'appareil revient proprement à l'écran de connexion, sans boucle d'erreurs → tests Task 2 (serveur) et Task 5 (client).
- Fichier envoyé qui n'est pas une image (PDF renommé en `.png`, SVG avec script) : refusé `invalid_image`, rien n'est écrit sur le disque → test Task 3.
- Token Spotify révoqué par l'utilisateur côté Spotify : le refresh échoue, la liaison est supprimée, l'app propose de relier Spotify à nouveau au lieu de boucler → tests Task 4 et Task 5.
- Callback Spotify reçu alors que la session Melodyo a expiré entre-temps : redirection `/?error=login_required`, aucun token stocké → test Task 4.

---

### Task 1: Base des comptes — migration, config, mots de passe, chiffrement

**Files:**
- Create: `migrations/1730000000000_comptes.js`, `server/passwords.js`, `server/crypto.js`, `test/factories.js`
- Modify: `server/config.js`, `test/pg-global-setup.js` (applique les migrations une fois), `server/config.test.js`
- Test: `server/passwords.test.js`, `server/crypto.test.js`

**Interfaces:**
- Produces:
  - Tables :
    - `users(id uuid pk default gen_random_uuid(), username text not null, password_hash text not null, avatar_kind text not null default 'preset' check in ('preset','upload'), avatar_value text not null default 'note', created_at timestamptz default now())`, avec un index unique sur `lower(username)` ;
    - `sessions(token_hash text pk, user_id uuid not null references users on delete cascade, created_at timestamptz default now(), expires_at timestamptz not null)` ;
    - `spotify_links(user_id uuid pk references users on delete cascade, spotify_user_id text not null, access_token text not null, refresh_token text not null, expires_at timestamptz not null)`.
  - `hashPassword(password: string): Promise<string>` et `verifyPassword(password: string, stored: string): Promise<boolean>` (faux si le format est inconnu).
  - `encrypt(plain: string, keyHex: string): string` et `decrypt(payload: string, keyHex: string): string` (lève si les données ont été altérées).
  - `Config` gagne :
    - `avatarDir` : env `AVATAR_DIR`, sinon `<racine>/.data/avatars` ;
    - `tokenKey` : env `TOKEN_ENCRYPTION_KEY`, sinon la clé de dev `'0'.repeat(64)`. En prod, une absence lève `TOKEN_ENCRYPTION_KEY manquant`, et une clé qui n'est pas en hex de 64 caractères lève `TOKEN_ENCRYPTION_KEY invalide` ;
    - `trustProxy` : `Number(env.TRUST_PROXY) || 0`.
  - `test/factories.js` :
    - `uniqueName(prefix = 'u'): string`, un pseudo unique ≤ 20 caractères ;
    - `insertUser(pool, { username, password = 'motdepasse' } = {}): Promise<{ id, username }>`.

- [ ] **Step 1: Tests**
  - `passwords.test.js` :
    - le hash suit le format `scrypt$16384$8$1$…` ;
    - deux hash du même mot de passe sont différents ;
    - le bon mot de passe est accepté, un mauvais refusé ;
    - un format inconnu (`'bcrypt$x'`) est refusé.
  - `crypto.test.js` :
    - aller-retour chiffrement/déchiffrement ;
    - deux chiffrements du même texte sont différents ;
    - des données altérées lèvent ;
    - une mauvaise clé lève.
  - `config.test.js` : les nouvelles valeurs par défaut, les surcharges par l'environnement, et les deux erreurs sur `TOKEN_ENCRYPTION_KEY` en prod.
- [ ] **Step 2:** FAIL → implémenter → PASS. La migration crée les trois tables et l'index ; `pg-global-setup.js` appelle `runMigrations` après la création de la base.
- [ ] **Step 3:** `npm test` → 100 %. Commit `feat(server): schéma des comptes, mots de passe et chiffrement`.

### Task 2: Comptes et sessions (API)

**Files:**
- Create: `server/users.js`, `server/sessions.js`, `server/routes/accounts.js`, `server/rate-limits.js`, `test/http.js`
- Modify: `server/app.js` (`trust proxy`, `loadSession`, routeur comptes), `server/config.js` (si besoin)
- Test: `server/users.test.js`, `server/sessions.test.js`, `server/routes/accounts.test.js`

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword`, tables de la Task 1.
- Produces:
  - `users.js` :
    - `createUser(pool, { username, passwordHash }): Promise<User>` (lève `UsernameTakenError` sur violation d'unicité `23505`) ;
    - `findUserByUsername(pool, username): Promise<UserRow|null>` (sans tenir compte de la casse, inclut `password_hash`) ;
    - `findUserById(pool, id): Promise<User|null>` ;
    - `setAvatar(pool, id, { kind, value }): Promise<{ previous: { kind, value } }>`.
  - `User` = `{ id, username, avatar: { kind, value }, spotifyLinked: boolean }`. `spotifyLinked` est vrai si une ligne `spotify_links` existe.
  - `sessions.js` :
    - `createSession(pool, userId, { now = new Date() } = {}): Promise<string>` (renvoie le token en clair) ;
    - `findSessionUserId(pool, token, { now = new Date() } = {}): Promise<string|null>` (ignore les sessions expirées) ;
    - `deleteSession(pool, token): Promise<void>` ;
    - `SESSION_COOKIE = 'melodyo_sid'`, `SESSION_DAYS = 30`.
  - `loadSession(pool)` : middleware qui renseigne `req.user` (`User`) et `req.sessionToken` quand le cookie est valide.
  - `requireUser` : middleware qui répond `401 { error: 'not_logged_in' }` sans `req.user`.
  - `test/http.js` :
    - `testApp(overrides?)` : `createApp` avec la config de dev et un pool sur la base de test ;
    - `signUp(agent, username?, password?)` : inscrit via l'API et renvoie le `User`.
  - Routes :
    - `POST /api/auth/register {username, password}` → `201 { user }` et cookie ; `400 { error: 'invalid_username' | 'invalid_password' }` ; `409 { error: 'username_taken' }` ;
    - `POST /api/auth/login {username, password}` → `200 { user }` et cookie ; `401 { error: 'invalid_credentials' }` (même réponse si le pseudo est inconnu, sans révéler lequel des deux est faux) ;
    - `POST /api/auth/logout` → `204`, supprime la session et efface le cookie ;
    - `GET /api/me` → `200 { user }` ou `401 { error: 'not_logged_in' }`.

- [ ] **Step 1: Tests**
  - **Dépôts** :
    - création d'un compte puis lecture par pseudo, en majuscules comme en minuscules ;
    - doublon « Abc » contre « abc », y compris deux `createUser` lancés en parallèle → un seul réussit, l'autre lève `UsernameTakenError` ;
    - une autre erreur SQL est relancée telle quelle ;
    - session : création, lecture, expiration (`now` après 30 jours → `null`), suppression ;
    - token inconnu → `null`.
  - **Routes** (supertest avec agent, cookies) :
    - inscription : cookie `HttpOnly`, `SameSite=Lax`, `Max-Age` de 30 jours ; `Secure` seulement en prod ;
    - pseudo trop court, trop long ou avec des caractères interdits → `invalid_username` ; mot de passe de 7 ou de 201 caractères → `invalid_password` ;
    - corps non objet → `invalid_username` ;
    - connexion valide → `/api/me` renvoie le compte ;
    - mauvais mot de passe et pseudo inconnu → même `401` ;
    - deux connexions du même compte (deux agents) → deux sessions valides en parallèle ;
    - déconnexion → `/api/me` renvoie `401`, et l'autre session reste valide ;
    - cookie corrompu ou session expirée → `401` sur `/api/me` ;
    - limites : la 21e connexion depuis la même IP → `429`, la 11e tentative sur le même pseudo → `429`, la 11e inscription → `429`. Les limites sont injectées via `testApp({ limits: { … } })` avec des fenêtres réduites.
- [ ] **Step 2:** FAIL → implémenter (`zod` pour les corps, `express-rate-limit` avec `standardHeaders: 'draft-8'`, `app.set('trust proxy', config.trustProxy)`) → PASS, 100 %.
- [ ] **Step 3:** Commit `feat(server): comptes, sessions et limites de tentatives`.

### Task 3: Avatars

**Files:**
- Create: `shared/avatars.js`, `server/routes/avatars.js`, `server/avatar-image.js`
- Modify: `server/app.js`, `vitest.config.mjs` (coverage inclut `shared/**`), `eslint.config.mjs`
- Test: `shared/avatars.test.js`, `server/avatar-image.test.js`, `server/routes/avatars.test.js`

**Interfaces:**
- Produces:
  - `AVATAR_PRESETS: { id, emoji, color }[]`, 12 entrées : `note 🎵 #1db954`, `guitare 🎸 #e67e22`, `micro 🎤 #e84393`, `casque 🎧 #6c5ce7`, `vinyle 💿 #00b894`, `piano 🎹 #fdcb6e`, `batterie 🥁 #d63031`, `saxo 🎷 #0984e3`, `trompette 🎺 #e17055`, `violon 🎻 #a29bfe`, `radio 📻 #00cec9`, `etoile ⭐ #fd79a8`. Plus `isPreset(id): boolean`.
  - `toAvatarImage(buffer): Promise<Buffer>` : WebP 256×256 avec `fit: 'cover'`, sans métadonnées. Lève `InvalidImageError` si `sharp` ne peut pas décoder l'image, ou si le format détecté n'est ni png, ni jpeg, ni webp.
  - Routes (connecté) :
    - `PUT /api/me/avatar { preset }` → `200 { user }` ; `400 { error: 'invalid_preset' }` ;
    - `POST /api/me/avatar` avec en-tête `Content-Type: image/png|image/jpeg|image/webp` et l'image en corps brut (2 Mo max) → `200 { user }` dont l'avatar vaut `{ kind: 'upload', value: '<uuid>.webp' }` ; `400 { error: 'invalid_image' }` ; `413` au-delà de 2 Mo ; `415 { error: 'unsupported_type' }` pour tout autre `Content-Type`.
    - Le fichier envoyé précédemment est supprimé quand on le remplace, que ce soit par un preset ou par une nouvelle image.
  - `GET /avatars/:file` : sert uniquement les noms au format `<uuid>.webp` depuis `config.avatarDir`, en `image/webp` avec `Cache-Control: public, max-age=31536000, immutable`. Tout autre nom → 404.

- [ ] **Step 1: Tests**
  - **Presets** : 12 identifiants uniques ; `isPreset('guitare')` vrai, `isPreset('x')` faux.
  - **Image** : un PNG de 600×300 généré avec sharp donne un WebP de 256×256 sans EXIF. Sont refusés avec `InvalidImageError` :
    - un PDF renommé en image ;
    - un SVG contenant un `<script>` ;
    - un GIF.
  - **Routes** :
    - choix d'un preset ;
    - preset inconnu → 400 ;
    - non connecté → 401 ;
    - envoi d'un PNG : le fichier existe dans `avatarDir` (dossier temporaire) et `GET /avatars/<fichier>` → 200 `image/webp` ;
    - envoi d'un faux PNG → 400, aucun fichier créé ;
    - `text/plain` → 415 ; 2,5 Mo → 413 ;
    - remplacer un avatar envoyé par un preset supprime l'ancien fichier ;
    - `GET /avatars/../package.json` et `GET /avatars/abc.webp` → 404.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %.
- [ ] **Step 3:** Commit `feat(server): avatars proposés et envoyés`.

### Task 4: Liaison Spotify côté serveur

**Files:**
- Create: `server/spotify-links.js`, `server/spotify-auth.js`
- Modify: `server/routes/auth.js` (renommé `server/routes/spotify-auth.js`), `server/routes/spotify-proxy.js`, `server/app.js`
- Delete: route `/login` (Spotify), `POST /refresh`, en-tête `x-token`
- Test: `server/spotify-links.test.js`, `server/routes/spotify-auth.test.js` (remplace `auth.test.js`), `server/routes/spotify-proxy.test.js`

**Interfaces:**
- Consumes: `encrypt` et `decrypt` (Task 1), `requireUser` et `loadSession` (Task 2).
- Produces:
  - `spotify-links.js` :
    - `saveLink(pool, key, userId, { spotifyUserId, accessToken, refreshToken, expiresIn, now = new Date() })` : écrit en upsert, tokens chiffrés, `expires_at = now + expiresIn - 60 s` ;
    - `getLink(pool, key, userId)` : renvoie `{ spotifyUserId, accessToken, refreshToken, expiresAt }` déchiffré, ou `null` ;
    - `deleteLink(pool, userId)`.
  - `spotify-auth.js` :
    - `getAccessToken(pool, config, userId, { now = new Date(), timeoutMs = 10_000 } = {}): Promise<{ accessToken, expiresAt }>` : renvoie le token stocké s'il est valide, sinon le rafraîchit auprès de Spotify et le ré-enregistre, en gardant l'ancien refresh token si Spotify n'en renvoie pas ;
    - deux appels simultanés pour un même utilisateur partagent le même rafraîchissement (`Map` des promesses en cours) ;
    - lève `SpotifyNotLinkedError` sans liaison ; si Spotify répond 400 ou 401, supprime la liaison puis lève `SpotifyRelinkRequiredError` ;
    - une erreur réseau lève une `Error` simple, et la liaison est conservée.
  - Routes :
    - `GET /api/spotify/connect` (connecté, sinon 302 vers `/?error=login_required`) → 302 vers l'autorisation Spotify (PKCE, `state` lié au `userId`, plafond et délai de l'étape 1) ;
    - `GET /callback` :
      - échange le code et lit `GET https://api.spotify.com/v1/me` pour obtenir l'`id` Spotify ;
      - appelle `saveLink`, puis 302 vers `/`, sans token dans l'URL ;
      - si la session de la requête ne correspond plus au `userId` du `state` → `/?error=login_required`, rien n'est stocké ;
      - erreurs → `/?error=access_denied|invalid_state|token_exchange_failed` ;
    - `GET /api/spotify/token` (connecté) → `200 { accessToken, expiresAt }` ; `409 { error: 'spotify_not_linked' }` ; `409 { error: 'spotify_relink_required' }` ; `502 { error: 'spotify_unreachable' }` ;
    - `ALL /spotify/*` (connecté, `401` sinon) : utilise `getAccessToken` pour l'utilisateur de la session. Mêmes codes 409 et 502, mêmes délai, limite de corps et encapsulation des réponses non JSON qu'à l'étape 1.

- [ ] **Step 1: Tests** (fetch stubbé, utilisateurs réels en base) :
  - **Liaison** : aller-retour `saveLink`/`getLink` ; le contenu en base n'est pas le token en clair ; l'upsert remplace la liaison ; `deleteLink`.
  - **getAccessToken** :
    - token valide → aucun appel réseau ;
    - token expiré → rafraîchi et ré-enregistré ;
    - deux appels simultanés → un seul POST vers Spotify ;
    - refresh token absent dans la réponse → l'ancien est conservé ;
    - Spotify 400 → liaison supprimée et `SpotifyRelinkRequiredError` ;
    - erreur réseau → liaison conservée ;
    - aucune liaison → `SpotifyNotLinkedError`.
  - **connect** :
    - non connecté → `/?error=login_required` ;
    - connecté → 302 vers Spotify avec PKCE.
  - **callback** :
    - parcours complet : `/api/me` renvoie `spotifyLinked: true`, la `Location` vaut `/`, et aucun token n'apparaît dans les en-têtes ;
    - session déconnectée entre `connect` et `callback` → `login_required` ;
    - state inconnu ;
    - échec de l'échange ou de `/me` → `token_exchange_failed`.
  - **token** : les trois réponses 409 et le 502.
  - **Proxy** :
    - non connecté → 401 ;
    - connecté mais sans liaison → 409 ;
    - avec liaison → l'appel part avec le bon `Bearer` ;
    - les tests de l'étape 1 (500 sons, HTML, délai, 204) sont repris avec un utilisateur lié.
- [ ] **Step 2:** FAIL → implémenter, supprimer `/login`, `/refresh` et `x-token` → PASS, 100 %.
- [ ] **Step 3:** Commit `feat(server): liaison Spotify stockée côté serveur, chiffrée`.

### Task 5: Client — session, écrans de compte et profil

**Files:**
- Create:
  - `client/src/lib/http.js`, `client/src/lib/session.js` ;
  - `client/src/components/Auth.jsx`, `LinkSpotify.jsx`, `Avatar.jsx`, `Profile.jsx` ;
  - leurs tests.
- Modify: `client/src/lib/spotify.js` (réécrit), `client/src/lib/player.js` (si besoin), `client/src/App.jsx`, `client/src/components/Create.jsx` (en-tête), `client/src/style.css`, les tests existants concernés
- Delete: `client/src/components/Login.jsx` et son test

**Interfaces:**
- Consumes: routes des Tasks 2 à 4, `AVATAR_PRESETS` (`shared/avatars.js`).
- Produces:
  - `http.js` :
    - `request(method, path, body?): Promise<any>` : JSON, cookies same-origin, `204` → `null`. Lève `ApiError { status, code }`, où `code` vaut `json.error` ou `'http_<status>'` ;
    - `uploadImage(path, file: Blob): Promise<any>` : POST avec le `Content-Type` du fichier.
  - `session.js` (store `useSyncExternalStore`) :
    - `getSession(): { status: 'loading'|'anonymous'|'ready', user: User|null }` et `subscribeSession` ;
    - `loadSession()` : sur `401`, passe en `anonymous` ;
    - `register(username, password)`, `login(username, password)`, `logout()` ;
    - `choosePreset(id)`, `uploadAvatar(file)` ;
    - `markSpotifyUnlinked()` (passe `spotifyLinked` à faux) ;
    - `messageFor(code): string`, qui traduit les codes d'erreur en français :
      - `username_taken` → « Ce pseudo est déjà pris » ;
      - `invalid_credentials` → « Pseudo ou mot de passe incorrect » ;
      - `invalid_username` → « Pseudo : 3 à 20 caractères (lettres, chiffres, . _ -) » ;
      - `invalid_password` → « Mot de passe : 8 caractères minimum » ;
      - `too_many_requests` → « Trop de tentatives, réessaie dans quelques minutes » ;
      - `invalid_image` → « Image illisible (PNG, JPEG ou WebP) » ;
      - `unsupported_type` → « Format non supporté (PNG, JPEG ou WebP) » ;
      - `http_413` → « Image trop lourde (2 Mo max) » ;
      - par défaut → « Une erreur est survenue ».
  - `spotify.js` :
    - `ensureToken()` récupère `/api/spotify/token` une seule fois par expiration (appels simultanés partagés) ; `getToken()` ;
    - `api(method, path, body)` appelle `/spotify${path}`, sans en-tête de token ;
    - un `409 spotify_relink_required` ou `spotify_not_linked` appelle `markSpotifyUnlinked()` et lève `Error('Reconnecte ton compte Spotify')`.
  - `Avatar({ avatar, size = 40 })` : preset → pastille colorée avec l'emoji ; upload → `<img src="/avatars/<value>" alt="">`.
  - `Auth` : onglets « Connexion » / « Créer un compte », champs pseudo et mot de passe, messages via `messageFor`.
  - `LinkSpotify` : explication, plus le bouton « Relier mon compte Spotify » (lien vers `/api/spotify/connect`).
  - `Profile({ onBack })` :
    - avatar actuel, grille des 12 presets, bouton « Envoyer une image » (input file `accept="image/png,image/jpeg,image/webp"`) ;
    - erreurs affichées via toast ;
    - un fichier de plus de 2 Mo est refusé côté client avant l'envoi, avec le même message.
  - `App` :
    - `loading` → spinner ; `anonymous` → `Auth` ; `ready` sans Spotify → `LinkSpotify` ; `ready` avec Spotify → `Create` / `Player` / `Profile` ;
    - `?error=` dans l'URL → toast (« Connexion Spotify refusée », « Session expirée, reconnecte-toi », « Échec de la liaison Spotify ») puis URL nettoyée.
  - `Create` : son en-tête affiche l'avatar et le pseudo (bouton vers `Profile`), et « Déco. » appelle `logout()`.

- [ ] **Step 1: Tests** :
  - pour chaque module et chaque composant, les comportements listés ci-dessus ;
  - erreurs serveur affichées en français ;
  - session expirée en cours d'usage (`/api/me` → 401 au rechargement) → `Auth` ;
  - liaison révoquée (`api` → 409) → écran `LinkSpotify` ;
  - `Profile` : upload réussi (avatar mis à jour), upload trop lourd bloqué côté client, preset choisi.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 % sur `client/src/**`.
- [ ] **Step 3:** Vérification dans Chrome headless (dev) : inscription, déconnexion et connexion fonctionnent ; changement d'avatar ; l'écran « Relier Spotify » s'affiche.
- [ ] **Step 4:** Commit `feat(client): comptes, profil et liaison Spotify`.

### Task 6: Déploiement et revue de sécurité de l'étape 2

**Files:**
- Modify: `docker-compose.yml` (volume `avatars:/app/data/avatars`, `AVATAR_DIR=/app/data/avatars`, `TRUST_PROXY=2`), `Dockerfile` (copier `shared/` dans les deux étapes)
- Create: `docs/superpowers/security/etape-2.md` ; sur le serveur, ajouter `TOKEN_ENCRYPTION_KEY` (64 hex aléatoires) à `~/docker/melodyo/.env`

- [ ] **Step 1:** Modifier le Dockerfile et le Compose. Ajouter la clé au `.env` du serveur, sans l'afficher. Construire et lancer l'image de la branche dans une pile isolée sur le serveur, puis vérifier : inscription via `curl`, `GET /api/me` avec le cookie, envoi d'un PNG d'avatar et `GET /avatars/…` → 200.
- [ ] **Step 2:** Revue du diff de l'étape :
  - requêtes SQL toutes paramétrées ;
  - aucun token Spotify ni mot de passe dans les logs, les URL ou les réponses, hormis `/api/spotify/token` pour son propriétaire ;
  - cookies ;
  - CSRF : `SameSite=Lax`, et les corps JSON ou images exigent un pré-contrôle CORS ;
  - fichiers envoyés ;
  - limites ;
  - `npm audit`.

  Consigner les constats dans `docs/superpowers/security/etape-2.md`, corriger chaque constat bloquant avec son test.
- [ ] **Step 3:** `npm test` → 100 %. Commit `security: revue de l'étape 2`.
