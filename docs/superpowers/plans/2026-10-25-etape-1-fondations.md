# Étape 1 — Fondations (serveur testable, PostgreSQL, couverture 100 %) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le serveur testable et modulaire, ajouter PostgreSQL (migrations, healthcheck, prod), et amener tout le code existant à 100 % de couverture imposée par la CI et le pre-commit, sans changer le comportement visible de l'app.

**Architecture:** `server.js` est éclaté en modules ESM sous `server/` autour d'une fabrique `createApp({ config, pool })` testée avec supertest contre un vrai PostgreSQL (embedded-postgres, sans Docker, identique en local, en CI et sous Windows). Les migrations passent par node-pg-migrate au démarrage. Le client est testé sous jsdom avec Testing Library ; le SDK et l'API Spotify sont simulés.

**Tech Stack:** Node 24 (ESM), Express 4, pg, node-pg-migrate 9, embedded-postgres 17, Vitest 5 + @vitest/coverage-v8, supertest, jsdom, @testing-library/react / user-event / jest-dom, React 19, Vite 8, PostgreSQL 17 (prod).

**Spec:** `docs/superpowers/specs/2026-10-25-melodyo-multijoueur-design.md` (étape 1 du découpage « Laissé au builder »).

## Global Constraints

- Couverture 100 % lignes, branches, fonctions et instructions sur `server/**/*.js` et `client/src/**/*.{js,jsx}`. Seuls exclus : fichiers de test, `client/vite.config.mjs`, `eslint.config.mjs`, `vitest.config.mjs`, `scripts/**`, `migrations/**` (exécutées par les tests mais pas instrumentées). Aucun commentaire `istanbul ignore` / `v8 ignore`.
- Le comportement visible ne change pas : mêmes routes (`/login`, `/callback`, `/refresh`, `/spotify/*`), mêmes écrans, même URL de callback par défaut `http://127.0.0.1:8888/callback`.
- Secrets jamais dans le repo : `POSTGRES_PASSWORD` et `DATABASE_URL` de prod vivent dans `~/docker/melodyo/.env` sur le serveur.
- PostgreSQL 17 partout : `postgres:17-alpine` en prod, `embedded-postgres@17.10.0-beta.17` en dev et en test.
- Interface en français ; messages de log existants conservés.
- Chaque tâche se termine par un commit qui passe le hook pre-commit (lint-staged + `npm test`).

## Review Focus

- Base de données indisponible au démarrage : `start()` doit échouer avec un message clair (pas de serveur à moitié démarré) → test dans la Task 3.
- Base qui tombe pendant que le serveur tourne : `GET /healthz` répond 503 au lieu de planter → test dans la Task 3.
- Spotify injoignable (erreur réseau) sur le proxy ou le refresh : réponse JSON 502/400, jamais de crash ni de requête pendante → tests dans la Task 2.
- Corps de requête invalide ou trop gros sur `/refresh` et le proxy : 400/413 propres → tests dans la Task 2.
- SDK Spotify bloqué (bloqueur de pub, réseau) : l'écran de lecture affiche l'erreur de délai au lieu de tourner indéfiniment → test dans la Task 5.

---

### Task 1: Outillage de test et passage en ESM

**Files:**
- Create: `vitest.config.mjs`, `test/pg-global-setup.js`, `test/db.js`, `client/test/setup.js`
- Modify: `package.json` (`"type": "module"`, scripts, devDependencies), `eslint.config.mjs`, `.gitignore`
- Test: les tests existants `client/src/lib/*.test.js` doivent passer sous la nouvelle config

**Interfaces:**
- Produces: projets Vitest `server` (environnement node, `server/**/*.test.js`, globalSetup `test/pg-global-setup.js`) et `client` (jsdom, `client/**/*.test.{js,jsx}`, setupFiles `client/test/setup.js`) ; `testDatabaseUrl(): string` dans `test/db.js` (lit `inject('databaseUrl')`).

