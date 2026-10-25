# Melodyo — rooms multijoueurs, comptes, stats et options de jeu

Date : 2026-10-25
Statut : en attente de validation

## Intention

Melodyo est un blind test Spotify joué entre amis. Aujourd'hui, une seule personne manipule l'app, les équipes répondent sur des ardoises et tout le monde se met d'accord à voix haute sur les points. Exemple réel : 5 équipes de 2, un téléphone par équipe.

On veut que l'app remplace les ardoises et le comptage, dans l'esprit de K-Culture. Chaque équipe rejoint la room depuis son appareil et tape ses réponses. Le créateur de la room valide les points depuis l'appareil principal, qui est le seul à jouer la musique. En plus, on veut :
- des comptes, pour suivre les stats de chacun dans la durée ;
- un historique des parties ;
- éviter de rejouer les chansons de la partie précédente ;
- pouvoir remettre volontairement des chansons mal connues.

## Vocabulaire

- **Créateur** : la personne qui ouvre la room, avec son compte Melodyo relié à son Spotify Premium.
- **Appareil principal** : l'appareil du créateur qui joue la musique et affiche la partie (PC, télé).
- **Participant** : un appareil qui a rejoint la room. Il représente une équipe, qui peut compter plusieurs personnes physiques autour d'un même appareil. Pour le jeu, un participant = un joueur : un nom affiché, une réponse par chanson, un score. Il est soit connecté à un compte Melodyo, soit invité.
- **Room** : l'espace de jeu d'une soirée. On y enchaîne plusieurs parties sans la recréer.
- **Partie** : une suite de chansons jouée dans une room, avec ses réglages et son classement.

## Objectifs

### Comptes
1. **Création de compte** avec pseudo et mot de passe. Pas d'adresse e-mail.
2. **Avatar** : soit choisi dans une liste d'avatars proposés, soit une image envoyée par l'utilisateur et stockée sur le serveur.
3. **Un même compte partout** : le créateur peut être connecté au même compte sur son PC (appareil principal, relié à Spotify) et sur son téléphone, où il participe comme joueur. Les deux peuvent avoir lieu dans la même room, en même temps.
4. **Invité ou compte** : on peut rejoindre une room en invité (simple nom), mais aucune stat n'est conservée pour un invité.
5. **Le créateur doit avoir un compte**, relié à son Spotify. L'historique de ses parties et sa liste « à revoir » sont rattachés à ce compte.

### Rooms et parties
6. **Rejoindre** une room par QR code, lien ou code de room, depuis un téléphone ou un PC.
7. **Plusieurs parties dans la même room** : à la fin d'une partie, le créateur en relance une nouvelle (nouveaux réglages possibles) ; les participants restent connectés.
8. **Le créateur seul contrôle** depuis l'appareil principal : lancer, pause, ±10 s et barre de lecture, passer, revenir à la chanson précédente, valider, révéler, terminer, relancer.
9. **Suivi en direct** sur tous les appareils : numéro de chanson (ex. 4/20), timer, état de la manche, résultats une fois révélés, classement.

### Déroulé
10. **Réponses écrites** : pendant une manche, chaque participant saisit un titre et un artiste. 1 point pour le titre, 1 point pour l'artiste.
11. **Options de partie**, choisies à la création en plus des thèmes et du nombre de sons existants :
    - *timer* : « 30 s » (extrait de 30 s, 1 min 30 au total pour répondre) ou « chanson entière » (temps de réponse = durée de lecture) ;
    - *départ* : début ou milieu de la chanson ;
    - *correction* : à la volée (après chaque chanson) ou à la fin.
12. **Révélation et correction**, selon l'option :
    - *à la volée* : après chaque chanson, l'appareil principal affiche les réponses de tous les participants, le créateur valide titre et artiste pour chacun, puis la chanson est révélée (pochette nette, titre, artiste) ;
    - *à la fin* : les chansons s'enchaînent sans révélation. Une fois la dernière passée, la correction se fait **chanson par chanson, puis participant par participant**, comme dans K-Culture : la chanson est révélée, puis on parcourt les réponses de chaque participant et le créateur valide.
13. **Pause** : quand le créateur met en pause, le timer de réponse se met aussi en pause.
14. **Tableau final** sur tous les appareils, avec le classement. Un clic sur un participant affiche le détail de ses réponses chanson par chanson.

