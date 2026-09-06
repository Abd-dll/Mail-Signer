const crypto = require("crypto");
const { normalize } = require("./normalize");
const { ml_kem768 } = require('@noble/post-quantum/ml-kem.js');

function hash(data) {
  return crypto.createHash("sha256").update(data, "utf8").digest();
}

function xorBuffers(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new Error("xorBuffers expects Buffers");
  }

  if (a.length !== b.length) {
    throw new Error("Buffers must have same length for XOR");
  }

  const out = Buffer.alloc(a.length);

  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] ^ b[i];
  }

  return out;
}

function prepare(subject, body, secret, attachmentHashes = []) {
  subject = normalize(subject);
  body    = normalize(body);
  secret  = normalize(secret);

  if (attachmentHashes.length > 0) {
    const attachments = [...attachmentHashes].sort().join(",");
    return subject + "\n---\n" + body + "\n---\n" + attachments + "\n---\n" + secret;
  }

  return subject + "\n---\n" + body + "\n---\n" + secret;
}

function sign(subject, body, secret, key, attachmentHashes = []) {
  if (!Buffer.isBuffer(key)) {
    key = Buffer.from(key);
  }

  if (key.length !== 32) {
    throw new Error("Key must be 32 bytes for SHA-256 hash XOR");
  }

  const prepared = prepare(subject, body, secret, attachmentHashes);
  
  const hashed   = hash(prepared);
  console.log("\n=== 🔒 DEBUG CRYPTO (ALICE : SIGNATURE) ===");
  console.log("1. Texte préparé (brut) :", JSON.stringify(prepared));
  console.log("2. Hash SHA-256 attendu (Hex) :", hashed.toString('hex'));
  console.log("3. Clé K utilisée (Hex) :", key.toString('hex').substring(0, 20) + "...");
  console.log("===========================================\n");
  const ciphertext = xorBuffers(hashed, key);

  return { ciphertext };
}

function verify(subject, body, secret, key, signature, attachmentHashes = []) {
  try {
    if (!Buffer.isBuffer(key)) {
      key = Buffer.from(key);
    }

    if (key.length !== 32) {
      return false;
    }

    if (!signature || !Buffer.isBuffer(signature.ciphertext)) {
      return false;
    }

    if (signature.ciphertext.length !== 32) {
      return false;
    }

    const prepared     = prepare(subject, body, secret, attachmentHashes);
    const expectedHash = hash(prepared);

    const recoveredHash = xorBuffers(signature.ciphertext, key);
    console.log("\n=== 🔓 DEBUG CRYPTO (BOB : VÉRIFICATION) ===");
    console.log("1. Texte préparé (brut) :", JSON.stringify(prepared));
    console.log("2. Hash SHA-256 attendu (Hex) :", expectedHash.toString('hex'));
    console.log("3. Sceau reçu (Hex) :", signature.ciphertext.toString('hex').substring(0, 20) + "...");
    console.log("4. Clé K locale (Hex) :", key.toString('hex').substring(0, 20) + "...");
    console.log("5. Hash récupéré via XOR (Hex) :", recoveredHash.toString('hex'));
    console.log("6. Match Parfait ? :", crypto.timingSafeEqual(recoveredHash, expectedHash));
    console.log("============================================\n");

    return crypto.timingSafeEqual(recoveredHash, expectedHash);
  } catch (e) {
    return false;
  }
}

// ─── TUNNEL HYBRIDE (SESSION) ────────────────────────────────────────────────

function generateECDH() {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    return ecdh;
}

function generateKemKeyPair() {
    const keys = ml_kem768.keygen();
    
    const privKey = keys.secretKey || keys.privateKey || keys.sk;
    const pubKey = keys.publicKey || keys.pk;

    if (!privKey || !pubKey) {
        throw new Error("[Erreur KEM] Clés générées introuvables. Vérifiez la version de @noble.");
    }

    return {
        publicKey: Buffer.from(pubKey),
        privateKey: Buffer.from(privKey)
    };
}

function decapsulateKem(ciphertext, privateKey) {
    const ct = new Uint8Array(ciphertext);
    const sk = new Uint8Array(privateKey);
    
    const sharedSecret = ml_kem768.decapsulate(ct, sk);
    return Buffer.from(sharedSecret);
}

function deriveHybridSessionKey(kemSecret, ecdhSecret) {
    const combined = Buffer.concat([kemSecret, ecdhSecret]);
    return crypto.createHash('sha256').update(combined).digest('hex');
}

module.exports = {
    hash,
    xorBuffers,
    prepare,
    sign,
    verify,
    generateECDH, 
    generateKemKeyPair, 
    decapsulateKem, 
    deriveHybridSessionKey 
};