- [ ] **Step 1:** Installer `pg node-pg-migrate` en dependencies ; `embedded-postgres@17.10.0-beta.17 supertest jsdom @vitest/coverage-v8 @testing-library/react @testing-library/user-event @testing-library/jest-dom` en devDependencies. Retirer `axios` (remplacé par `fetch` natif à la Task 2).
- [ ] **Step 2:** `package.json` : `"type": "module"` ; scripts `"test": "vitest run --coverage"`, `"test:watch": "vitest"`, `"db": "node scripts/dev-db.js"` ; `"dev": "node --watch-path=server server/main.js"`, `"start": "vite build client && node server/main.js --prod"`.
- [ ] **Step 3:** `test/pg-global-setup.js` : démarre embedded-postgres dans un dossier temporaire sur un port libre, crée la base `melodyo_test`, `provide('databaseUrl', url)`, et l'arrête au teardown. `client/test/setup.js` importe `@testing-library/jest-dom/vitest` et fait `cleanup()` après chaque test.
- [ ] **Step 4:** `vitest.config.mjs` : les deux projets ci-dessus ; coverage provider v8, `include` et `exclude` selon les Global Constraints, **sans seuils pour l'instant** (activés à la Task 7).
- [ ] **Step 5:** `eslint.config.mjs` : `server/**`, `test/**`, `scripts/**` en ESM avec globals node ; globals vitest pour `**/*.test.{js,jsx}`. Ajouter `.data/` et `coverage/` au `.gitignore`.
- [ ] **Step 6:** Lancer `npm test` puis `npm run lint`. Attendu : 11 tests PASS, rapport de couverture affiché, lint OK.
- [ ] **Step 7:** Commit `chore: outillage de test (projets vitest, embedded-postgres, couverture)`.

### Task 2: Serveur modulaire — config, OAuth Spotify, proxy

**Files:**
- Create: `server/config.js`, `server/app.js`, `server/routes/auth.js`, `server/routes/spotify-proxy.js`
- Delete: `server.js` (son contenu est réparti ici et aux Tasks 3–4)
- Test: `server/config.test.js`, `server/routes/auth.test.js`, `server/routes/spotify-proxy.test.js`

**Interfaces:**
- Produces:
  - `loadConfig(env = process.env, argv = process.argv): Config` avec `Config = { prod: boolean, host: string, port: number, spotifyClientId: string, redirectUri: string, databaseUrl: string }`.
  - `createApp({ config, pool }): express.Express` — monte `express.json({ limit: '10kb' })`, `authRouter(config)` et `spotifyProxyRouter()`, désactive `x-powered-by`. N'attache pas le front (Task 4).
  - `authRouter(config): express.Router` (`GET /login`, `GET /callback`, `POST /refresh`) ; `spotifyProxyRouter(): express.Router` (`ALL /spotify/*`).
  - Les appels sortants vers Spotify utilisent `globalThis.fetch` (stubbé dans les tests par `vi.stubGlobal('fetch', vi.fn())`).

Valeurs de `loadConfig` : `prod` = `argv.includes('--prod')` ; `port` = `Number(env.PORT) || 8888` ; `host` = `env.HOST || '127.0.0.1'` ; `spotifyClientId` = `env.SPOTIFY_CLIENT_ID || 'ad428e7422b645b6876c4c6e07ff3ed2'` ; `redirectUri` = `env.REDIRECT_URI || \`http://127.0.0.1:${port}/callback\`` ; `databaseUrl` = `env.DATABASE_URL`, sinon en dev `postgres://postgres:postgres@127.0.0.1:5433/melodyo`, et en prod une erreur `DATABASE_URL manquant`.

- [ ] **Step 1: Tests `config.test.js`** — valeurs par défaut ; surcharge par chaque variable ; `--prod` sans `DATABASE_URL` lève `/DATABASE_URL manquant/` ; `PORT` non numérique retombe sur 8888.
- [ ] **Step 2: Tests `auth.test.js`** (supertest sur `createApp({ config, pool: null })`) :
  - `GET /login` → 302 vers `https://accounts.spotify.com/authorize` avec `client_id`, `redirect_uri`, `code_challenge_method=S256`, un `state` de 32 hex et les 10 scopes actuels ;
  - `GET /callback?error=access_denied` → 302 `/?error=access_denied` ;
  - `GET /callback` avec state inconnu → 302 `/?error=invalid_state` ;
  - flux complet : `/login` puis `/callback?code=c&state=<state>` avec fetch stubbé renvoyant `{ access_token:'a', refresh_token:'r', expires_in:3600 }` → 302 `/?access_token=a&refresh_token=r&expires_in=3600`, et le body envoyé contient `code_verifier` dont le SHA-256 base64url égale le `code_challenge` émis ;
  - le même `state` réutilisé une 2e fois → `invalid_state` ;
  - échange de token qui renvoie 400 ou fetch qui rejette → 302 `/?error=token_exchange_failed` ;
  - `POST /refresh` sans `refresh_token` → 400 `{ error: 'missing_token' }` ; corps non JSON → 400 ; corps > 10 kB → 413 ; succès → 200 avec le JSON Spotify ; Spotify 400 ou fetch qui rejette → 400 `{ error: 'refresh_failed' }`.
  - Le nettoyage des `state` après 10 min est testé avec `vi.useFakeTimers()`.
