// ============================================================
// server.js — Service Local (Client) v2.1
// Gère la signature, le registre et le tunnel PQC Railway
// ============================================================
const fs = require('fs');
const path = require('path');

const localDataFiles = ['keys.json', 'secrets.json', 'pacts_registry.json'];

localDataFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify({}, null, 2), 'utf8');
        console.log(`[Système] Fichier ${file} créé automatiquement.`);
    }
});

const express = require("express");
const { sign, verify } = require("./crypto");
const keyStore = require("./keyStore");
const { getSecret } = require("./secretStore");
const registry = require("./registry");
const railwayClient = require("./railwayClient");
const config = require("./config.json");

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "128kb" }));

app.use(function(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Local-Token");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function checkToken(req, res, next) {
  const token = req.headers["x-local-token"];
  if (!token || token !== config.local_token) {
    return res.status(401).json({ error: "Accès local non autorisé" });
  }
  next();
}

app.get("/status", function (req, res) {
  res.json({
    running: true,
    device_id: config.device_id,
    pacts_active: Object.keys(registry.readRegistry ? registry.readRegistry() : {}).length
  });
});

app.post("/auth/setup-jwt", checkToken, (req, res) => {
    if (!req.body.jwt) return res.status(400).json({ error: "JWT manquant" });
    
    railwayClient.setJwt(req.body.jwt);

    try {
        const base64Url = req.body.jwt.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
        
        const userEmail = payload.email || payload.user_id || "Utilisateur_Inconnu";

        if (config.device_id !== userEmail) {
            config.device_id = userEmail;
            fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2), 'utf8');
            console.log(`[Système] Appareil enregistré sous l'identité : ${config.device_id}`);
        }
    } catch (err) {
        console.error("[Erreur Auth] Impossible de lire l'identité depuis le JWT :", err.message);
    }

    res.json({ message: "Tunnel Railway prêt et identité enregistrée", device_id: config.device_id });
});

