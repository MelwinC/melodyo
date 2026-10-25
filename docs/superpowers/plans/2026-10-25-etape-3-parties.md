# Étape 3 — Options de partie, historique, exclusion, « à revoir », pochettes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque partie lancée est enregistrée en base avec ses réglages et ses chansons. La partie suivante évite les chansons de la précédente. Une liste « à revoir » permanente remet des chansons dans les parties. Deux nouvelles options sont disponibles, le timer (30 s / chanson entière) et le départ (début / milieu). Les pochettes ne se dévoilent plus jamais par accident.

**Architecture:** Migration avec trois tables : `games`, `game_tracks` et `review_tracks`. Une API REST `/api/games` et `/api/review` est réservée au compte connecté. Le client choisit toujours les chansons à partir des playlists, en appliquant l'exclusion et la liste « à revoir » qu'il récupère du serveur. Il enregistre la partie au lancement, marque chaque chanson réellement jouée, puis termine ou interrompt la partie en la quittant. L'extrait de 30 s et le départ au milieu sont gérés par le lecteur à partir de la position du SDK, donc le décompte ne tourne que pendant la lecture. En multi-appareils, les timers passeront côté serveur à l'étape 4.

**Tech Stack:** inchangée (Express, pg, zod, React).

**Spec:** `docs/superpowers/specs/2026-10-25-melodyo-multijoueur-design.md` — objectifs 11 (timer, départ ; l'option correction arrive à l'étape 5 avec les réponses), 15 à 17, 19, et les choix « Partie terminée ou interrompue », « Liste à revoir trop longue », « Bornes du curseur ».

## Global Constraints

- Couverture 100 % partout, sans exclusion.
- Toutes les routes `/api/games*` et `/api/review*` exigent une session (`401 not_logged_in`) et n'agissent que sur les données du compte connecté. Une partie d'un autre compte répond `404 { error: 'not_found' }`.
- Réglages d'une partie (`settings`, validés par zod) :
  - `themes` : 1 à 10 ids de `THEMES` ;
  - `perTheme` : 1 à 50 ;
  - `timer` : `'30s'` ou `'full'` ;
  - `start` : `'start'` ou `'middle'`.

  Valeurs par défaut dans l'UI : `timer: 'full'`, `start: 'start'`, c'est-à-dire le comportement actuel.
- Chanson enregistrée (`TrackInput`, zod) :
  - `uri` : `spotify:track:…`, 100 caractères maximum ;
  - `name`, 300 caractères maximum ;
  - `artists`, une liste de 1 à 20 noms d'au plus 200 caractères ;
  - `albumImage` : https, ou `null` ;
  - `themeId` ;
  - `fromReview` : booléen.

  Au plus 500 chansons par partie.
- Statuts d'une partie : `playing`, `finished`, `interrupted`. Créer une partie passe en `interrupted` toute partie `playing` du même compte.
- Exclusion : les URIs des chansons marquées `played` de la dernière partie créée (statut quelconque) du compte. Les chansons « à revoir » échappent à l'exclusion.
- « À revoir » dans une partie : pour chaque thème, au plus `Math.ceil(perTheme / 2)` chansons de la liste, tirées au hasard, placées en premier et comptées dans le quota du thème.
- Mode « milieu » : départ à `Math.max(0, Math.floor(duration / 2) - (timer === '30s' ? 15000 : 0))`.
- Mode 30 s : la lecture se met en pause quand `position - départ >= 30000`.
- Pochette : flou `blur(48px) brightness(.4)`. La pochette d'une nouvelle chanson ne passe jamais par un état net.

## Review Focus

- On quitte la partie avant la fin (bouton Quitter, onglet fermé) : la partie est enregistrée `interrupted`. Si l'onglet est fermé, la partie reste `playing` et passe `interrupted` au lancement suivant. Ses chansons jouées restent exclues → tests Task 1 et Task 4.
- Liste « à revoir » contenant des chansons d'un thème non choisi : elles ne sont pas jouées → test Task 3.
- Thème dont presque toutes les chansons étaient dans la partie précédente : le curseur se borne au nombre restant (« à revoir » compris), au lieu de proposer un maximum impossible → test Task 3.
- Retour à la chanson précédente en mode 30 s : l'extrait repart à 30 s depuis son point de départ, la chanson n'est pas comptée deux fois comme jouée → test Task 4.
- Une chanson se termine avant 30 s (titre très court) en mode 30 s : rien ne plante, le passage à la suivante est normal → test Task 4.

