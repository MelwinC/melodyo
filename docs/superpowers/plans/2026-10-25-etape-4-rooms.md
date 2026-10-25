# Étape 4 — Rooms en temps réel, participants et réponses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le créateur ouvre une room qui dure toute la soirée. Les participants la rejoignent par QR code, lien ou code, avec leur compte ou en invité. Ils suivent la partie en direct (chanson n/N, temps restant pour répondre) et saisissent titre et artiste, modifiables jusqu'à la fin de la manche. Le serveur est la seule source de vérité pour les manches et leurs délais.

**Architecture:**
- **Données** : tables `rooms`, `participants` et `answers`, plus `games.room_id`. Les réponses sont en base dès leur saisie.
- **Temps réel** : un serveur WebSocket (`ws`) sur `/ws`, attaché au serveur HTTP. Authentification par le cookie de session (créateur et comptes) ou par un cookie d'invité propre à la room.
- **Hub de room** (`server/rooms/hub.js`) : il tient en mémoire l'état des manches (ouverte/fermée, échéance, pause), applique les événements du créateur et les réponses, et diffuse un état par destinataire.
  - Le créateur reçoit tout.
  - Un participant ne reçoit jamais titre, artiste ni pochette.
- **Rôle de l'appareil principal** : il annonce chaque chanson qui démarre, ainsi que les pauses et reprises. Le serveur en déduit l'échéance de la manche.
- **Correction et scores** : étape 5. Ici, une manche fermée verrouille simplement les réponses.

**Tech Stack:** existant + `ws` 8 (serveur WebSocket), `qrcode` 1.5 (QR code côté client, en data URL).

**Spec:** `docs/superpowers/specs/2026-10-25-melodyo-multijoueur-design.md` — objectifs 3, 4, 6 à 10, 13, et les choix « Arrivée en cours de partie », « Reconnexion », « Partie sans participant », « Temps réel », « Pause et avance rapide ».

## Global Constraints

- Couverture 100 %, sans exclusion.
- **Code de room** : 6 caractères tirés de l'alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, sans 0/O ni 1/I/L. Il est unique parmi les rooms ouvertes. Lien : `https://<hôte>/r/<CODE>`. La saisie ignore la casse et les espaces.
- **Une room ouverte par créateur** : `POST /api/rooms` renvoie la room ouverte existante ou en crée une. Elle reste ouverte jusqu'à « Fermer la room ».
- **Participant** :
  - avec un compte : un seul participant par compte et par room (unicité `room_id` + `user_id`) ; son nom affiché est son pseudo ;
  - invité : nom de 1 à 20 caractères (espaces au début et à la fin retirés), plus un token de 32 octets dont seul le SHA-256 est stocké, posé en cookie `HttpOnly` `SameSite=Lax` nommé `melodyo_guest_<CODE>`, `Path=/`, 7 jours.
- **Une manche**, identifiée par la position de la chanson dans la partie :
  - en mode `'30s'`, elle se ferme 90 000 ms après son ouverture ;
  - en mode `'full'`, elle se ferme après `durationMs` de lecture, envoyé par l'appareil principal (durée restante depuis le point de départ) ;
  - le délai ne s'écoule pas pendant une pause ;
  - une nouvelle chanson, ou le retour sur une précédente, ferme la manche en cours et (ré)ouvre celle de cette position avec un délai complet.
- **Réponse** : titre et artiste de 0 à 100 caractères chacun (espaces au début et à la fin retirés). Elle n'est acceptée que si la manche de cette position est ouverte. La dernière version enregistrée compte.
- **Messages WebSocket** : du JSON de 4 Ko au plus (`maxPayload`), validés par zod. Un message invalide est ignoré, avec un `{ type: 'error', error: 'invalid_message' }` en retour.
- **Connexions** : un ping toutes les 30 s ferme les connexions mortes. Une connexion depuis une `Origin` différente de l'hôte de la requête est refusée (403).
- **Reconnexion du client** : nouvelle tentative 1 s, 2 s, 4 s… jusqu'à 10 s entre deux essais, indéfiniment. Après chaque reconnexion, il renvoie `hello`.
- **Joindre une room** : au plus 30 tentatives par IP par tranche de 10 min (`CLIENT_IP_HEADER` pris en compte), réponse `429 too_many_requests`.
- **Ce qu'un participant ne reçoit jamais** : `name`, `artists`, `albumImage` ou `uri` d'une chanson, sous aucune forme. Un test vérifie que ces clés n'apparaissent dans aucun message envoyé à un participant.

