# Revue de sécurité — étape 4 (rooms en temps réel)

Date : 2026-10-26 · Périmètre : `git diff main..etape-4-rooms`

## Vérifié

| Sujet | Constat |
|---|---|
| **Fuite vers les participants** | L'état diffusé à un participant ne contient que les participants, `{ id, total, timer }` de la partie et l'état de la manche. Un test parcourt tous les messages envoyés aux participants pendant une partie complète : titres, artistes, pochettes et URI des chansons n'y apparaissent jamais. Le créateur ne reçoit pas non plus le texte des réponses à cette étape, seulement qui a répondu. |
| **Authentification WebSocket** | Le premier message doit être `hello`, sinon la connexion est fermée (4403). Le rôle « créateur » exige la session du compte propriétaire de la room. Le rôle « participant » exige un participant reconnu par la session du compte ou par le cookie d'invité de la room (`HttpOnly`, propre à la room, seul le SHA-256 du token est stocké). Un participant ne peut pas envoyer d'événement de créateur (`invalid_message`). |
| **Origine et taille** | Une `Origin` d'un autre site est refusée (403), ce qui empêche une page tierce d'ouvrir une connexion avec les cookies du joueur. Messages limités à 4 Ko (au-delà, la connexion est fermée en 1009) et validés par zod. Les réponses sont tronquées à 100 caractères. |
| **Ordre et état** | Les messages d'une connexion sont traités dans l'ordre. Le serveur seul ouvre et ferme les manches. Une réponse hors manche ouverte est refusée (`closed`) sans écraser la précédente. |
| **Codes de room** | 6 caractères sur 31, soit environ 887 millions de combinaisons. `POST /api/rooms/:code/join` est limité à 30 tentatives par IP et par tranche de 10 min (`CF-Connecting-IP`). |
| **Connexions mortes** | Un ping toutes les 30 s ferme les connexions qui ne répondent plus. Les connexions WebSocket hors de `/ws` sont fermées en production, et laissées à Vite en dev. |
| **Mémoire** | Corrigé dans cette étape : une room sans aucune connexion depuis 2 h est retirée de la mémoire, sans perte de données (tout est en base). Test RED→GREEN. |
| **Reprise** | `GET /api/rooms/:code/me` ne renvoie que le participant de l'appareil appelant (sa session ou son cookie d'invité), jamais celui d'un autre. |
| **Dépendances** | `npm audit` : 0 vulnérabilité (`ws` 8.22, `qrcode` 1.5.4). |

## Points ouverts (non bloquants)

- Pas de limite sur le nombre d'invités qu'une même IP peut créer dans une room, au-delà de la limite de tentatives sur `join`.
- Le WebSocket n'a pas de limite de débit de messages par connexion. Un participant peut envoyer de nombreuses réponses, chacune écrite en base et rediffusée. Le client n'envoie qu'après 400 ms sans frappe.
- Un créateur peut fermer sa room, mais les participants déjà connectés restent connectés au hub jusqu'à leur déconnexion. Ils ne peuvent plus rien faire d'utile : plus de partie, et aucune nouvelle connexion n'est acceptée.
