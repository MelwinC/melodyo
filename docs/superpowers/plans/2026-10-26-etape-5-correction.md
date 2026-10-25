# Étape 5 — Correction, révélation, scores et tableau final Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le créateur valide titre et artiste de chaque participant, soit après chaque chanson, soit à la fin de la partie, comme dans K-Culture. La chanson est alors révélée à tous, les scores se mettent à jour en direct, et un tableau final cliquable donne le détail des réponses de chaque participant.

**Architecture:**
- **Données** : `answers` gagne `title_ok` et `artist_ok` (`null` = pas encore corrigé). La correction est enregistrée en base au fil de l'eau. Une table `game_reveals(game_id, position)` mémorise les chansons révélées.
- **Hub** : il gagne une phase (`playing`, `correcting`, `final`), la position en cours de correction et les positions révélées.
- **Ce que voit chacun** :
  - le créateur reçoit les réponses de tous pour la chanson en cours de correction ;
  - les participants ne reçoivent une chanson (titre, artistes, pochette) qu'après sa révélation ;
  - tout le monde reçoit le classement.
- **Score** : le nombre de `title_ok` et `artist_ok` vrais, calculé en SQL.

**Tech Stack:** inchangée.

**Spec:** `docs/superpowers/specs/2026-10-25-melodyo-multijoueur-design.md` — objectifs 5, 10, 11 (option correction), 12, 14 ; « Retour à la chanson précédente » (les points repassent en attente).

## Global Constraints

- Couverture 100 %, sans exclusion.
- `settings.correction` : `'live'` (après chaque chanson) ou `'end'` (à la fin). Valeur par défaut dans l'UI : `'live'`. Les parties enregistrées avant cette étape sont lues comme `'live'`.
- Points : 1 pour le titre, 1 pour l'artiste. Une réponse vide n'est jamais correcte, et ses cases ne sont pas proposées à la validation.
- Révéler une chanson envoie à tous `{ position, name, artists, albumImage }`. Avant la révélation, rien de la chanson n'est envoyé aux participants (le test de fuite de l'étape 4 est étendu).
- **Correction à la volée** : quand la manche d'une chanson est fermée, le créateur voit les réponses, valide, puis clique « Révéler ». La chanson est révélée et les scores sont diffusés.
- **Correction à la fin** : « Corriger les réponses » n'est disponible qu'après la dernière chanson (ou quand le créateur arrête la partie). Pour chaque chanson dans l'ordre : révélation, puis validation de chaque participant, puis « Chanson suivante ». À la fin, on passe à la phase `final`.
- **Retour sur une chanson déjà corrigée** (`round:start` sur une position antérieure) : les validations de cette position sont remises à `null`, et la révélation est retirée en mémoire comme en base.
- **Classement** : tri par score décroissant, ex æquo au même rang (rangs 1, 1, 3). Les participants sans réponse comptent pour 0.
- **Partie terminée** : en correction à la volée, quand la dernière chanson est passée et révélée ; en correction à la fin, quand la correction est faite. Le client appelle `endGame` à l'entrée en phase `final`.
- Tous les messages restent validés par zod. Seul le créateur peut envoyer `correct`, `reveal`, `correction:start`, `correction:next` et `game:final`.

## Review Focus