### Mémoire
15. **Historique** en PostgreSQL : rooms, parties, réglages, chansons dans l'ordre, participants, réponses, validations, scores, classements.
16. **Pas de répétition** : une nouvelle partie exclut les chansons de la dernière partie du créateur (la dernière uniquement).
17. **Liste « à revoir »** : le créateur coche une chanson au moment de sa révélation ou sur le tableau final. Elle rejoint une liste permanente, propre à son compte, et revient dans les parties suivantes jusqu'à ce qu'il la retire depuis une page dédiée.
18. **Stats des comptes** : toutes les données utiles sont conservées pour pouvoir afficher ensuite les stats voulues. Au minimum, on doit pouvoir calculer :
    - nombre de parties ;
    - victoires et défaites ;
    - % de bonnes réponses (titre, artiste, global) ;
    - classement moyen et meilleur classement ;
    - thèmes joués, avec les résultats par thème.

    Une première page profil affiche ces stats. Le choix de l'affichage pourra évoluer sans changer le stockage.

### Interface
19. **Pochettes** : flou plus fort qu'aujourd'hui (actuellement `blur(28px) brightness(.5)`), et correction du bug où la pochette est visible un court instant à l'apparition d'une nouvelle chanson. Aujourd'hui, l'image et la classe de flou changent séparément, avec une transition CSS. À chaque nouvelle chanson, aucune frame nette ne doit apparaître.

## Non-objectifs