app.post("/register", checkToken, async (req, res) => {
    try {
        const data = await railwayClient.secureFetch('/register', 'POST', req.body);
        res.json(data);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post("/login", checkToken, async (req, res) => {
    try {
        const data = await railwayClient.secureFetch('/login', 'POST', req.body);
        res.json(data);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post("/pacte/create", checkToken, async function (req, res) {
    const { targetEmail } = req.body;
    if (!targetEmail) return res.status(400).json({ error: "Email cible requis" });

    try {
        const pactData = await railwayClient.requestNewPact(targetEmail);
        
        registry.savePact(targetEmail, pactData.id_pacte);
        
        const { saveSecret } = require("./secretStore");
        saveSecret(pactData.id_pacte, pactData.secret_brut);
        
        refillLocalCache(pactData.id_pacte).catch(err => console.log("[Pre-fetch] Opération asynchrone échouée", err));

        res.status(201).json({
            id_pacte: pactData.id_pacte,
            message: "Pacte établi et secret PQC verrouillé localement"
        });
    } catch (e) {
        console.error("[Erreur Pacte]", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post("/sign", checkToken, async function (req, res) {
  const { to, subject, body, attachment_hashes } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: "Champs manquants (to, subject, body)" });
  }

  const pacteId = registry.getPacteId(to);
  if (!pacteId) {
    return res.status(403).json({ error: `Aucun pacte actif avec ${to}.` });
  }

  const keysLeft = keyStore.countFree(pacteId);
  
  if (keysLeft === 0) {
    console.log(`[Auto-Refill] Stock vide. Téléchargement des clés depuis le Cloud...`);
    try {
        await refillLocalCache(pacteId); 
    } catch (err) {
        return res.status(500).json({ error: "Erreur Cloud (Patientez quelques secondes et réessayez) : " + err.message });
    }
  } else if (keysLeft < 20) {
    console.log(`[Auto-Refill] Stock critique (${keysLeft}) pour le pacte ${pacteId}. Renouvellement en arrière-plan...`);
    refillLocalCache(pacteId).catch(err => console.error("[Auto-Refill] Échec :", err.message));
  }

  const secret = getSecret(pacteId); 
  const freeKey = keyStore.getFreeKey(pacteId); 
  
  if (!secret) {
      console.error(`[Erreur] Matériel cryptographique introuvable : Secret manquant pour le pacte ${pacteId}`);
      return res.status(400).json({ error: "Matériel cryptographique introuvable : Le Secret est manquant." });
  }

  if (!freeKey) {
      console.error(`[Erreur] Matériel cryptographique introuvable : Clé manquante pour le pacte ${pacteId}.`);
      return res.status(400).json({ error: "Matériel cryptographique introuvable : La Clé est manquante." });
  }

  const keyBuffer = Buffer.from(freeKey.key_b64, "base64");
  const attachments = Array.isArray(attachment_hashes) ? attachment_hashes : [];

  console.log(`[Signature] Traitement du message pour le destinataire : ${to}`);

  try {
    const s = sign(subject, body, secret, keyBuffer, attachments);

    keyStore.useKey(pacteId, freeKey.id);

    res.json({
      v: 1,
      key_id: freeKey.id,
      device_id: config.device_id,
      ciphertext_b64: s.ciphertext.toString("base64"),
      attachmentsIncluded: attachments.length > 0
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/verify", checkToken, async function (req, res) { 
  const { from_email, subject, body, key_id, ciphertext_b64, attachment_hashes } = req.body;
  
  let foundKey = keyStore.findKey(key_id); 

  if (!foundKey) {
      console.log(`[Vérification] Clé inconnue. Tentative de synchronisation (Auto-Claim)...`);
      try {
          const pacteId = key_id.split('_')[0];

          const claimData = await railwayClient.claimPact(pacteId);
          
          const { saveSecret } = require("./secretStore");
          saveSecret(pacteId, claimData.secret_brut);

          await refillLocalCache(pacteId);
          if (from_email && from_email !== "inconnu@gmail.com") {
            const registry = require("./registry"); 
            registry.savePact(from_email, pacteId);
            console.log(`[Annuaire] Contact ${from_email} enregistré avec le pacte ${pacteId}`);
          }

          foundKey = keyStore.findKey(key_id);

          if (!foundKey) {
              return res.status(400).json({ error: "Clé introuvable, même après synchronisation avec le Cloud." });
          }
          console.log(`[Auto-Claim] Synchronisation du pacte terminée avec succès.`);

      } catch (e) {
          console.error("[Erreur Auto-Claim]", e.message);
          return res.status(403).json({ error: "Accès refusé ou pacte inconnu." });
      }
  }

  const secret = getSecret(foundKey.pacteId);
  const keyBuffer = Buffer.from(foundKey.key_b64, "base64");
  const signature = { ciphertext: Buffer.from(ciphertext_b64, "base64") };
  console.log("\n=== 🕵️ DEBUG SERVER (BOB : DONNÉES LOCALES) ===");
  console.log("Index de la clé K :", foundKey.id);
  console.log("Secret du pacte S (Brut) :", Buffer.from(secret).toString('hex').substring(0, 20) + "...");
  console.log("Clé K décodée (Base64) :", keyBuffer.toString('base64').substring(0, 20) + "...");
  console.log("===============================================\n");

  console.log(`[Vérification] Analyse de l'intégrité du message...`);

  const ok = verify(subject, body, secret, keyBuffer, signature, attachment_hashes || []);
  
  if (ok) {
      const indexToDestroy = parseInt(foundKey.id.split('_')[1]);
      
      console.log(`[Forward Secrecy] Vérification validée. Destruction de la clé ${indexToDestroy} ordonnée au serveur distant.`);
      confirmKeyDeletionOnRailway(foundKey.pacteId, indexToDestroy)
        .catch(e => console.error("[Erreur FS] Impossible de détruire la clé distante :", e.message));

      keyStore.useKey(foundKey.pacteId, foundKey.id);
  }

  res.json({ valid: ok, device_id: config.device_id });
});

async function refillLocalCache(pacteId) {
    const data = await railwayClient.secureFetch(`/pactes/${pacteId}/fetch-keys`, 'POST', { count: 100 });
    if (data && data.keys) {
        keyStore.addKeys(pacteId, data.keys);
        console.log(`[Approvisionnement] +${data.fetched} clés récupérées pour le pacte ${pacteId}`);
    }
}

async function confirmKeyDeletionOnRailway(pacteId, index) {
    await railwayClient.secureFetch(`/pactes/${pacteId}/keys/confirm`, 'DELETE', {
        indexes: [index]
    });
    console.log(`[Forward Secrecy] Clé ${index} supprimée de l'infrastructure Cloud.`);
}

app.listen(PORT, () => {
  console.log(`\n[Système] Service Local Mail Signer v2.1 démarré`);
  console.log(`[Système] Identité matérielle : ${config.device_id}`);
  console.log(`[Système] Écoute sur http://localhost:${PORT}\n`);
});