- [ ] **Step 3: Tests `spotify-proxy.test.js`** :
  - sans en-tête `x-token` → 401 `{ error: 'missing_token' }` ;
  - `GET /spotify/me?market=FR` appelle `https://api.spotify.com/v1/me?market=FR` avec `Authorization: Bearer <token>` et renvoie statut et JSON tels quels ;
  - `PUT` relaie le corps JSON, `GET` n'envoie pas de corps ;
  - réponse Spotify 204 → 204 sans corps ;
  - réponse 4xx → même statut, erreur loggée (`console.error` espionné) ;
  - réponse non JSON (texte vide avec statut 202) → même statut, corps vide ;
  - fetch qui rejette → 502 `{ error: <message> }`.
- [ ] **Step 4:** Lancer `npx vitest run --project server` → FAIL (modules absents).
- [ ] **Step 5:** Implémenter `server/config.js`, `server/app.js` et les deux routeurs en portant la logique de `server.js` (PKCE, `pendingAuth` en `Map` interne au routeur, scopes inchangés), `axios` remplacé par `fetch`. Supprimer `server.js`.
- [ ] **Step 6:** `npx vitest run --project server` → PASS ; couverture 100 % sur ces 4 fichiers.
- [ ] **Step 7:** Commit `refactor(server): modules ESM testables, fetch natif`.

### Task 3: PostgreSQL — pool, migrations, healthcheck, démarrage

**Files:**
- Create: `server/db.js`, `server/routes/health.js`, `server/index.js`, `server/main.js`, `migrations/.gitkeep`, `scripts/dev-db.js`
- Test: `server/db.test.js`, `server/routes/health.test.js`, `server/index.test.js`, `server/main.test.js`

**Interfaces:**
- Consumes: `loadConfig`, `createApp` (Task 2) ; `testDatabaseUrl` (Task 1).
- Produces:
  - `createPool(databaseUrl: string): pg.Pool` ;
  - `runMigrations(databaseUrl: string): Promise<void>` (node-pg-migrate, dossier `migrations/`, table `pgmigrations`, sens `up`) ;
  - `healthRouter(pool): express.Router` avec `GET /healthz` → `200 { ok: true }` si `SELECT 1` réussit, sinon `503 { ok: false }` ;
  - `start({ env = process.env, argv = process.argv } = {}): Promise<{ server: http.Server, pool: pg.Pool, close(): Promise<void> }>` — config, migrations, pool, `createApp`, `attachFrontend` (Task 4), écoute sur `config.host:config.port`, puis log `Melodyo — http://host:port`. Si la base est injoignable, rejette avec `Error('Base de données injoignable : <cause>')` sans écouter de port.
  - `server/main.js` : appelle `start()` ; en cas d'échec, log l'erreur et `process.exit(1)`.
  - `createApp` monte désormais `healthRouter(pool)`.

- [ ] **Step 1: Tests**
  - `db.test.js` : `runMigrations(testDatabaseUrl())` crée `pgmigrations` et est idempotent sur un 2e appel ; `createPool(url).query('SELECT 1')` répond.
  - `health.test.js` : 200 `{ ok: true }` avec un vrai pool ; 503 `{ ok: false }` avec un pool dont `query` rejette.
  - `index.test.js` : `start({ env: { PORT: '0', DATABASE_URL: testDatabaseUrl() }, argv: [] })` écoute, `GET /healthz` → 200, `close()` libère le port et le pool ; avec `DATABASE_URL` vers un port fermé → rejette `/Base de données injoignable/` et aucun serveur n'écoute. `attachFrontend` est mocké (`vi.mock('./frontend.js')`).
  - `main.test.js` : avec `vi.mock('./index.js')`, `start` résolu → appelé une fois ; `start` rejeté → `console.error` appelé et `process.exit(1)` (espionné).