- **Son sur les appareils des participants.** Spotify interdit de diffuser la musique vers d'autres appareils, ne fournit plus d'extraits de 30 s aux nouvelles apps (`preview_url` vide depuis le 27/11/2024), et limite une app en mode développement à 5 utilisateurs Premium (février 2026). Pour des joueurs à distance, le créateur partage lui-même le son de l'appareil principal (Discord, appel vidéo). L'app n'a rien à gérer pour ça.
- **Vote des participants sur les points** : seul le créateur valide.
- **Plusieurs joueurs individuels sur un même appareil** : un appareil = un participant.
- **Récupération de mot de passe par e-mail** (aucune adresse n'est collectée).
- **Sources audio autres que Spotify.**

## Anti-objectifs (échec même si « ça marche »)

- Un participant peut voir le titre, l'artiste ou la pochette nette avant la révélation : dans l'interface, les réponses réseau ou les messages temps réel.
- Un participant peut agir comme le créateur, modifier les réponses d'un autre participant, ou modifier des points.
- Un participant perd sa partie parce que son téléphone s'est mis en veille ou a perdu le réseau.
- Les tokens Spotify du créateur sont exposés à un autre appareil ou traînent dans des URL et des logs.
- Les mots de passe sont stockés de façon récupérable, ou un fichier envoyé comme avatar peut servir à attaquer le site ou ses utilisateurs.
- Une fonctionnalité est livrée sans tests ou en dessous de 100 % de couverture.

## Contraintes

- **Spotify** : lecture uniquement sur l'appareil principal via le Web Playback SDK (Premium requis, Firefox non supporté). Seul le créateur relie un compte Spotify.
- **Existant à conserver** :
  - Node 24 et Express (`server.js`), front React + Vite (`client/`) ;
  - déploiement Docker Compose derrière Traefik sur `melodyo.melwinchenu.fr` ;
  - pipeline GitHub Actions : lint, tests, build, déploiement automatique sur `main` ;
  - hook pre-commit : lint-staged puis tests.
- **Base de données** : PostgreSQL, ajoutée comme service dans le `docker-compose.yml` de prod, avec un volume persistant. Les avatars envoyés sont stockés sur le serveur dans un volume persistant. Les secrets (mot de passe de la base, secret de session) sont dans un `.env` sur le serveur, jamais dans le repo.
- **Tests** : 100 % de couverture (lignes, branches, fonctions, instructions) côté serveur et côté client. Elle est imposée par des seuils Vitest qui font échouer la CI et le hook pre-commit. Ça vaut à chaque étape livrée, pas seulement à la fin.
- **Sécurité** : chaque étape se termine par une revue de sécurité de ses changements. Les problèmes trouvés sont corrigés avant de passer à l'étape suivante.
- **Langue** : interface en français.

## Choix faits par moi (à valider à la lecture)

- **Retour à la chanson précédente** : la manche de cette chanson se rouvre avec un nouveau timer. Chaque participant retrouve sa réponse précédente et peut la modifier ; ses points déjà validés repassent en attente de correction.
- **Pause et avance rapide** : le timer ne s'écoule que pendant la lecture, la pause l'arrête. Un saut de ±10 s ou un clic sur la barre de lecture ne modifie pas le timer.
- **Arrivée en cours de partie** : un participant peut rejoindre une partie déjà commencée. Il marque à partir de son arrivée ; les chansons manquées comptent comme sans réponse dans ses stats.
- **Reconnexion** : un participant connecté à un compte reprend sa place en se reconnectant. Un invité reçoit un jeton secret, conservé sur son appareil, qui lui permet de reprendre sa place après une veille, une perte réseau ou un rechargement.
- **Partie sans participant** : une partie peut se jouer avec zéro participant, comme aujourd'hui avec des ardoises. Les écrans de correction et de scores sont alors simplement vides ; il n'y a pas de mode séparé à maintenir.
- **Partie terminée ou interrompue** :
  - une partie est « terminée » quand la dernière chanson est passée et, en correction à la fin, quand la correction est faite ;
  - une partie quittée en cours est gardée dans l'historique avec le statut « interrompue » et n'est pas reprise, sauf après un redémarrage du serveur ;
  - l'exclusion « dernière partie » porte sur les chansons réellement jouées de la dernière partie démarrée, terminée ou interrompue ;
  - seules les parties terminées comptent dans les stats.
- **Victoire et défaite** : une victoire, c'est finir 1er d'une partie terminée avec au moins 2 participants, ex æquo compris. Sinon, c'est une défaite. Une partie à un seul participant compte dans les parties jouées et les % de bonnes réponses, mais pas dans les victoires, défaites et classements.
- **Accès** :
  - l'historique et la liste « à revoir » ne sont visibles que par le créateur propriétaire ;
  - chaque compte voit son propre profil et ses stats ;
  - les participants voient le tableau final et le détail des réponses tant qu'ils sont dans la room ;
  - la visibilité des profils des autres joueurs est laissée au builder (pas de classement général public pour l'instant).
- **Liste « à revoir » trop longue** : au plus la moitié du quota d'un thème (arrondie au supérieur) vient de la liste, tirée au hasard, pour qu'elle n'occupe jamais toute une partie. Les chansons « à revoir » d'un thème non choisi ne sont pas jouées. Elles échappent à l'exclusion « dernière partie ».
- **Bornes du curseur** : le nombre de sons disponibles par thème tient compte de l'exclusion de la dernière partie.
- **Session du créateur** : les tokens Spotify ne transitent plus par l'URL de retour, comme aujourd'hui avec `/?access_token=…`. Ils sont stockés côté serveur, rattachés au compte Melodyo, et l'appareil principal récupère seulement un token d'accès de courte durée pour le SDK.
- **Sessions** : connexion par cookie httpOnly, et mots de passe hachés avec un algorithme dédié (argon2id ou équivalent). Les tentatives de connexion et d'accès aux rooms sont limitées.
- **Avatars envoyés** : taille maximale limitée, formats image courants seulement, image ré-encodée côté serveur (ce qui retire les métadonnées et le contenu caché), servie comme image sous un nom généré.
- **Temps réel** : une connexion WebSocket relie le serveur à chaque appareil. Le serveur est la seule source de vérité pour l'état des parties et les timers ; l'appareil principal lui remonte les événements de lecture (pause, fin de chanson). Les messages envoyés aux participants ne contiennent jamais le titre, l'artiste ni la pochette avant la révélation.

## Laissé au builder

- Choix des bibliothèques : WebSocket, accès PostgreSQL et migrations, validation des entrées, hachage des mots de passe, traitement d'images, QR code. Elles doivent être maintenues et sans vulnérabilité connue.
- Schéma exact de la base, du moment que les stats listées peuvent en être calculées.
- Règles des pseudos (longueur, caractères, unicité insensible à la casse) et longueur minimale des mots de passe.
- Format et longueur du code de room : court à taper, impossible à deviner en pratique, avec une limite de tentatives.
- Position exacte de départ en mode « milieu ». Par exemple, la moitié de la durée, moins 15 s en mode 30 s, pour que l'extrait couvre le cœur du morceau.
- Comportement si le serveur redémarre en pleine partie : au minimum, la partie et les réponses ne sont pas perdues et le créateur peut reprendre.
- Fermeture d'une room inactive et durée de vie des jetons invités.
- Liste des avatars proposés.
- Mise en page des nouveaux écrans, dans le style visuel actuel : comptes, profil et stats, lobby avec QR code, écran participant, correction, tableau final, historique, liste « à revoir ».
- Découpage en étapes livrables. Ordre suggéré :
  1. fondations : serveur testable, PostgreSQL, couverture à 100 % de l'existant ;
  2. comptes, avatars et liaison Spotify côté serveur ;
  3. options de partie, historique, exclusion, liste « à revoir » et pochettes ;
  4. rooms temps réel, participants et réponses ;
  5. correction, révélation, scores et tableau final ;
  6. stats et profils.
- Outillage de test : une base PostgreSQL réelle pour les tests serveur (en local et en CI), le SDK et l'API Spotify simulés.