---

### Task 1: Parties et liste « à revoir » côté serveur

**Files:**
- Create: `migrations/1730000001000_parties.js`, `server/games.js`, `server/review.js`, `server/routes/games.js`, `shared/themes.js` (ids des thèmes, déplacés du client)
- Modify: `server/app.js`, `client/src/lib/themes.js` (réexporte les thèmes de `shared/themes.js`)
- Test: `server/games.test.js`, `server/review.test.js`, `server/routes/games.test.js`, `shared/themes.test.js`

**Interfaces:**
- Produces:
  - Tables :
    - `games(id uuid pk default gen_random_uuid(), host_id uuid not null references users on delete cascade, status text not null default 'playing' check in (...), settings jsonb not null, created_at timestamptz default now(), ended_at timestamptz)`, avec un index sur `(host_id, created_at desc)` ;
    - `game_tracks(game_id uuid references games on delete cascade, position int, uri text, name text, artists jsonb, album_image text, theme_id text, from_review boolean, played boolean default false, primary key(game_id, position))` ;
    - `review_tracks(host_id uuid references users on delete cascade, uri text, name text, artists jsonb, album_image text, theme_id text, added_at timestamptz default now(), primary key(host_id, uri))`.
  - `games.js` :
    - `createGame(pool, hostId, { settings, tracks }): Promise<{ id }>` (transaction : interrompt la partie `playing` puis insère) ;
    - `markPlayed(pool, hostId, gameId, position): Promise<boolean>` (faux si la partie ou la position n'existe pas) ;
    - `endGame(pool, hostId, gameId): Promise<'finished'|'interrupted'|null>` : `finished` si toutes les chansons sont jouées, sinon `interrupted`, et ne modifie que les parties `playing` ;
    - `listGames(pool, hostId): Promise<GameSummary[]>` avec `GameSummary = { id, status, settings, createdAt, endedAt, trackCount, playedCount }`, les 50 plus récentes ;
    - `getGame(pool, hostId, gameId): Promise<GameSummary & { tracks: Track[] }|null>`, où `Track` est un `TrackInput` + `position` + `played` ;
    - `lastGameExclusions(pool, hostId): Promise<string[]>`.
  - `review.js` :
    - `listReview(pool, hostId): Promise<ReviewTrack[]>` (du plus récent au plus ancien) ;
    - `addReview(pool, hostId, track)` (upsert sans doublon) ;
    - `removeReview(pool, hostId, uri)`.
  - Routes :
    - `POST /api/games { settings, tracks }` → `201 { id }`, ou `400 { error: 'invalid_game' }` ;
    - `POST /api/games/:id/played { position }` → `204`, ou `404` ;
    - `POST /api/games/:id/end` → `200 { status }`, ou `404` si la partie n'existe pas ou n'est plus en cours ;
    - `GET /api/games` → `{ games }` ; `GET /api/games/:id` → `{ game }`, ou `404` ;
    - `GET /api/games/exclusions` → `{ uris }` ;
    - `GET /api/review` → `{ tracks }` ;
    - `POST /api/review { track }` → `204` ; `DELETE /api/review { uri }` → `204`.
    - Un `:id` qui n'est pas un UUID → `404`.
  - `shared/themes.js` : `THEMES` (déplacé tel quel) et `isThemeId(id)`.

- [ ] **Step 1: Tests**
  - **Dépôts** :
    - création avec 3 chansons ;
    - une nouvelle partie interrompt l'ancienne `playing` ;
    - `markPlayed` sur une position valide et sur une position inconnue ;
    - `endGame` donne `finished` si toutes les chansons sont jouées, `interrupted` sinon, et `null` pour une partie déjà terminée ;
    - liste triée de la plus récente à la plus ancienne, avec les comptes de chansons ;
    - `getGame` d'un autre compte → `null` ;
    - exclusions : uniquement les chansons jouées de la dernière partie, liste vide sans partie ;
    - « à revoir » : ajout, doublon ignoré, retrait, et listes séparées par compte.
  - **Routes** :
    - 401 sans session ;
    - 400 sur un réglage hors bornes (`perTheme` à 51, `timer: 'x'`, thème inconnu), sur une chanson invalide (URI non Spotify, image en `http:`) et sur plus de 500 chansons ;
    - 404 sur la partie d'un autre compte et sur un id non UUID ;
    - parcours complet : créer, marquer, terminer, lister, détailler ;
    - exclusions ;
    - « à revoir » : ajout, retrait, liste.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %. Commit `feat(server): parties enregistrées et liste à revoir`.

### Task 2: Pochettes et options de lecture (lecteur)

**Files:**
- Modify: `client/src/lib/player.js`, `client/src/components/Player.jsx`, `client/src/style.css`
- Test: `client/src/lib/player.test.js`, `client/src/components/Player.test.jsx`

**Interfaces:**
- Produces:
  - `startQueue(tracks, { timer = 'full', start = 'start', onTrackStart = () => {} } = {})`. À chaque nouvelle chanson détectée :
    - le lecteur se place au départ (mode milieu) ;
    - il mémorise `snapshot.extractStart`, la position de départ ;
    - il appelle `onTrackStart(index)` une seule fois par chanson. Une chanson reprise après un retour arrière n'est pas recomptée, mais son extrait repart de son point de départ.
  - Le snapshot gagne :
    - `timer` ;
    - `extractStart` ;
    - `remaining`, en ms restantes de l'extrait en mode 30 s, `null` en mode `full`.

    `pollPosition` met `remaining` à jour et met en pause quand il atteint 0.
  - Player :
    - affiche le décompte (`0:12`) en mode 30 s ;
    - la pochette est rendue avec `key={uri}`, donc un nouvel élément sans transition ;
    - CSS : la transition du flou ne s'applique que dans le sens du dévoilement.
- [ ] **Step 1: Tests**
  - **player** :
    - mode milieu : `seek(Math.floor(duration / 2))` ; en 30 s, `seek(… - 15000)`, borné à 0 pour une chanson courte ;
    - mode début : pas de `seek` ;
    - `onTrackStart` appelé une fois par chanson, et pas à nouveau après un retour sur une chanson déjà jouée ;
    - en 30 s : pause quand `position - extractStart >= 30000` ; `remaining` décroît ; pas de pause tant que la musique est déjà en pause ;
    - en mode `full` : jamais de pause automatique ;
    - chanson plus courte que 30 s : la suivante démarre normalement.
  - **Player** :
    - décompte affiché en mode 30 s, absent en mode `full` ;
    - au changement de chanson, l'élément de pochette est remplacé (référence différente) et porte `blur`.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %. Commit `feat(player): extrait de 30 s, départ au milieu et pochettes sans flash`.

### Task 3: Création de partie — options, exclusion, « à revoir »

**Files:**
- Create: `client/src/lib/games.js`
- Modify: `client/src/lib/tracks.js`, `client/src/components/Create.jsx`, `client/src/lib/themes.js` (`sliderBounds` reçoit les nombres disponibles)
- Test: `client/src/lib/games.test.js`, `client/src/lib/tracks.test.js`, `client/src/components/Create.test.jsx`, `client/src/lib/themes.test.js`

**Interfaces:**
- Consumes: routes de la Task 1.
- Produces:
  - `games.js` (via `http.request`) : `fetchExclusions(): Promise<Set<string>>`, `fetchReview(): Promise<ReviewTrack[]>`, `createGame(settings, tracks): Promise<string>`, `markPlayed(gameId, position)`, `endGame(gameId)`, `listGames()`, `getGame(id)`, `addToReview(track)`, `removeFromReview(uri)`.
  - `tracks.js` :
    - `toTrackInput(t)` : convertit un objet Spotify en `TrackInput` (`albumImage` = première image ou `null`, `artists` = noms) ;
    - `availableCount(themeId, pool, excluded, review): number` : sons du pool non exclus, plus les « à revoir » du thème qui ne sont pas dans le pool ;
    - `buildTracks(themeIds, perTheme, onProgress, { excluded = new Set(), review = [] } = {})` : par thème, au plus `ceil(perTheme / 2)` « à revoir » tirés au hasard, puis le complément pris dans le pool non exclu, avec `fromReview` renseigné.
  - `Create` :
    - charge les exclusions et la liste « à revoir » au montage ; tant qu'elles ne sont pas chargées, le badge affiche « calcul des sons… » ;
    - les nombres affichés par thème et les bornes du curseur utilisent `availableCount` ;
    - deux groupes d'options : « Durée » (Chanson entière / Extrait 30 s) et « Départ » (Début / Milieu), en boutons radio ;
    - au lancement : `createGame(settings, tracks.map(toTrackInput))`, puis `onStart(tracks, title, { gameId, timer, start })`.
- [ ] **Step 1: Tests**
  - exclusions appliquées ;
  - « à revoir » placées en premier, au plus la moitié du quota (arrondie au supérieur), et jamais pour un thème non choisi ;
  - bornes du curseur réduites par l'exclusion ;
  - options transmises à `onStart` et enregistrées dans `settings` ;
  - échec de `createGame` → toast et bouton réactivé ;
  - un échec du chargement des exclusions ou de la liste ne bloque pas : on continue sans, avec un toast.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %. Commit `feat(client): options de partie, exclusion et chansons à revoir`.

### Task 4: Suivi de partie, historique et liste « à revoir » (écrans)

**Files:**
- Create: `client/src/components/History.jsx`, `client/src/components/GameDetail.jsx`, `client/src/components/ReviewList.jsx`, `client/src/components/TrackRow.jsx`
- Modify: `client/src/App.jsx`, `client/src/components/Player.jsx`, `client/src/components/Create.jsx` (liens), `client/src/style.css`
- Test: un fichier par composant ; `App.test.jsx` et `Player.test.jsx` mis à jour

**Interfaces:**
- Consumes: `games.js` (Task 3), `startQueue` options (Task 2).
- Produces:
  - `App` :
    - `startGame(tracks, title, { gameId, timer, start })` passe `onTrackStart: i => markPlayed(gameId, i)` à `startQueue` ;
    - `exitPlayer` appelle `endGame(gameId)`, puis revient à Create ;
    - nouveaux écrans : `history`, `game` (détail) et `review`.
  - `Player` : après « Révéler », un bouton « ⭐ À revoir » / « ✓ À revoir » ajoute ou retire la chanson courante de la liste. Il est initialisé à partir de la liste chargée au lancement.
  - `History({ onOpen, onBack })` : liste des parties avec date (format `fr-FR`), emojis des thèmes, `played/total sons`, statut (« Terminée » / « Interrompue » / « En cours »). Vide → « Aucune partie pour l'instant ».
  - `GameDetail({ gameId, onBack })` : réglages (durée, départ, sons par thème), puis la liste des chansons via `TrackRow`. Une chanson non jouée est grisée et porte la mention « non jouée ». Chaque ligne a un bouton « À revoir ».
  - `ReviewList({ onBack })` : chansons de la liste, chacune avec un bouton « Retirer ». Vide → « Aucune chanson à revoir ».
  - `Create` : liens « Historique » et « À revoir » sous l'en-tête.
- [ ] **Step 1: Tests** :
  - pour chaque composant, chargement, liste vide, affichage, actions et erreurs (toast) ;
  - `App` : `markPlayed` appelé avec la position, `endGame` appelé en quittant, navigation vers les trois écrans.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %.
- [ ] **Step 3:** Vérification dans Chrome headless en dev, avec la base locale et un compte de test. Créer une partie par l'API, puis vérifier que l'historique l'affiche, que le détail l'affiche, et que l'ajout et le retrait dans « à revoir » fonctionnent.
- [ ] **Step 4:** Commit `feat(client): historique des parties et liste à revoir`.

### Task 5: Revue de sécurité de l'étape 3

**Files:**
- Create: `docs/superpowers/security/etape-3.md`

- [ ] **Step 1:** Revue du diff :
  - accès limité au propriétaire (pas d'IDOR, c'est-à-dire impossible de lire ou modifier la partie d'un autre compte en changeant un id) ;
  - validation des entrées et tailles maximales ;
  - SQL paramétré ;
  - données Spotify affichées par React (pas de `dangerouslySetInnerHTML`) ;
  - `albumImage` limitée à https, compatible avec la CSP `img-src` actuelle (`i.scdn.co`). Les images d'un autre domaine seraient bloquées par la CSP, ce qui reste acceptable ;
  - `npm audit`.
- [ ] **Step 2:** Corriger chaque constat bloquant avec son test. `npm test` → 100 %. Commit `security: revue de l'étape 3`.
