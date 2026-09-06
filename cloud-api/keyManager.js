// ============================================================
// keyManager.js - Logique de génération et de masquage des clés
// ============================================================

const crypto = require("crypto");
const nextcloud = require("./nextcloud");

const BATCH_SIZE = 100;
const KEY_BYTES  = 32;
const REFILL_THRESHOLD = 10;

// ─── Génération d'entropie ────────────────────────────────────

function generateSecret() {
  return crypto.randomBytes(KEY_BYTES);
}

function generateKeyBatch() {
  return Array.from({ length: BATCH_SIZE }, () =>
    crypto.randomBytes(KEY_BYTES)
  );
}

// ─── Masquage cryptographique (XOR) ───────────────────────────

function maskKeyBatch(keys, secret) {
  if (!Buffer.isBuffer(secret) || secret.length !== KEY_BYTES) {
    throw new Error("Le paramètre secret doit être un Buffer de 32 bytes.");
  }
  
  const result = keys.map(key => {
    const masked = Buffer.alloc(KEY_BYTES);
    for (let i = 0; i < KEY_BYTES; i++) {
      masked[i] = key[i] ^ secret[i];
    }
    // Effacement immédiat de la clé non chiffrée
    key.fill(0);
    return masked;
  });
  
  if (Buffer.isBuffer(secret)) secret.fill(0);
  return result;
}

// ─── Flux de téléversement ────────────────────────────────────

async function generateAndUploadBatch(pacteId, secretBuffer, startIndex = 0) {
  const rawKeys     = generateKeyBatch();
  const maskedKeys  = maskKeyBatch(rawKeys, secretBuffer);

  const indexedKeys = maskedKeys.map((key, i) => ({
    buffer: key,
    index: startIndex + i,
  }));

  await nextcloud.uploadKeyBatch(
    pacteId,
    indexedKeys.map(k => k.buffer)
  );

  console.log(`[KeyManager] Lot de ${BATCH_SIZE} clés généré et chiffré (pacte=${pacteId}, index ${startIndex} à ${startIndex + BATCH_SIZE - 1}).`);

  return { count: BATCH_SIZE, startIndex };
}

// ─── Récupération de clés ─────────────────────────────────────

async function fetchKeyBatch(pacteId, startIndex, count) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const index = startIndex + i;
    const exists = await nextcloud.keyExists(pacteId, index);
    if (!exists) break;
    
    const buf = await nextcloud.downloadKey(pacteId, index);
    results.push({ index, keyBuffer: buf });
  }
  return results;
}

function zeroKeyBatch(batch) {
  for (const { keyBuffer } of batch) {
    if (Buffer.isBuffer(keyBuffer)) keyBuffer.fill(0);
  }
}

// ─── Suppression (Forward Secrecy) ────────────────────────────

async function confirmKeysUsed(pacteId, indexes) {
  const deletes = indexes.map(i =>
    nextcloud.deleteKey(pacteId, i).catch(e =>
      console.warn(`[KeyManager] Avertissement lors de la suppression de l'index ${i}:`, e.message)
    )
  );
  await Promise.all(deletes);
  console.log(`[KeyManager] ${indexes.length} clés confirmées détruites pour le pacte ${pacteId}.`);
}

async function shouldRefill(pacteId, currentIndex) {
  const remaining = BATCH_SIZE - (currentIndex % BATCH_SIZE);
  return remaining <= REFILL_THRESHOLD;
}

const { zeroBuffer } = require("./pqc");

module.exports = {
  zeroBuffer,
  zeroKeyBatch,
  generateSecret,
  generateKeyBatch,
  maskKeyBatch,
  generateAndUploadBatch,
  fetchKeyBatch,
  confirmKeysUsed,
  shouldRefill,
  BATCH_SIZE,
  KEY_BYTES,
  REFILL_THRESHOLD,
};