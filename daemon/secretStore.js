// ============================================================
// secretStore.js — Gestionnaire de secrets partagés (Multi-Pactes)
// ============================================================
const fs = require("fs");
const FILE_PATH = "./secrets.json";

function readSecrets() {
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, JSON.stringify({}), "utf8");
    }
    return JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
}

function getSecret(pacteId) {
    const secrets = readSecrets();
    return secrets[pacteId] || null;
}

function saveSecret(pacteId, secretValue) {
    const secrets = readSecrets();
    secrets[pacteId] = secretValue;
    fs.writeFileSync(FILE_PATH, JSON.stringify(secrets, null, 2), "utf8");
    console.log(`[SecretStore] Nouveau secret sauvegardé pour le pacte ${pacteId}`);
}

module.exports = { getSecret, saveSecret };