- [ ] **Step 2:** `npx vitest run --project server` → FAIL.
- [ ] **Step 3:** Implémenter les fichiers. `scripts/dev-db.js` démarre embedded-postgres persistant dans `.data/postgres`, port 5433, base `melodyo`, et reste au premier plan jusqu'à Ctrl+C.
- [ ] **Step 4:** `npx vitest run --project server` → PASS, 100 % sur `server/`.
- [ ] **Step 5:** Vérification manuelle : `npm run db` dans un terminal, `npm run dev` dans un autre, `curl -s http://127.0.0.1:8888/healthz` → `{"ok":true}`.
- [ ] **Step 6:** Commit `feat(server): PostgreSQL, migrations et /healthz`.

### Task 4: Front servi par le serveur (Vite en dev, statique en prod)

**Files:**
- Create: `server/frontend.js`
- Test: `server/frontend.test.js`

**Interfaces:**
- Produces: `attachFrontend(app, httpServer, config, { distDir, clientDir } = defaults): Promise<void>`. En prod : `express.static(distDir)` puis fallback SPA `index.html` pour tout GET non intercepté. En dev : `createServer` de Vite en middleware avec `hmr: { server: httpServer }`, `appType: 'spa'`, `root: clientDir`, `configFile: <clientDir>/vite.config.mjs`.

- [ ] **Step 1: Tests** — prod avec un `distDir` temporaire contenant `index.html` et `assets/a.js` : `/assets/a.js` → 200 ; `/nimporte/ou` → 200 avec le contenu de `index.html`. Dev avec `vi.mock('vite')` : `createServer` appelé avec les options ci-dessus et ses `middlewares` montés.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 % sur `server/frontend.js`.
- [ ] **Step 3:** Vérification : `npm run dev` puis modification d'un texte de `Login.jsx` → mise à jour sans rechargement (comme vérifié précédemment).
- [ ] **Step 4:** Commit `feat(server): attache le front (vite dev / statique prod)`.

### Task 5: Client — modules `lib/` à 100 %

**Files:**
- Create: `client/src/lib/hot.js`, `client/src/lib/hot.test.js`, `client/src/lib/spotify.test.js`, `client/src/lib/toast.test.js`, `client/src/lib/player.test.js`
- Modify: `client/src/lib/spotify.js`, `client/src/lib/tracks.js`, `client/src/lib/player.js` (remplacer `if (import.meta.hot) import.meta.hot.accept(...)` par `reloadOnHotUpdate(import.meta.hot)`), `client/src/lib/tracks.test.js` (branches manquantes)

**Interfaces:**
- Produces: `reloadOnHotUpdate(hot, reload = () => location.reload()): void` — si `hot` est défini, `hot.accept(() => reload())`.

- [ ] **Step 1: Tests**
  - `hot.test.js` : `hot` indéfini → rien ; `hot` factice → `accept` appelé, et le callback appelle `reload`.
  - `spotify.test.js` (fetch stubbé, `localStorage` jsdom) : `loadTokens` vrai ou faux ; `saveTokens` écrit les 3 clés `bt_*` et calcule l'expiration à `expires_in - 60` s ; `ensureToken` ne rappelle pas `/refresh` tant que le token est valide ; deux `ensureToken` simultanés sur un token expiré → **un seul** POST `/refresh` ; refresh sans `refresh_token` → `not_logged_in` ; réponse sans `access_token` → `Session expirée…` ; `api()` : 204 → `null`, 200 → JSON, 4xx → `Error(json.error.message)` ou `Erreur Spotify <statut>`, en-tête `x-token` envoyé.
  - `toast.test.js` (fake timers) : `toast('x')` rend `{ msg:'x', visible:true }` et notifie les abonnés ; après 3000 ms → `visible:false` ; un 2e toast relance le minuteur ; le désabonnement fonctionne.
  - `player.test.js` (faux `window.Spotify.Player` émettant les événements, `window.spotifySdkReady` résolu, `api` mocké) :
    - `ensurePlayer` résout sur `ready` et ne crée qu'un seul player pour deux appels ;
    - `initialization_error`, `authentication_error` et `account_error` rejettent avec les messages actuels, puis un nouvel appel retente ;
    - sans `ready` en 20 s (fake timers) → `Délai dépassé…` ;
    - `getOAuthToken` passe le token, ou affiche un toast si le refresh échoue ;
    - 1er `playback_error` → toast « Lecture impossible », 2e → `pause()` et toast DRM ; le compteur repart à zéro quand un état « en lecture, position > 0 » arrive ;
    - `autoplay_failed` → toast ;
    - `startQueue` → `PUT /me/player` puis, après 600 ms, `PUT /me/player/play` avec les URIs ;
    - `player_state_changed` : `null` ignoré ; nouveau morceau trouvé par `uri` ou par `linked_from.uri` → `index` et `theme` mis à jour ; morceau inconnu → `theme: null` et `index` inchangé ;
    - `pollPosition`, `togglePlay` (appelle `activateElement`), `seek`, `seekBy` (bornes 0 et `duration - 1000`), `nextTrack`, `previousTrack`, `pause`, `disconnect`, `activate` : délégués au player, et sans effet tant que le player n'existe pas ;
    - `isFirefox` (via `vi.stubGlobal('navigator', …)` et `vi.resetModules()`).
  - `tracks.test.js` : ajouter une page de playlist qui échoue (le chargement continue), une playlist entière qui échoue (thème vide → erreur), `buildTracks` avec un id de thème inconnu (ignoré), un thème en échec (toast, on continue), et le callback de progression appelé avec `(label, pct)`.
