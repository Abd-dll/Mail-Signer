// ============================================================
// nextcloud.js - Couche de stockage WebDAV
// ============================================================

const { createClient } = require("webdav");

function getClient() {
  return createClient(process.env.NEXTCLOUD_URL, {
    username: process.env.NEXTCLOUD_USER,
    password: process.env.NEXTCLOUD_PASS,
  });
}

const BASE_DIR = "mailsigner-keys";

function keyPath(pacteId, index) {
  return `${BASE_DIR}/${pacteId}/${String(index).padStart(4, "0")}.enc`;
}

function pactDir(pacteId) {
  return `${BASE_DIR}/${pacteId}`;
}

async function ensureBaseDir() {
  const client = getClient();
  try {
    await client.createDirectory(BASE_DIR);
  } catch (e) {
    if (!e.status || (e.status !== 405 && e.status !== 409)) {
      throw e;
    }
  }
}

async function uploadKeyBatch(pacteId, keys) {
  const client = getClient();

  try {
    await client.createDirectory(pactDir(pacteId));
  } catch (e) {
    if (!e.status || (e.status !== 405 && e.status !== 409)) throw e;
  }

  const uploads = keys.map((keyBuffer, index) =>
    client.putFileContents(
      keyPath(pacteId, index),
      keyBuffer,
      { overwrite: true, contentLength: keyBuffer.length }
    )
  );

  await Promise.all(uploads);
  console.log(`[Stockage] ${keys.length} fichiers transférés pour le pacte ${pacteId}.`);
}

async function downloadKey(pacteId, index) {
  const client = getClient();
  const path = keyPath(pacteId, index);

  try {
    const data = await client.getFileContents(path, { format: "binary" });
    return Buffer.from(data);
  } catch (e) {
    if (e.status === 404) {
      throw new Error(`Ressource introuvable : pacte=${pacteId} index=${index}`);
    }
    throw e;
  }
}

async function deleteKey(pacteId, index) {
  const client = getClient();
  const path = keyPath(pacteId, index);

  try {
    await client.deleteFile(path);
    console.log(`[Stockage] Fichier supprimé : pacte=${pacteId} index=${index}`);
  } catch (e) {
    console.warn(`[Stockage] Avertissement de suppression sur le chemin ${path} :`, e.message);
  }
}

async function deletePactKeys(pacteId) {
  const client = getClient();
  try {
    await client.deleteFile(pactDir(pacteId));
    console.log(`[Stockage] Répertoire de pacte supprimé : ${pacteId}`);
  } catch (e) {
    console.warn(`[Stockage] Échec de la suppression du répertoire :`, e.message);
  }
}

async function keyExists(pacteId, index) {
  const client = getClient();
  try {
    await client.stat(keyPath(pacteId, index));
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  ensureBaseDir,
  uploadKeyBatch,
  downloadKey,
  deleteKey,
  deletePactKeys,
  keyExists,
};