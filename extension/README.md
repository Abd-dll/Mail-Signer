# Chrome Extension — Mail Signer

## Structure des fichiers

```
chrome-extension/
├── manifest.json   ← Config de l'extension
├── content.js      ← Script injecté dans Gmail (logique principale)
├── sidebar.css     ← Styles du sidebar
└── README.md
```

---

## Installation

### 1. Mettre ton token

Dans `content.js`, ligne 8, remplace :
```javascript
const LOCAL_TOKEN = "remplace-moi-par-une-chaine-aleatoire-longue";
```
Par la même valeur que dans ton `config.json`.

### 2. Charger l'extension dans Chrome

1. Ouvre Chrome → va sur `chrome://extensions`
2. Active le **mode développeur** (toggle en haut à droite)
3. Clique **"Charger l'extension non empaquetée"**
4. Sélectionne le dossier `chrome-extension`
5. L'extension apparaît dans la liste ✅

### 3. Lancer le service local

```bash
node server.js
```

### 4. Ouvrir Gmail

Rafraîchis Gmail — l'extension est active automatiquement.

---

## Utilisation

### Signer un mail

1. Ouvre une fenêtre de rédaction Gmail
2. Un bouton 🛡 apparaît dans la toolbar en bas
3. Clique dessus → le sidebar s'ouvre à droite
4. Sujet et corps sont pré-remplis automatiquement
5. Clique **Signer** → puis **Insérer la signature**

### Vérifier un mail reçu

1. Ouvre un mail contenant une signature Mail Signer
2. Un bouton **🔍 Vérifier la signature** apparaît sous le mail
3. Clique dessus → sidebar de vérification
4. Clique **Vérifier maintenant** → résultat ✅ ou ❌

---

## Différences vs GAS

| | Google Apps Script | Extension Chrome |
|---|---|---|
| Installation | Via Google Workspace | Via chrome://extensions |
| Accès DOM Gmail | ❌ impossible | ✅ total |
| Appel localhost | Limité (sidebar iframe) | ✅ direct |
| Injection HTML | Copier-coller manuel | ✅ automatique |
| Distribution | Google Marketplace | Chrome Web Store |
