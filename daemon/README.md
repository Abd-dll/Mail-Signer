# Mail Signer PQC (Post-Quantum Cryptography)

**Mail Signer PQC** est une extension Gmail couplée à un moteur cryptographique local permettant de signer et de vérifier l'authenticité des courriels en utilisant des algorithmes résistants aux attaques par ordinateur quantique.

Le système repose sur une architecture de **Forward Secrecy asynchrone** : chaque courriel possède sa propre clé cryptographique unique, laquelle est détruite de l'infrastructure réseau immédiatement après usage.

## Architecture et Fonctionnement

L'écosystème est composé de trois briques logicielles majeures :

1.  **L'Extension Chrome (Interface Client) :** Interface utilisateur injectée de manière non intrusive dans le DOM de Gmail. Elle gère l'affichage, l'extraction des données textuelles et la communication avec l'enclave locale.
2.  **Le Serveur Local (Moteur Cryptographique) :** Agit comme l'enclave sécurisée du système sur le poste de l'utilisateur. Il gère le stockage des clés privées, calcule les empreintes mathématiques et maintient un **Tunnel Hybride PQC** avec l'infrastructure publique.
3.  **L'Infrastructure Cloud (Railway + Nextcloud) :** Agit comme un système de stockage passif et un annuaire Zero-Trust. Il authentifie les utilisateurs et distribue les lots de clés à usage unique, sans jamais posséder la capacité technique d'accéder aux messages ou aux secrets privés.

### Flux de signature (Expéditeur -> Destinataire)
1. L'expéditeur établit un pacte avec le destinataire (génération et encapsulation de 100 clés PQC sur le Cloud).
2. L'expéditeur signe un message : le moteur local consomme la clé n°0 de son enclave.
3. Le destinataire réceptionne le message : l'extension détecte la présence d'une signature et déclenche une procédure de synchronisation d'état (Auto-Claim).
4. Le destinataire rapatrie le lot de clés depuis le Cloud, vérifie l'intégrité de la signature mathématique, puis ordonne la destruction définitive de la clé n°0 sur les serveurs distants (Forward Secrecy).

---

## Guide d'Installation et Configuration

### Prérequis système : Node.js
Pour exécuter le moteur cryptographique local, l'environnement Node.js doit être installé sur la machine hôte.
1. Se rendre sur la documentation officielle : https://nodejs.org/
2. Télécharger et installer la version **LTS** (Long Term Support).
3. Vérifier l'installation en ouvrant un terminal (Invite de commandes ou Terminal macOS/Linux) et en exécutant : `node -v`. Le numéro de version doit s'afficher.

### 1. Configuration de l'Enclave Locale
Le processus local doit être actif en arrière-plan pour assurer le fonctionnement de l'extension.
1. Cloner ou télécharger le dépôt source sur la machine locale.
2. Ouvrir une invite de commande dans le répertoire racine du projet (contenant le fichier `server.js`).
3. Installer les dépendances cryptographiques requises via le gestionnaire de paquets :
   npm install
4. Initialiser le serveur local :
   node server.js

> **Note :** Le processus du terminal doit demeurer actif. Lors de sa première exécution, le serveur générera automatiquement l'arborescence de persistance locale (`keys.json`, `secrets.json` et `pacts_registry.json`).

### 2. Déploiement de l'Extension dans le Navigateur
1. Ouvrir le navigateur Google Chrome et naviguer vers `chrome://extensions/`.
2. Dans le coin supérieur droit, activer le **Mode développeur**.
3. Sélectionner **Charger l'extension non empaquetée** (ou *Load unpacked*).
4. Cibler le répertoire contenant les fichiers sources de l'extension (le répertoire hébergeant le fichier `manifest.json`).

### 3. Initialisation de la Session
1. Accéder au client web Gmail.
2. Déployer l'interface Mail Signer via l'icône de l'extension ou lors de la composition d'un nouveau courriel.
3. Procéder à la création d'un compte ou à l'authentification.
4. Une fois l'authentification validée par l'annuaire, l'extension transmettra de manière sécurisée le jeton de session au processus local. Le tunnel PQC est alors établi.

---

## Sécurité et Confidentialité

* **Zero-Knowledge (Zéro Connaissance) :** Les serveurs distants traitent des données opaques et n'ont jamais accès au contenu des correspondances ni aux pièces jointes.
* **Résistance Quantique :** L'architecture implémente des algorithmes hybrides de dérivation de clés (ML-KEM-768 + ECDH P-256) en conformité stricte avec le standard NIST FIPS 203.
* **Forward Secrecy (Confidentialité Persistante) :** La compromission d'une clé éphémère ne permet pas la compromission des clés précédentes ni le déchiffrement des communications antérieures.

## Structure de persistance locale

* `keys.json` : Stockage du pool de clés publiques à usage unique associées aux correspondants.
* `secrets.json` : Persistance des secrets de pactes post-quantiques décapsulés (Fichier critique requérant une stricte isolation).
* `pacts_registry.json` : Annuaire relationnel local associant les adresses de messagerie aux identifiants uniques de pactes (UUID).

---
*Ce projet constitue une implémentation expérimentale d'ingénierie logicielle intégrant des protocoles de cryptographie post-quantique (PQC) appliqués à un service de messagerie grand public.*