// ============================================================
// railwayClient.js — Cœur du Tunnel Hybride (Client)
// ============================================================

const crypto = require("crypto");
const localCrypto = require("./crypto");
const config = require("./config.json");

const RAILWAY_URL = "https://mail-signer-railway-app-production.up.railway.app";

let activeSession = {
    id: null,
    keyHex: null,
    jwt: null
};

async function performHandshake() {
    if (!activeSession.jwt) {
        throw new Error("Authentification requise : pas de JWT trouvé.");
    }

    console.log("[PQC] Initialisation du Handshake Hybride...");

    const clientEcdh = localCrypto.generateECDH();
    const clientEcdhPub = clientEcdh.getPublicKey('base64');

    const kemKeyPair = localCrypto.generateKemKeyPair();
    const clientKemPub = kemKeyPair.publicKey.toString('base64');

    const response = await fetch(`${RAILWAY_URL}/auth/handshake`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeSession.jwt}`
        },
        body: JSON.stringify({
            clientKemPub: clientKemPub,
            clientEcdhPub: clientEcdhPub
        })
    });

    if (!response.ok) throw new Error(`Handshake échoué (Status: ${response.status})`);
    
    const data = await response.json();

    const envelope = data.secret_envelope;
    const sessionId = data.session_id;

    if (!envelope || !sessionId) {
        throw new Error("L'enveloppe ou le Session ID est introuvable dans la réponse du serveur.");
    }

    const serverEcdhPub = Buffer.from(envelope.serverEcdhPub, 'base64');
    const ecdhSecret = clientEcdh.computeSecret(serverEcdhPub);

    const kemCtBase64 = envelope.kemCiphertext || envelope.kemCipherText;
    const kemCiphertext = Buffer.from(kemCtBase64, 'base64');
    const kemSecret = localCrypto.decapsulateKem(kemCiphertext, kemKeyPair.privateKey);

    const salt = Buffer.from(envelope.salt, 'base64');
    const ikm = Buffer.concat([kemSecret, ecdhSecret]);
    const decryptionKeyBuffer = crypto.hkdfSync("sha256", ikm, salt, "mailsigner-hybrid-v1", 32);

    const iv = Buffer.from(envelope.iv, 'base64');
    const authTag = Buffer.from(envelope.authTag || envelope.tag, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', decryptionKeyBuffer, iv);
    decipher.setAuthTag(authTag);

    let sessionSecretStr = decipher.update(envelope.encryptedSecret, 'base64', 'utf8');
    sessionSecretStr += decipher.final('utf8');

    activeSession.id = sessionId;
    activeSession.keyHex = sessionSecretStr;

    console.log(`[PQC] Tunnel établi. Session ID: ${activeSession.id.substring(0, 8)}...`);
}

async function secureFetch(path, method = 'GET', bodyObj = null) {
    if (!activeSession.id || !activeSession.keyHex) {
        await performHandshake();
    }

    const performRequest = async () => {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-Session-ID': activeSession.id
            }
        };

        if (bodyObj && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
            options.body = JSON.stringify(encryptWithSession(bodyObj));
        }

        return await fetch(`${RAILWAY_URL}${path}`, options);
    };

    let response = await performRequest();

    if (response.status === 401) {
        console.warn("[Avertissement] Session expirée. Renégociation du tunnel en cours...");
        await performHandshake();
        response = await performRequest();
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erreur API: ${response.status}`);
    }

    const encryptedData = await response.json();
    return decryptWithSession(encryptedData);
}