- Le créateur se trompe de case puis la recoche : la dernière valeur compte, le score s'ajuste en direct sur tous les écrans → test Task 2.
- Un participant arrivé en cours de partie n'a pas de réponse pour les premières chansons : il apparaît dans la correction avec « — » et 0 point, sans planter → tests Task 2 et Task 4.
- Correction à la fin avec 0 participant (jeu à l'ardoise) : on peut quand même révéler chaque chanson et finir → test Task 4.
- Le créateur recharge sa page pendant la correction : il retrouve la chanson en cours de correction et les validations déjà faites (persistées en base) → test Task 2.
- Égalité au classement : même rang affiché, aucun ordre arbitraire entre ex æquo dans les tests (tri secondaire par nom) → test Task 1.

---

### Task 1: Schéma, validations et scores

**Files:**
- Create: `migrations/1730000003000_correction.js`, `server/rooms/scoring.js`
- Modify: `server/rooms/repo.js`, `server/routes/games.js` (accepte `settings.correction`), `client/src/lib/games.js` (rien), `test/games.js` (`settings()` inclut `correction: 'live'`)
- Test: `server/rooms/scoring.test.js`, `server/rooms/repo.test.js`, `server/routes/games.test.js`

**Interfaces:**
- Produces:
  - Colonnes `answers.title_ok boolean`, `answers.artist_ok boolean`, et la table `game_reveals(game_id uuid references games on delete cascade, position int, primary key(game_id, position))`.
  - `setValidation(pool, { gameId, position, participantId, field: 'title'|'artist', ok: boolean })` : crée la ligne de réponse vide si elle manque ; refuse (`false`) si le champ de réponse est vide.
  - `resetValidations(pool, gameId, position)`, `markRevealed(pool, gameId, position)`, `unreveal(pool, gameId, position)`, `getRevealed(pool, gameId): Promise<Set<number>>`.
  - `getAnswers` renvoie désormais aussi `titleOk` et `artistOk`.
  - `getTrack(pool, gameId, position): Promise<{ position, name, artists, albumImage }|null>`.
  - `scoring.js` :
    - `getScores(pool, gameId, participantIds): Promise<Map<id, number>>` ;
    - `rank(rows: { id, name, score }[]): { id, name, score, rank }[]`, avec ex æquo au même rang et un tri secondaire par nom ;
    - `getParticipantDetail(pool, gameId, participantId): Promise<{ position, track|null, answer, titleOk, artistOk }[]>` : `track` vaut `null` pour une chanson non révélée.
  - `settings.correction` : `z.enum(['live', 'end']).default('live')`.
- [ ] **Step 1: Tests**
  - **Validation** :
    - cocher, décocher, recocher (la dernière valeur compte) ;
    - champ vide → `false`, rien n'est écrit ;
    - participant sans ligne de réponse → une ligne vide est créée ;
    - `resetValidations` remet `null`.
  - **Révélations** : marquer, retirer, lister.
  - **`getTrack`** : position inconnue → `null`.
  - **Scores** : 0 pour un participant sans réponse.
  - **`rank`** : `[5, 5, 3]` → rangs 1, 1, 3, ex æquo triés par nom.
  - **Détail** : chansons non révélées sans `track`.
  - **Route** : `correction` absent → `'live'` ; `'x'` → 400.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %. Commit `feat(server): validations, révélations et scores`.

### Task 2: Hub — correction, révélation, phases

**Files:**
- Modify: `server/rooms/hub.js`, `server/ws.js` (nouveaux messages du créateur)
- Test: `server/rooms/hub.test.js`, `server/ws.test.js`

**Interfaces:**
- Consumes: le dépôt de la Task 1.
- Produces:
  - **Messages du créateur** :
    - `{ type: 'correct', position, participantId, field, ok }` ;
    - `{ type: 'reveal', position }` ;
    - `{ type: 'correction:start' }` (mode `end`) ;
    - `{ type: 'correction:next' }` ;
    - `{ type: 'game:final' }`.
  - **État diffusé**, en plus de l'étape 4 :
    - à tous :
      - `phase: 'playing'|'correcting'|'final'` ;
      - `correction: null | { position }`, la chanson en cours de correction ;
      - `revealed: { position, name, artists, albumImage }[]`, les chansons révélées de la partie ;
      - `scores: { id, name, score, rank }[]`.
    - au créateur, en plus : `answers: { participantId, title, artist, titleOk, artistOk }[]` pour la chanson en cours de correction. En correction à la volée, c'est la dernière manche fermée. Les participants sans réponse sont inclus avec des champs vides.
    - au participant, en plus : `you.results`, la liste `{ position, titleOk, artistOk }` des chansons révélées.
    - En phase `final` : tous reçoivent `final: { details: { [participantId]: getParticipantDetail(...) } }`, pour le tableau cliquable.
  - **Règles** :
    - **à la volée** : `correct` n'est accepté que sur une manche fermée ; `reveal` révèle cette position et rediffuse ;
    - **à la fin** : `correction:start` passe en `correcting` sur la position 0 ; `reveal`, puis `correct` ; `correction:next` avance, et après la dernière chanson passe en `final` ;
    - `game:final` : passage direct en `final` (correction à la volée, après la dernière chanson) ;
    - `round:start` sur une position déjà révélée ou corrigée remet ses validations à zéro et retire sa révélation ;
    - après un redémarrage du serveur, `game:start` recharge les révélations depuis la base.
- [ ] **Step 1: Tests**
  - **À la volée** :
    - avant la fermeture, `correct` est ignoré ;
    - après la fermeture, le créateur voit les réponses de tous, y compris « sans réponse » ;
    - corriger met à jour les scores de tous ;
    - `reveal` → les participants reçoivent la chanson et leur résultat.
  - **Fuite** : aucune chanson non révélée n'apparaît dans les messages aux participants (titres secrets, comme à l'étape 4).
  - **À la fin** : déroulé complet sur 2 chansons et 2 participants, jusqu'à `final` ; avec 0 participant, on révèle et on finit.
  - **Retour** sur une position corrigée → validations à `null`, révélation retirée, scores recalculés.
  - **Reprise du créateur** : un nouveau hub (redémarrage) puis `game:start` → révélations et validations retrouvées.
  - **Droits** : `ws.test` vérifie qu'un participant qui envoie `reveal` reçoit `invalid_message`.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %. Commit `feat(server): correction et révélation en direct`.