## Review Focus

- **Téléphone mis en veille pendant une manche** : à la reconnexion, le participant retrouve la manche en cours, sa réponse déjà saisie et le temps restant exact → tests Task 3, Task 4 et Task 6.
- **Le créateur recharge sa page ou perd le réseau en pleine partie** : à la reconnexion, son lecteur renvoie la chanson en cours et le serveur reprend la manche, sans perdre les réponses → tests Task 3 et Task 5.
- **Deux appareils pour un même compte**, PC créateur et téléphone joueur : le téléphone est un participant et n'a pas les droits du créateur. Le PC reste créateur → test Task 4.
- **Code de room tapé en minuscules, avec un espace, ou code d'une room fermée** : la saisie est normalisée, et une room fermée ou inconnue donne un message clair « Room introuvable » → tests Task 2 et Task 6.
- **Réponse envoyée juste après la fermeture de la manche** (latence réseau) : elle est refusée proprement, et le participant voit « Réponses verrouillées » sans perdre ce qu'il avait déjà enregistré → tests Task 3 et Task 6.

---

### Task 1: Schéma et dépôts des rooms

**Files:**
- Create: `migrations/1730000002000_rooms.js`, `server/rooms/repo.js`, `server/rooms/code.js`
- Modify: `server/games.js` (`createGame` accepte `roomId`)
- Test: `server/rooms/repo.test.js`, `server/rooms/code.test.js`, `server/games.test.js`

