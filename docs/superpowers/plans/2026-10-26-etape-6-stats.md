# Étape 6 — Statistiques des joueurs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque compte voit ses statistiques dans son profil : nombre de parties, victoires et défaites, pourcentage de bonnes réponses (titre, artiste, global), classement moyen et meilleur classement, thèmes joués avec les résultats par thème.

**Architecture:** Les stats sont calculées en SQL à partir des données déjà conservées (`participants.user_id`, `answers`, `games`, `game_tracks`), sans table supplémentaire : on peut changer l'affichage sans toucher au stockage. Une route `GET /api/me/stats` les sert, et le Profil les affiche.

**Tech Stack:** inchangée.

**Spec:** `docs/superpowers/specs/2026-10-25-melodyo-multijoueur-design.md` — objectif 18 ; choix « Victoire et défaite » et « Accès ».

## Global Constraints

- Couverture 100 %, sans exclusion.
- **Partie jouée par un compte** : une partie `finished` dans laquelle l'un des participants liés à ce compte (toutes rooms confondues) a au moins une ligne de réponse. Les invités n'ont pas de stats.
- **Participants d'une partie** : ceux qui ont au moins une ligne de réponse dans cette partie.
- **Classement d'une partie** : `RANK()` par score décroissant (ex æquo au même rang). Victoire : rang 1 dans une partie à au moins 2 participants. Défaite : rang supérieur à 1 dans une partie à au moins 2 participants. Une partie à 1 participant compte dans « parties jouées » et dans les pourcentages, pas dans les victoires, défaites ni classements.
- **Pourcentages** : bonnes réponses sur le nombre de chansons des parties jouées (une chanson manquée compte comme fausse). Arrondi à l'entier. `null` si aucune partie.
- **Classement moyen** : à une décimale ; `null` si aucune partie à au moins 2 participants. Meilleur classement : le rang minimal, ou `null`.
- **Thèmes** : pour chaque `theme_id` des chansons des parties jouées, `{ themeId, songs, titleOk, artistOk }`, trié par nombre de chansons décroissant.
- **Accès** : seulement ses propres stats (`401` sans session).

## Review Focus

- Compte qui n'a jamais joué : tous les champs sont à 0 ou `null`, et le Profil affiche « Pas encore de partie » → tests Task 1 et Task 2.
- Même compte présent comme deux participants dans une même partie (rejoint en invité puis avec son compte) : la partie n'est comptée qu'une fois, et c'est le meilleur des deux scores qui compte → test Task 1.
- Partie interrompue ou encore en cours : ignorée → test Task 1.
- Égalité à la première place : victoire pour tous les ex æquo → test Task 1.

---

### Task 1: Calcul des statistiques (serveur)

**Files:**
- Create: `server/stats.js`
- Modify: `server/routes/accounts.js` (`GET /api/me/stats`)
- Test: `server/stats.test.js`, `server/routes/accounts.test.js`

**Interfaces:**
- Produces:
  - `getStats(pool, userId): Promise<Stats>` avec `Stats = { games, wins, losses, titleRate, artistRate, overallRate, averageRank, bestRank, themes: [{ themeId, songs, titleOk, artistOk }] }` ;
  - `GET /api/me/stats` → `200 { stats }`.
- [ ] **Step 1: Tests** :
  - **Aucun jeu** : 0 partie, pourcentages et rangs à `null`, `themes` vide.
  - **Deux parties terminées à 2 participants** : une gagnée, une perdue.
    - victoires, défaites ;
    - pourcentages, avec les chansons manquées comptées fausses ;
    - classement moyen et meilleur classement ;
    - thèmes.
  - **Ex æquo à la première place** : victoire pour les deux.
  - **Partie solo** : comptée dans les parties et les pourcentages, pas dans les victoires.
  - **Parties ignorées** : interrompue ou en cours.
  - **Double participation** (invité + compte dans la même partie) : une seule partie, meilleur score retenu.
  - **Route** : 401, puis 200.
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %. Commit `feat(server): statistiques des comptes`.

### Task 2: Statistiques dans le profil (client)

**Files:**
- Modify: `client/src/components/Profile.jsx`, `client/src/lib/session.js` (ou un nouveau `client/src/lib/stats.js`), `client/src/style.css`
- Test: `client/src/components/Profile.test.jsx`, test du module

**Interfaces:**
- Produces :
  - `fetchStats(): Promise<Stats>` ;
  - Profil : une section « Mes statistiques » avec des tuiles (Parties, Victoires, Défaites, Bonnes réponses en %, Titres en %, Artistes en %, Classement moyen, Meilleur classement) et un tableau des thèmes (emoji, libellé, chansons, % titres, % artistes) ;
  - « Pas encore de partie » s'il n'y a aucune partie ;
  - « — » pour une valeur `null` ;
  - erreur de chargement → « Statistiques indisponibles ».
- [ ] **Step 1: Tests** : chargement, aucune partie, valeurs `null`, erreur, tableau des thèmes (un thème inconnu affiche son id).
- [ ] **Step 2:** FAIL → implémenter → PASS, 100 %.
- [ ] **Step 3:** Vérification dans Chrome headless : un compte qui a joué deux parties (créées par l'API et un script WebSocket) voit ses stats dans le profil.
- [ ] **Step 4:** Commit `feat(client): statistiques dans le profil`.

### Task 3: Revue de sécurité de l'étape 6

- [ ] **Step 1:** Revue :
  - un compte ne voit que ses propres stats ;
  - aucune donnée d'un autre joueur ne fuit, hors agrégats de ses propres parties ;
  - requêtes paramétrées ;
  - `npm audit`.

  Rédiger `docs/superpowers/security/etape-6.md`. Commit `security: revue de l'étape 6`.