### Task 3: Appareil principal — option et écrans de correction

**Files:**
- Create: `client/src/components/Correction.jsx`, `client/src/components/Scoreboard.jsx`
- Modify:
  - `client/src/components/Create.jsx` : choix « Correction » (À la volée / À la fin) ;
  - `client/src/components/Player.jsx` :
    - **à la volée** : le panneau de correction apparaît sous la pochette quand la manche est fermée ;
    - « Révéler » envoie `reveal` (la pochette se dévoile aussi en local) ;
    - **à la fin** : à la dernière chanson, ou via « Corriger les réponses », passage à l'écran Correction ;
  - `client/src/App.jsx` : `endGame` appelé à l'entrée en phase `final`, puis tableau final.
- Test: `Correction.test.jsx`, `Scoreboard.test.jsx`, `Create.test.jsx`, `Player.test.jsx`, `App.test.jsx`

**Interfaces:**
- Produces:
  - `Correction({ state, onCorrect(participantId, field, ok), onReveal(position), onNext })` :
    - chanson en cours (pochette, titre et artiste une fois révélée) ;
    - une ligne par participant : avatar, nom, réponse titre et réponse artiste, chacune avec un bouton ✓ / ✗ (`aria-pressed`), désactivé si la réponse est vide ;
    - boutons « Révéler » et « Chanson suivante » (« Voir le classement » sur la dernière chanson).
  - `Scoreboard({ scores, details, onClose? })` :
    - classement (rang, avatar, nom, score) ;
    - un clic sur un participant déplie le détail chanson par chanson : titre et artistes de la chanson, sa réponse et ✓/✗.
- [ ] **Step 1: Tests** :
  - pour chaque composant, l'affichage et les actions ;
  - Create : option transmise dans `settings` ;
  - Player : panneau de correction à la volée visible seulement manche fermée, et « Révéler » qui envoie `reveal` ;
  - App : en mode fin, passage à Correction, puis `final` → `endGame` et tableau.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %. Commit `feat(client): correction et classement sur l'appareil principal`.

### Task 4: Participant — révélation, résultats, tableau final

**Files:**
- Modify: `client/src/components/PlayerSeat.jsx`
- Test: `PlayerSeat.test.jsx`

**Interfaces:**
- Consumes: l'état de la Task 2, `Scoreboard` (Task 3).
- Produces : PlayerSeat affiche :
  - après la révélation de la chanson en cours : « C'était : <titre> — <artistes> » avec la pochette, et son résultat (✓/✗ sur titre et artiste) ;
  - en phase `correcting` : « Correction en cours — chanson n/N » et la chanson révélée ;
  - son score et son rang en permanence, dès qu'une chanson est révélée ;
  - en phase `final` : le tableau final (`Scoreboard`), cliquable.
- [ ] **Step 1: Tests** : chaque état ; participant sans réponse (« — », 0 point) ; ex æquo.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %.
- [ ] **Step 3:** Vérification avec deux Chrome headless :
  - en correction à la volée : réponse, correction, révélation visible chez l'invité, score à jour ;
  - en correction à la fin : correction de deux chansons puis classement final visible chez l'invité, avec un clic sur le détail.
- [ ] **Step 4:** Commit `feat(client): révélation et classement côté participant`.

### Task 5: Revue de sécurité de l'étape 5

- [ ] **Step 1:** Revue :
  - fuite avant révélation (tous les chemins : `answers` du créateur, `final`, `revealed`) ;
  - droits sur les messages du créateur ;
  - validation des entrées ;
  - `npm audit`.

  Rédiger `docs/superpowers/security/etape-5.md`.
- [ ] **Step 2:** Corriger chaque constat bloquant avec son test. Commit `security: revue de l'étape 5`.
