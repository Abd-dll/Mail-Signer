// ============================================================
// pqc.js - Logique d'encapsulation hybride (KEM + ECDH)
// Implémente le standard ML-KEM-768 (NIST FIPS 203)
// ============================================================

const crypto = require("crypto");
const { ml_kem768 } = require('@noble/post-quantum/ml-kem.js');

// ─── Module KEM (Post-Quantique) ──────────────────────────────

function kemKeygen() {
  return ml_kem768.keygen();
}

function kemEncapsulate(publicKey) {
  return ml_kem768.encapsulate(publicKey);
}

function kemDecapsulate(cipherText, secretKey) {
  return ml_kem768.decapsulate(cipherText, secretKey);
}

// ─── Module Courbes Elliptiques (Classique) ───────────────────

function ecdhKeygen() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey(),
    privateKey: ecdh.getPrivateKey()
  };
}

function ecdhCompute(privateKeyRaw, peerPublicRaw) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privateKeyRaw);
  return ecdh.computeSecret(peerPublicRaw);
}

// ─── Dérivation Hybride (HKDF) ────────────────────────────────

function deriveHybridKey(ssPq, ssEcc, salt = null, info = "mailsigner-hybrid-v1") {
  const ikm  = Buffer.concat([Buffer.from(ssPq), Buffer.from(ssEcc)]);
  const s    = salt || crypto.randomBytes(32);
  return {
    key:  crypto.hkdfSync("sha256", ikm, s, info, 32),
    salt: s,
  };
}

// ─── Chiffrement Symétrique (AES-256-GCM) ─────────────────────

function aesEncrypt(key, plaintext) {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key), iv);
  const ct     = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, authTag: cipher.getAuthTag(), ciphertext: ct };
}

function aesDecrypt(key, iv, authTag, ciphertext) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(key), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ─── Interfaces d'Encapsulation Publiques ─────────────────────

async function encryptSecretForClient(clientKemPubKey, clientEcdhPubDer, secret) {
  const { cipherText: kemCt, sharedSecret: ssPq } = kemEncapsulate(clientKemPubKey);

  const { publicKey: serverEcdhPub, privateKey: serverEcdhPriv } = ecdhKeygen();
  const ssEcc = ecdhCompute(serverEcdhPriv, clientEcdhPubDer);

  const { key: masterKey, salt } = deriveHybridKey(ssPq, ssEcc);

  const { iv, authTag, ciphertext } = aesEncrypt(masterKey, secret);

  zeroBuffer(Buffer.from(ssPq));
  zeroBuffer(Buffer.from(ssEcc));
  zeroBuffer(Buffer.from(masterKey));

  return {
    kemCiphertext:   Buffer.from(kemCt).toString("base64"),
    serverEcdhPub:   serverEcdhPub.toString("base64"),
    salt:            salt.toString("base64"),
    iv:              iv.toString("base64"),
    authTag:         authTag.toString("base64"),
    encryptedSecret: ciphertext.toString("base64"),
  };
}

async function decryptSecretClient(clientKemSecKey, clientEcdhPrivDer, envelope) {
  const kemCt        = Buffer.from(envelope.kemCipherText, "base64");
  const serverEcdhPub = Buffer.from(envelope.serverEcdhPub, "base64");
  const salt         = Buffer.from(envelope.salt, "base64");
  const iv           = Buffer.from(envelope.iv, "base64");
  const authTag      = Buffer.from(envelope.authTag, "base64");
  const ciphertext   = Buffer.from(envelope.encryptedSecret, "base64");

  const ssPq = kemDecapsulate(kemCt, clientKemSecKey);

  const ssEcc = ecdhCompute(clientEcdhPrivDer, serverEcdhPub);

  const { key: masterKey } = deriveHybridKey(ssPq, ssEcc, salt);

  const secret = aesDecrypt(masterKey, iv, authTag, ciphertext);

  zeroBuffer(Buffer.from(ssPq));
  zeroBuffer(Buffer.from(ssEcc));
  zeroBuffer(Buffer.from(masterKey));

  return secret;
}

// ─── Utilitaire de sécurité mémoire ───────────────────────────

function zeroBuffer(buf) {
  if (Buffer.isBuffer(buf)) buf.fill(0);
}

module.exports = {
  kemKeygen,
  kemEncapsulate,
  kemDecapsulate,
  ecdhKeygen,
  ecdhCompute,
  deriveHybridKey,
  aesEncrypt,
  aesDecrypt,
  encryptSecretForClient,
  decryptSecretClient,
  zeroBuffer,
};