async function requestNewPact(targetEmail) {
    const users = await secureFetch(`/users/search?q=${targetEmail}`);
    if (!users || users.length === 0) {
        throw new Error("Destinataire introuvable sur la plateforme.");
    }
    const targetUser = users[0];

    const kemKeyPair = localCrypto.generateKemKeyPair();
    const clientEcdh = localCrypto.generateECDH();

    const responseData = await secureFetch('/pacte', 'POST', {
        user_b: targetUser.id,
        device_a: config.device_id,
        kem_pub_b64: kemKeyPair.publicKey.toString('base64'),
        ecdh_pub_b64: clientEcdh.getPublicKey('base64')
    });

    const envelope = responseData.secret_envelope;
    
    const serverEcdhPub = Buffer.from(envelope.serverEcdhPub, 'base64');
    const ecdhSecret = clientEcdh.computeSecret(serverEcdhPub);

    const kemCtBase64 = envelope.kemCiphertext || envelope.kemCipherText;
    const kemCiphertext = Buffer.from(kemCtBase64, 'base64');
    const kemSecret = localCrypto.decapsulateKem(kemCiphertext, kemKeyPair.privateKey);

    const salt = Buffer.from(envelope.salt, 'base64');
    const ikm = Buffer.concat([kemSecret, ecdhSecret]);
    const decryptionKeyBuffer = crypto.hkdfSync("sha256", ikm, salt, "mailsigner-hybrid-v1", 32);

    const iv = Buffer.from(envelope.iv, 'base64');
    const authTag = Buffer.from(envelope.authTag || envelope.tag, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', decryptionKeyBuffer, iv);
    decipher.setAuthTag(authTag);

    let rawSecretStr = decipher.update(envelope.encryptedSecret, 'base64', 'utf8');
    rawSecretStr += decipher.final('utf8');

    return {
        id_pacte: responseData.id_pacte,
        secret_brut: rawSecretStr
    };
}

function encryptWithSession(data) {
    const key = Buffer.from(activeSession.keyHex, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    return { iv: iv.toString('base64'), data: encrypted, tag: cipher.getAuthTag().toString('base64') };
}

function decryptWithSession(payload) {
    const key = Buffer.from(activeSession.keyHex, 'hex');
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(payload.data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
}

function setJwt(token) { activeSession.jwt = token; }

function getRailwayUrl() { return RAILWAY_URL; }

async function claimPact(pacteId) {
    console.log(`[Auto-Claim] Récupération du secret PQC pour le pacte ${pacteId}...`);

    const kemKeyPair = localCrypto.generateKemKeyPair();
    const clientEcdh = localCrypto.generateECDH();

    const responseData = await secureFetch(`/pactes/${pacteId}/claim`, 'POST', {
        kem_pub_b64: kemKeyPair.publicKey.toString('base64'),
        ecdh_pub_b64: clientEcdh.getPublicKey('base64')
    });

    const envelope = responseData.secret_envelope;
    
    const serverEcdhPub = Buffer.from(envelope.serverEcdhPub, 'base64');
    const ecdhSecret = clientEcdh.computeSecret(serverEcdhPub);

    const kemCtBase64 = envelope.kemCiphertext || envelope.kemCipherText;
    if (!kemCtBase64) {
        throw new Error("L'enveloppe de synchronisation ne contient pas le ciphertext PQC.");
    }
    const kemCiphertext = Buffer.from(kemCtBase64, 'base64');
    const kemSecret = localCrypto.decapsulateKem(kemCiphertext, kemKeyPair.privateKey);

    const salt = Buffer.from(envelope.salt, 'base64');
    const ikm = Buffer.concat([kemSecret, ecdhSecret]);
    const decryptionKeyBuffer = crypto.hkdfSync("sha256", ikm, salt, "mailsigner-hybrid-v1", 32);

    const iv = Buffer.from(envelope.iv, 'base64');
    const authTag = Buffer.from(envelope.authTag || envelope.tag, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', decryptionKeyBuffer, iv);
    decipher.setAuthTag(authTag);

    let rawSecretStr = decipher.update(envelope.encryptedSecret, 'base64', 'utf8');
    rawSecretStr += decipher.final('utf8');

    return {
        id_pacte: pacteId,
        secret_brut: rawSecretStr
    };
}

module.exports = { secureFetch, requestNewPact, setJwt, getRailwayUrl, claimPact };