- [ ] **Step 2:** FAIL → modifier les trois modules pour utiliser `reloadOnHotUpdate` → PASS.
- [ ] **Step 3:** `npx vitest run --project client --coverage` → 100 % sur `client/src/lib/**`.
- [ ] **Step 4:** Commit `test(client): couverture complète des modules lib`.

### Task 6: Client — composants et entrée à 100 %

**Files:**
- Test: `client/src/components/Login.test.jsx`, `Toast.test.jsx`, `Create.test.jsx`, `Player.test.jsx`, `client/src/App.test.jsx`, `client/src/main.test.jsx`
- Modify: les composants uniquement si une branche s'avère morte (la supprimer plutôt que de l'ignorer)

**Interfaces:**
- Consumes: `lib/*` mockés via `vi.mock` (signatures existantes).

- [ ] **Step 1: Tests**
  - `Login` : lien `/login` affiché.
  - `Toast` : rend le message et la classe `show` quand `toast()` est appelé.
  - `Create` :
    - cocher un thème déclenche `loadThemePool`, affiche `…` puis `N sons` ;
    - en cas d'échec : `indispo`, thème décoché, toast ;
    - le badge passe de « calcul des sons… » à `max N (emoji label)` ;
    - boutons Min et Max ;
    - le curseur est borné quand le max baisse ;
    - le bouton « Lancer » est désactivé sans thème ou pendant un calcul ;
    - `doCreate` appelle `activate`, la progression s'affiche, puis `onStart(tracks, '📻 …')` ;
    - aucune chanson → toast d'erreur et bouton réactivé ;
    - bandeau Firefox quand `isFirefox` ;
    - « Déco. » → `disconnect`, `localStorage.clear` et `location.reload` (espionnés).
  - `Player` (store du player mocké avec un snapshot contrôlable) :
    - états `loading`, `error` (bouton Retour → `onBack`) et `ready` ;
    - compteur `i / total` ; pochette floutée puis nette après « Révéler » ;
    - nouvel `uri` → réponse et indice re-masqués ;
    - indice : bouton, puis texte `emoji label` ;
    - ⏭ et ⏮ re-masquent et appellent `nextTrack` / `previousTrack` ;
    - ±10 s ; clic sur la timeline → `seek(pct * duration)` (sans effet si la durée vaut 0) ;
    - `pollPosition` toutes les 500 ms en état `ready`, et intervalle nettoyé au démontage ;
    - bouton play/pause selon `paused`.
  - `App` :
    - sans token → Login ;
    - `?access_token=…` → `saveTokens` puis URL nettoyée ;
    - `?error=x` → `alert` (espionné) ;
    - token valide → `/me` OK → Create, `/me` KO → Login ;
    - `onStart` → Player en `loading`, puis `ready` ; erreur de `ensurePlayer` → `error` ;
    - Quitter → `pause` puis Create.
  - `main` : avec un `<div id="app">` et `App` mocké, l'import rend `App` dedans.
