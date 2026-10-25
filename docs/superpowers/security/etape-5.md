# Revue de sécurité — étape 5 (correction, révélation, scores)

Date : 2026-10-26 · Périmètre : `git diff main..etape-5-correction`

## Vérifié

| Sujet | Constat |
|---|---|
| **Fuite avant révélation** | Une chanson (titre, artistes, pochette) n'est envoyée qu'après `reveal`, ou à l'entrée en phase finale qui révèle tout. Le test de fuite parcourt tous les messages des participants pendant une correction : la chanson non révélée n'y apparaît jamais. Une chanson rejouée après sa révélation repasse en non révélée, en mémoire comme en base. |
| **Correction avant révélation** | `you.answer` (alimenté par `getAnswers`) ne porte pas la validation. Le résultat d'un participant (`you.results`) n'est envoyé que pour les chansons révélées. En correction à la volée, il ne peut donc pas deviner la bonne réponse à partir des ✓/✗ avant la révélation. |
| **Réponses des autres** | Les réponses de tous ne sont envoyées qu'au créateur (`answers`), pour la chanson en cours de correction. Les participants ne voient les réponses des autres que dans le tableau final, voulu par le spec (« équipes cliquables pour le détail »). |
| **Droits** | `correct`, `reveal`, `correction:start`, `correction:next` et `game:final` ne sont acceptés que sur une connexion créateur, ce qui est vérifié par le schéma zod du rôle. Un participant qui les envoie reçoit `invalid_message` (test). Une validation n'est acceptée que sur la chanson en cours de correction, et une réponse vide n'est jamais validable. |
| **Validation** | `participantId` en UUID, `field` dans une liste fermée, positions entières. Le nom de colonne SQL vient d'une table fixe (`title_ok` / `artist_ok`), jamais de l'entrée du client. |
| **Dépendances** | `npm audit` : 0 vulnérabilité. |

## Points ouverts (non bloquants)

- Chaque diffusion recalcule scores et détails pour tous les participants, soit environ 2 + N requêtes. C'est sans risque pour quelques équipes, mais à surveiller si une room accueille beaucoup de joueurs.
