# Infrastructure Cloud Mail Signer (API Gateway & Stockage OTP)

Ce composant constitue le "Cerveau Cloud" de l'écosystème Mail Signer. Il est conçu pour être déployé sur **Railway** et utilise **Nextcloud** comme backend de stockage aveugle (Zero-Knowledge). Bien que développé initialement pour la signature d'e-mails, cette architecture est générique et peut être utilisée par n'importe quelle application nécessitant une distribution sécurisée de clés à usage unique (OTP).

## Architecture du Système

L'infrastructure repose sur trois piliers technologiques garantissant la confidentialité persistante (Forward Secrecy) :

1.  **API Gateway (Railway)** : Gère l'authentification des utilisateurs, la logique des "Pactes" (sessions de confiance) et le tunnel de communication chiffré.
2.  **Couche de Persistance (PostgreSQL)** : Stocke les métadonnées des utilisateurs et les secrets de pactes chiffrés "au repos" (AES-256-GCM).
3.  **Stockage Aveugle (Nextcloud via WebDAV)** : Héberge les lots de clés à usage unique. Nextcloud ne voit jamais les clés en clair car elles sont masquées par une opération XOR avant téléversement.

---

## Configuration de l'environnement (Railway)

Pour fonctionner, le serveur nécessite les variables d'environnement suivantes à configurer dans le tableau de bord Railway :

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | URL de connexion à l'instance PostgreSQL. 
| `JWT_SECRET` | Clé secrète pour la génération des jetons d'authentification.
| `MASTER_KEY_HEX` | Clé de 32 octets (hex) pour chiffrer les secrets en base de données.
| `NEXTCLOUD_URL` | Point d'entrée WebDAV de l'instance Nextcloud.
| `NEXTCLOUD_USER` | Identifiant du compte Nextcloud dédié au stockage.
| `NEXTCLOUD_PASS` | Mot de passe ou jeton d'application Nextcloud.

---

## Fonctionnement Technique

### 1. Sécurité du Transport (Tunnel Hybride)
Le serveur implémente un tunnel de session post-quantique. Lors du `handshake`, il utilise **ML-KEM-768** et **ECDH P-256** pour forger une enveloppe sécurisée contenant la clé de session. Cette clé permet ensuite de chiffrer chaque requête et réponse via AES-256-GCM (Application-Layer Encryption).

### 2. Gestion des Clés (OTP & XOR Masking)
L'originalité du système réside dans son gestionnaire de clés (`keyManager.js`) :
*   **Génération** : Le serveur génère des lots de 100 clés aléatoires de 32 octets.
*   **Masquage** : Chaque clé ($K$) est masquée avec le secret du pacte ($S$) via l'opération $C = K XOR S.
*   **Stockage** : Seul le résultat $C$ est envoyé sur Nextcloud. Le serveur ne stocke jamais les clés $K$ après le masquage.

---

## Potentiel de Réutilisation

Cette architecture est **agnostique à l'application**. Elle peut être détournée pour tout système nécessitant des clés jetables :

*   **Messagerie Instantanée** : Pour des protocoles de type "Double Ratchet".
*   **Authentification Forte (2FA)** : Génération et distribution de codes de secours à usage unique.
*   **Jetons d'API Éphémères** : Pour sécuriser des transactions ponctuelles entre micro-services.

### Comment l'adapter ?
Il suffit de modifier l'enclave locale pour consommer les clés téléchargées via `fetchKeyBatch` pour vos propres besoins logiques, sans changer une seule ligne du code de l'infrastructure Cloud.

## Sécurité des Données (At-Rest)

Toutes les données sensibles en base de données sont protégées par une couche de chiffrement au repos. La fonction `encryptAtRest` utilise une clé maîtresse (Master Key) pour garantir que même en cas d'accès direct à la base PostgreSQL, les secrets des pactes restent illisibles.