**Interfaces:**
- Produces:
  - Tables :
    - `rooms(id uuid pk, code text not null, host_id uuid not null references users on delete cascade, created_at timestamptz default now(), closed_at timestamptz)`, avec un index unique partiel sur `code` (`WHERE closed_at IS NULL`) et un autre sur `host_id` (`WHERE closed_at IS NULL`) ;
    - `participants(id uuid pk, room_id uuid not null references rooms on delete cascade, user_id uuid references users on delete cascade, guest_name text, guest_token_hash text, joined_at timestamptz default now(), check (user_id is not null or guest_name is not null))`, avec un index unique sur `(room_id, user_id)` ;
    - `answers(game_id uuid references games on delete cascade, position int, participant_id uuid references participants on delete cascade, title text not null default '', artist text not null default '', updated_at timestamptz default now(), primary key (game_id, position, participant_id))`.
    - `games` gagne `room_id uuid references rooms`.
  - `code.js` :
    - `generateRoomCode(random = crypto.randomInt): string` ;
    - `normalizeRoomCode(input): string|null` : majuscules, retire les espaces, `null` si le résultat ne fait pas 6 caractères de l'alphabet.
  - `repo.js` :
    - `openRoomFor(pool, hostId): Promise<Room>`, où `Room = { id, code, hostId }` : renvoie la room ouverte du créateur ou en crée une, avec une nouvelle tentative sur collision du code (5 essais) ;
    - `closeRoom(pool, hostId)` ;
    - `findOpenRoomByCode(pool, code): Promise<Room & { hostName }|null>` ;
    - `joinAsUser(pool, roomId, userId): Promise<Participant>` : idempotent, renvoie le participant existant si le compte a déjà rejoint ;
    - `joinAsGuest(pool, roomId, name): Promise<{ participant, token }>` ;
    - `findParticipant(pool, roomId, { userId, guestToken }): Promise<Participant|null>` ;
    - `listParticipants(pool, roomId): Promise<Participant[]>` (ordre d'arrivée) ;
    - `saveAnswer(pool, { gameId, position, participantId, title, artist })` (upsert) ;
    - `getAnswers(pool, gameId, position): Promise<Map<participantId, { title, artist }>>` ;
    - `getAnswersOf(pool, gameId, participantId): Promise<Map<position, { title, artist }>>`.
  - `Participant = { id, name, avatar: { kind, value }, userId: string|null }`. Pour un invité, l'avatar est `{ kind: 'preset', value: 'note' }`.
  - `createGame(pool, hostId, { settings, tracks, roomId = null })`.
- [ ] **Step 1: Tests**
  - **Code** : le code généré suit l'alphabet sur 6 caractères ; la normalisation donne `' ab c2d3 '` → `'ABC2D3'`, `'abc'` → `null`, `'ABC0D3'` → `null`.
  - **Room** :
    - `openRoomFor` renvoie deux fois la même room ;
    - après `closeRoom`, une nouvelle room avec un autre id ;
    - collision du code : avec un générateur injecté qui renvoie d'abord le code d'une room ouverte, la room est quand même créée ;
    - `findOpenRoomByCode` renvoie le pseudo du créateur, et `null` pour une room fermée ou un code inconnu.
  - **Participants** :
    - `joinAsUser` est idempotent ;
    - `joinAsGuest` renvoie un token, et seul son hash est en base ;
    - `findParticipant` par compte et par token, et `null` pour un mauvais token ou pour le token d'une autre room ;
    - `listParticipants` avec l'avatar du compte.
  - **Réponses** : upsert, puis lectures par manche et par participant.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %. Commit `feat(server): rooms, participants et réponses (schéma)`.

### Task 2: API REST des rooms

**Files:**
- Create: `server/routes/rooms.js`
- Modify: `server/routes/games.js` (`roomId` dans le corps de `POST /api/games`), `server/rate-limits.js` (`joinPerIp`), `server/app.js`
- Test: `server/routes/rooms.test.js`, `server/routes/games.test.js`

**Interfaces:**
- Consumes: le dépôt de la Task 1.
- Produces:
  - `POST /api/rooms` (connecté) → `200 { room: { id, code } }` ;
  - `POST /api/rooms/close` (connecté) → `204` ;
  - `GET /api/rooms/:code` (public) → `200 { room: { code, hostName } }`, ou `404 { error: 'room_not_found' }` ;
  - `POST /api/rooms/:code/join { guestName? }` (public) :
    - connecté et sans `guestName` → participant lié au compte ;
    - sinon, invité avec le cookie de la room ;
    - → `200 { participant }` ;
    - `400 { error: 'invalid_name' }`, `404 room_not_found`, `429` ;
  - `POST /api/games` accepte `roomId` (UUID optionnel), qui doit être la room ouverte du créateur, sinon `400 invalid_game`.
- [ ] **Step 1: Tests**
  - création et réutilisation de la room ;
  - fermeture ;
  - `GET` avec un code en minuscules et des espaces ;
  - room fermée → 404 ;
  - rejoindre avec un compte : idempotent, et le cookie de session suffit ;
  - rejoindre en invité : nom vide → 400, nom de 21 caractères → 400 ; le cookie `melodyo_guest_<CODE>` est `HttpOnly` avec `Max-Age` 604800 ;
  - limite de tentatives → 429 ;
  - `POST /api/games` avec la room d'un autre compte → 400, avec sa propre room → 201 et `room_id` enregistré.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %. Commit `feat(server): API des rooms`.

### Task 3: Hub de room (manches, délais, diffusion)

**Files:**
- Create: `server/rooms/clock.js`, `server/rooms/hub.js`
- Test: `server/rooms/clock.test.js`, `server/rooms/hub.test.js`

**Interfaces:**
- Consumes: le dépôt de la Task 1, `getGame` (étape 3).
- Produces:
  - **`clock.js`** (pur) :
    - `openClock(now, durationMs) → { durationMs, startedAt: now, pausedAt: null, elapsedBeforePause: 0 }` ;
    - `pauseClock(c, now)` et `resumeClock(c, now)` ;
    - `remainingMs(c, now)` : jamais négatif ;
    - `isPaused(c)`.
  - **`hub.js`**, `createHub({ pool, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout })`. Il renvoie :
    - `connect(roomId, conn)`, avec `conn = { role: 'host'|'player', participantId?, send(msg) }` ; à la connexion, envoie l'état courant ;
    - `disconnect(roomId, conn)` ;
    - `hostEvent(roomId, event)`, avec `event` parmi :
      - `{ type: 'game:start', gameId }` ;
      - `{ type: 'round:start', position, durationMs }` ;
      - `{ type: 'playback', paused }` ;
      - `{ type: 'game:end' }` ;
    - `answer(roomId, participantId, { position, title, artist }) → Promise<'saved'|'closed'>` ;
    - `participantsChanged(roomId)` : appelé par la route `join`, il rediffuse la liste.
  - **État envoyé** (`{ type: 'state', ... }`) :
    - à tous :
      - `participants: [{ id, name, avatar, connected }]` ;
      - `game: null | { id, total, timer }` ;
      - `round: null | { position, status: 'open'|'closed', remainingMs, paused }` ;
    - au créateur, en plus : `answered: participantId[]` (qui a une réponse non vide pour la manche en cours) ;
    - au participant, en plus : `you: { id, answer: { title, artist }|null }`, sa réponse pour la manche en cours.

    Le créateur ne reçoit pas les réponses elles-mêmes à cette étape : la correction arrive à l'étape 5.
  - **Règles** :
    - `round:start` ferme la manche ouverte et ouvre celle de `position`, avec le délai donné (en `'30s'` : 90 000 ms, quel que soit `durationMs`) ;
    - l'échéance déclenche la fermeture et une diffusion ;
    - `playback` met en pause ou relance l'horloge et le minuteur ;
    - `game:end` ferme la manche et met `game` à `null` ;
    - une connexion du créateur sans partie en mémoire, ou après un redémarrage du serveur, attend son `round:start` de reprise.
- [ ] **Step 1: Tests**
  - **clock** : `remainingMs` qui décroît, la pause qui le fige, la reprise, jamais négatif.
  - **hub**, avec une vraie base et `setTimer` / `now` simulés :
    - état initial à la connexion ;
    - `game:start` puis `round:start` → `round.status` vaut `open` et `remainingMs` vaut 90 000 en 30 s, ou `durationMs` en mode full ;
    - l'échéance ferme la manche et diffuse ;
    - pause : temps figé et minuteur annulé ; reprise : minuteur relancé avec le temps restant ;
    - réponse pendant la manche → `'saved'`, et le créateur voit l'id dans `answered` ;
    - réponse après la fermeture → `'closed'`, sans écrasement ;
    - réponse sur une autre position → `'closed'` ;
    - retour sur une manche précédente : rouverte avec un délai complet, et la réponse déjà saisie se retrouve dans `you.answer` ;
    - reconnexion d'un participant : il retrouve sa réponse et le temps restant ;
    - `game:end` ;
    - aucun message envoyé à un participant ne contient `name`, `artists`, `albumImage` ni `uri` (parcours récursif des clés de tous les messages) ;
    - un participant déconnecté apparaît `connected: false` ;
    - `participantsChanged` rediffuse la liste.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %. Commit `feat(server): manches et diffusion en temps réel`.

### Task 4: Serveur WebSocket

**Files:**
- Create: `server/ws.js`
- Modify: `server/index.js` (crée le hub, attache le WebSocket et le passe à `createApp` pour `participantsChanged`), `server/app.js`, `server/routes/rooms.js`
- Test: `server/ws.test.js`, `server/index.test.js`

**Interfaces:**
- Consumes: `createHub` (Task 3), les dépôts, `findSessionUserId`.
- Produces:
  - `attachWebSocket(httpServer, { pool, hub, config, pingMs = 30_000 }) → { close() }`. Chemin `/ws`.
  - **Origine** : refuse (403) une `Origin` dont l'hôte diffère de l'en-tête `Host`.
  - **Premier message** : `{ type: 'hello', code, role }`.
    - `role: 'host'` : exige une session dont le compte est le créateur de la room ouverte.
    - `role: 'player'` : exige un participant, trouvé par le compte de la session ou par le cookie `melodyo_guest_<CODE>`.
    - Sinon : `{ type: 'error', error: 'forbidden' }`, puis fermeture (code 4403).
  - **Messages suivants** :
    - du créateur : `game:start`, `round:start`, `playback`, `game:end` ;
    - du participant : `{ type: 'answer', position, title, artist }`, avec un accusé `{ type: 'answer:ack', position, status }`.
  - `createApp({ …, hub })` : la route `join` appelle `hub.participantsChanged(room.id)`.
- [ ] **Step 1: Tests**, avec un vrai serveur via `start()` et le client `ws` :
  - `Origin` étrangère → 403 ;
  - `hello` avant tout autre message, sinon `forbidden` ;
  - créateur reconnu par sa session ;
  - un autre compte en `role: 'host'` → `forbidden` ;
  - participant invité par son cookie, participant avec un compte par sa session ;
  - le même compte sur deux connexions, l'une créateur et l'autre participant, reçoit les deux vues ;
  - parcours complet : `game:start`, `round:start`, une réponse acceptée, l'état reçu par le créateur avec `answered` ;
  - message invalide → `invalid_message`, la connexion reste ouverte ;
  - message de plus de 4 Ko → connexion fermée ;
  - un client qui ne répond plus aux pings est fermé (`pingMs` réduit) ;
  - `close()` ferme tout.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %. Commit `feat(server): WebSocket des rooms`.

### Task 5: Client — connexion temps réel et appareil principal

**Files:**
- Create: `client/src/lib/room.js`, `client/src/components/Lobby.jsx`, `client/src/components/QrCode.jsx`
- Modify:
  - `client/src/components/Create.jsx` : le salon (lobby) s'affiche au-dessus du formulaire ;
  - `client/src/App.jsx` : la room s'ouvre à l'arrivée sur Create ; `game:start`, `round:start` et `game:end` sont branchés sur la partie ;
  - `client/src/lib/player.js` : `onTrackStart` reçoit aussi `durationMs`, et un nouvel `onPlayback(paused)` signale pause et reprise ;
  - `client/src/components/Player.jsx` : nombre de réponses et temps restant de la manche ;
  - `client/src/lib/games.js` : `createGame(settings, tracks, roomId)`.
- Test: `client/src/lib/room.test.js`, `Lobby.test.jsx`, `QrCode.test.jsx` ; tests existants mis à jour

**Interfaces:**
- Produces:
  - `room.js`, un store `useSyncExternalStore` :
    - `connectRoom(code, role)` ; `disconnectRoom()` ;
    - `sendRoom(msg)`, mis en file tant que la connexion n'est pas ouverte ;
    - `getRoomState()`, qui renvoie `{ connected, state, error, lastAck }` ; `subscribeRoom` ;
    - reconnexion automatique avec le délai indiqué dans les Global Constraints, et `hello` renvoyé à chaque fois.
  - `openRoom(): Promise<{ id, code }>` et `closeRoom()`, via l'API REST.
  - `Lobby({ room, state })` :
    - code en grand, QR code du lien `${location.origin}/r/${code}` ;
    - bouton « Copier le lien » (`navigator.clipboard.writeText`, avec un toast) ;
    - participants avec leur avatar, et un point gris quand ils sont déconnectés ;
    - « Fermer la room », puis une nouvelle room s'ouvre.
  - `QrCode({ text, size = 200 })` : `<img alt="QR code">` dont la source est `QRCode.toDataURL(text)`.
  - Appareil principal :
    - au lancement, `sendRoom({ type: 'game:start', gameId })` ;
    - à chaque `onTrackStart(index, durationMs)`, `sendRoom({ type: 'round:start', position: index, durationMs })`, où `durationMs` est la durée restante depuis le point de départ ;
    - à chaque changement de pause, `sendRoom({ type: 'playback', paused })` ;
    - en quittant, `sendRoom({ type: 'game:end' })`.
  - **Reprise après reconnexion du créateur** : `room.js` appelle un `onReconnect` fourni par App, qui renvoie `game:start` et le `round:start` de la chanson en cours, avec le temps restant de la manche s'il est connu.
  - `Player` affiche « 3/5 ont répondu » et le temps restant pour répondre (`m:ss`).
- [ ] **Step 1: Tests** :
  - `room.js`, avec une classe `WebSocket` simulée : file d'attente avant ouverture, reconnexion progressive, `hello` renvoyé, erreur `forbidden`, déconnexion volontaire sans nouvelle tentative ;
  - `Lobby` et `QrCode` ;
  - événements envoyés par l'App : ordre et contenu ;
  - reprise après reconnexion ;
  - `Player` : compteur de réponses et décompte.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %. Commit `feat(client): room temps réel côté appareil principal`.

### Task 6: Client — rejoindre et jouer (participant)

**Files:**
- Create: `client/src/components/Join.jsx`, `client/src/components/PlayerSeat.jsx`
- Modify:
  - `client/src/App.jsx` : routage `/r/<code>`, et bouton « Rejoindre une partie » depuis Auth et depuis Create ;
  - `client/src/components/Auth.jsx` ;
  - `client/src/style.css`.
- Test: `Join.test.jsx`, `PlayerSeat.test.jsx`, `App.test.jsx`, `Auth.test.jsx`

**Interfaces:**
- Produces:
  - **Routage** :
    - `location.pathname` qui correspond à `/r/<code>` → écran Join, que l'utilisateur ait une session ou non ;
    - pour un compte relié à Spotify, l'arrivée sur `/r/<code>` affiche Join et non Create (le PC créateur garde l'URL `/`).
  - **`Join({ code? })`** :
    - champ code (pré-rempli depuis l'URL) ;
    - `GET /api/rooms/:code` affiche « Room de <hostName> » ;
    - si l'utilisateur est connecté, un bouton « Jouer avec mon compte (<pseudo>) » ; dans tous les cas, un champ « Nom » pour jouer en invité ;
    - « Rejoindre » → `POST /api/rooms/:code/join`, puis `connectRoom(code, 'player')` et l'écran PlayerSeat ;
    - erreurs : « Room introuvable », « Nom : 1 à 20 caractères », « Trop de tentatives… ».
  - **`PlayerSeat`** :
    - en-tête : code de la room et nom du joueur ;
    - sans partie → « En attente du lancement… » et liste des participants ;
    - manche ouverte → « Son 4/20 », temps restant (décompte local depuis `remainingMs`, recalé à chaque état) et champs « Titre » et « Artiste ». La saisie est envoyée 400 ms après la dernière frappe, avec un indicateur « Enregistré ✓ » à l'accusé `saved` ;
    - manche fermée → « Réponses verrouillées » et la réponse en lecture seule ;
    - pause → « En pause » et décompte figé ;
    - perte de connexion → bandeau « Reconnexion… ».
- [ ] **Step 1: Tests** :
  - routage `/r/ABC234` avec et sans session ;
  - Join : room introuvable, invité, compte, nom invalide ;
  - PlayerSeat :
    - chaque état ;
    - saisie différée : 400 ms avec fake timers, un seul envoi pour plusieurs frappes ;
    - accusé `closed` → « Réponses verrouillées » ;
    - reprise d'une réponse existante après reconnexion ;
    - bandeau de reconnexion.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %.
- [ ] **Step 3:** Vérification dans deux Chrome headless sur le serveur de dev : un créateur (liaison Spotify factice) et un invité. L'invité rejoint par le lien, le créateur envoie `game:start` et `round:start` (lecture simulée), l'invité répond et le créateur voit « 1/1 ont répondu ». Ensuite : recharger la page de l'invité, retrouver sa réponse, puis voir l'échéance verrouiller.
- [ ] **Step 4:** Commit `feat(client): rejoindre une room et répondre`.

### Task 7: Déploiement et revue de sécurité de l'étape 4

**Files:**
- Create: `docs/superpowers/security/etape-4.md`
- Modify: rien côté Traefik (les WebSockets passent par défaut) ; vérifier sur la pile isolée du serveur

- [ ] **Step 1:** Pile isolée sur le serveur : un invité rejoint via `curl` (cookie), puis un script `ws` lancé dans le conteneur ouvre `/ws`, envoie `hello` et reçoit l'état.
- [ ] **Step 2:** Revue :
  - fuite d'informations vers les participants (test récursif) ;
  - authentification et autorisation du WebSocket ;
  - Origin ;
  - taille des messages ;
  - limites de tentatives sur `join` ;
  - tokens invités hachés ;
  - deviner un code de room (espace de 31⁶ codes, avec limite) ;
  - mémoire du hub : rooms sans connexion purgées au bout de 2 h d'inactivité (à ajouter si absent, avec test) ;
  - `npm audit`.
- [ ] **Step 3:** Corriger chaque constat bloquant avec son test. `npm test` → 100 %. Commit `security: revue de l'étape 4`.
