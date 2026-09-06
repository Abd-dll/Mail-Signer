// ============================================================
// registry.js — L'Annuaire Local (Email -> Pacte ID)
// ============================================================
const fs = require("fs");
const FILE_PATH = "./pacts_registry.json";

function readRegistry() {
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, JSON.stringify({}), "utf8");
    }
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    return JSON.parse(raw);
}

function savePact(email, pacteId) {
    const registry = readRegistry();
    registry[email] = {
        pacteId: pacteId,
        updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(FILE_PATH, JSON.stringify(registry, null, 2), "utf8");
    console.log(`[Annuaire] Lien enregistré : ${email} -> ${pacteId}`);
}

function getPacteId(email) {
    const registry = readRegistry();
    if (registry[email]) {
        return registry[email].pacteId;
    }
    return null; 
}

module.exports = { savePact, getPacteId, readRegistry };