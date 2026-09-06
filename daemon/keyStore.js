// ============================================================
// keyStore.js — Gestionnaire de clés locales (Multi-Pactes)
// ============================================================
const fs = require("fs");
const FILE_PATH = "./keys.json";

function readKeys() {
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, JSON.stringify({}), "utf8");
    }
    return JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
}

function writeKeys(keys) {
    fs.writeFileSync(FILE_PATH, JSON.stringify(keys, null, 2), "utf8");
}

function getFreeKey(pacteId) {
    const allKeys = readKeys();
    if (!allKeys[pacteId]) return null;
    
    return allKeys[pacteId].find(k => k.used === false) || null;
}

function useKey(pacteId, keyId) {
    const allKeys = readKeys();
    if (!allKeys[pacteId]) return false;

    const key = allKeys[pacteId].find(k => k.id === keyId);
    if (key) {
        key.used = true;
        writeKeys(allKeys);
        return true;
    }
    return false;
}

function findKey(keyId) {
    const allKeys = readKeys();
    
    for (const [pacteId, keys] of Object.entries(allKeys)) {
        const key = keys.find(k => k.id === keyId);
        if (key) {
            return { ...key, pacteId: pacteId }; 
        }
    }
    return null;
}

function countFree(pacteId) {
    const allKeys = readKeys();
    if (!allKeys[pacteId]) return 0;
    
    return allKeys[pacteId].filter(k => k.used === false).length;
}

function addKeys(pacteId, newKeys) {
    const allKeys = readKeys();
    
    if (Array.isArray(allKeys)) {
        console.log("[Système] Correction automatique du format de keys.json (Array -> Object)");
        writeKeys({});
        return addKeys(pacteId, newKeys);
    }

    if (!allKeys[pacteId]) {
        allKeys[pacteId] = [];
    }
    
    const formattedKeys = newKeys.map(k => ({
        id: k.key_id,
        index: k.index,
        key_b64: k.key_enc_b64,
        used: false
    }));

    allKeys[pacteId].push(...formattedKeys);
    writeKeys(allKeys);
}

module.exports = { getFreeKey, useKey, findKey, countFree, addKeys };