- [ ] **Step 2:** `npx vitest run --project client --coverage` → 100 % sur `client/src/**`.
- [ ] **Step 3:** Commit `test(client): couverture complète des composants`.

### Task 7: Déploiement avec PostgreSQL et seuils de couverture

**Files:**
- Modify: `vitest.config.mjs` (seuils 100 sur les 4 métriques), `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, `.husky/pre-commit`
- Create (serveur, hors repo) : `~/docker/melodyo/.env`

**Interfaces:**
- Consumes: `server/main.js`, dossier `migrations/`.

- [ ] **Step 1:** `vitest.config.mjs` : `coverage.thresholds = { lines: 100, branches: 100, functions: 100, statements: 100 }`. `npm test` → PASS. Vérifier qu'un test supprimé localement fait échouer le seuil (puis le restaurer).
- [ ] **Step 2:** `Dockerfile` : copier `server/` et `migrations/` (au lieu de `server.js`) ; `CMD ["node", "server/main.js", "--prod"]`.
- [ ] **Step 3:** `docker-compose.yml` :
  - service `db` en `postgres:17-alpine`, `restart: always`, `POSTGRES_DB=melodyo`, `POSTGRES_USER=melodyo`, `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}` ;
  - volume `pgdata`, healthcheck `pg_isready -U melodyo`, réseau `default` uniquement ;
  - service `app` : `env_file: .env`, `DATABASE_URL` pris dans `.env`, `depends_on: db: condition: service_healthy`, réseaux `default` et `traefik-network`, labels Traefik inchangés.
- [ ] **Step 4:** Sur le serveur, créer `~/docker/melodyo/.env` (droits 600) avec un mot de passe aléatoire de 32 caractères : `POSTGRES_PASSWORD=<pw>` et `DATABASE_URL=postgres://melodyo:<pw>@db:5432/melodyo`. Vérifier que `.env` n'est pas suivi par git sur le serveur.
- [ ] **Step 5:** CI : `npm test` remplace l'étape de tests (couverture et seuils compris, embedded-postgres tourne sur le runner) ; la vérification post-déploiement appelle `https://melodyo.melwinchenu.fr/healthz` et attend `{"ok":true}`. Le pre-commit reste `npx lint-staged` puis `npm test`.
- [ ] **Step 6:** Push sur `main`, suivre le run (`gh run watch --exit-status`). Attendu : check vert, déploiement vert, `/healthz` → `{"ok":true}`, connexion Spotify et lecture OK à la main.
- [ ] **Step 7:** Commit inclus dans le push : `feat: PostgreSQL en prod et seuils de couverture à 100 %`.

### Task 8: Revue de sécurité de l'étape 1

**Files:**
- Modify: selon les constats, à minima `server/app.js` (en-têtes de sécurité)
- Test: `server/app.test.js`

**Interfaces:**
- Produces: en-têtes de sécurité sur toutes les réponses.

- [ ] **Step 1: Tests `app.test.js`** — toute réponse porte :
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` ;
  - une `Content-Security-Policy` qui autorise `script-src 'self' https://sdk.scdn.co`, `img-src 'self' https://i.scdn.co data:`, `connect-src 'self'` (plus `ws:`/`wss:` en dev pour le HMR), `frame-src https://sdk.scdn.co` ;
  - pas de `X-Powered-By`.
- [ ] **Step 2:** Implémenter avec `helmet` (dependency) ; en dev, la CSP inclut ce dont le HMR de Vite a besoin. Vérifier à la main que la lecture Spotify fonctionne encore en dev et en prod (le SDK charge une iframe).
- [ ] **Step 3:** Revue du diff complet de l'étape (`git diff <début-étape>..HEAD`) : injection SQL (requêtes paramétrées uniquement), secrets dans les logs, proxy `/spotify/*` restreint à `api.spotify.com`, dépendances (`npm audit --omit=dev` sans vulnérabilité haute ou critique). Consigner les constats dans `docs/superpowers/security/etape-1.md`, avec l'exposition connue des tokens dans l'URL de `/callback` notée comme traitée à l'étape 2.
- [ ] **Step 4:** Corriger chaque constat bloquant avec son test, puis lancer `npm test` (100 %) et pousser. La CI déploie.
- [ ] **Step 5:** Commit `security: en-têtes HTTP et revue de l'étape 1`.
