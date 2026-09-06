// ============================================================
// sessionManager.js - Logique de chiffrement applicatif
// ============================================================

const crypto = require('crypto');
const pqc = require('./pqc');

class SessionManager {
    static async forgeSession(kemPubB64, ecdhPubB64, secretStr) {
        const clientKemPub = Buffer.from(kemPubB64, 'base64');
        const clientEcdhPub = Buffer.from(ecdhPubB64, 'base64');

        const encResult = pqc.kemEncapsulate(clientKemPub);
        const kemCt = encResult.ciphertext || encResult.cipherText;
        const ssPq = encResult.sharedSecret;
        
        if (!kemCt || !ssPq) {
            throw new Error("Erreur système lors de l'encapsulation KEM.");
        }

        const serverEcdh = pqc.ecdhKeygen();
        const ecdhSecret = pqc.ecdhCompute(serverEcdh.privateKey, clientEcdhPub);

        const salt = crypto.randomBytes(32);
        const ikm = Buffer.concat([Buffer.from(ssPq), Buffer.from(ecdhSecret)]);
        const hybridKey = crypto.hkdfSync('sha256', ikm, salt, 'mailsigner-hybrid-v1', 32);

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', hybridKey, iv);
        
        let encrypted = cipher.update(secretStr, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const authTag = cipher.getAuthTag();

        return {
            kemCiphertext: Buffer.from(kemCt).toString('base64'),
            serverEcdhPub: Buffer.from(serverEcdh.publicKey).toString('base64'),
            salt: salt.toString('base64'),
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64'),
            encryptedSecret: encrypted
        };
    }

    static encryptData(dataObject, sessionKeyHex) {
        const key = Buffer.from(sessionKeyHex, 'hex');
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        let encrypted = cipher.update(JSON.stringify(dataObject), 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const authTag = cipher.getAuthTag().toString('base64');

        return {
            iv: iv.toString('base64'),
            data: encrypted,
            tag: authTag
        };
    }

    static decryptData(encryptedPayload, sessionKeyHex) {
        const key = Buffer.from(sessionKeyHex, 'hex');
        const iv = Buffer.from(encryptedPayload.iv, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(Buffer.from(encryptedPayload.tag, 'base64'));

        let decrypted = decipher.update(encryptedPayload.data, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    }
}

module.exports = SessionManager;