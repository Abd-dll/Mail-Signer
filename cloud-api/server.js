// ============================================================
// server.js - API Gateway (Service d'Annuaire)
// Tunnel Hybride : ML-KEM-768 + ECDH P-256
// ============================================================

require("dotenv").config();
const express       = require("express");
const jwt           = require("jsonwebtoken");
const bcrypt        = require("bcrypt");
const crypto        = require("crypto");

const db            = require("./db");
const keyMgr        = require("./keyManager");
const nextcloud     = require("./nextcloud");
const SessionManager = require('./sessionManager');

const app           = express();
const PORT          = process.env.PORT || 3000;
const SALT_ROUNDS   = 10;

const PUBLIC_ROUTES = ['/status', '/auth/login', '/auth/register', '/auth/handshake'];

app.use(express.json({ limit: "64kb" }));

// ─── Middleware CORS ──────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-ID");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, PATCH, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

// ─── Intercepteur de Session (Chiffrement Applicatif) ────────
app.use(async (req, res, next) => {
    if (PUBLIC_ROUTES.includes(req.path)) {
        return next();
    }

    const sessionId = req.headers['x-session-id'];
    if (!sessionId) {
        return res.status(401).json({ error: "Session requise : en-tête X-Session-ID manquant." });
    }

    const sessionInfo = await db.getValidSessionKey(sessionId);
    if (!sessionInfo) {
        return res.status(401).json({ error: "Session expirée ou non reconnue." });
    }

    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
        if (req.body && req.body.data && req.body.iv && req.body.tag) {
            try {
                const decryptedPayload = SessionManager.decryptData(req.body, sessionInfo.session_key_hex);
                req.body = decryptedPayload; 
            } catch (error) {
                console.error("[Sécurité] Tentative d'altération du payload interceptée.");
                return res.status(400).json({ error: "Échec de déchiffrement ou intégrité compromise." });
            }
        }
    }

    const originalJson = res.json;
    res.json = function (data) {
        const encryptedResponse = SessionManager.encryptData(data, sessionInfo.session_key_hex);
        originalJson.call(this, encryptedResponse); 
    };

    req.userId = sessionInfo.user_id;
    next();
});

// ─── Authentification par jeton ───────────────────────────────
function authRequired(req, res, next) {
    const header = req.headers["authorization"];
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Jeton d'authentification manquant." });
    try {
        req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ error: "Jeton invalide ou expiré." });
    }
}

function signToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
    );
}

async function assertPactMember(pacteId, userId) {
    const pact = await db.getPactById(pacteId);
    if (!pact) throw Object.assign(new Error("Ressource introuvable"), { status: 404 });
    if (pact.user_a !== userId && pact.user_b !== userId)
        throw Object.assign(new Error("Accès refusé"), { status: 403 });
    return pact;
}

// ─── Routes Publiques ─────────────────────────────────────────

app.post("/auth/register", async (req, res) => {
    const { email, username, password } = req.body;
    if (!email || !username || !password) return res.status(400).json({ error: "Paramètres manquants." });
    try {
        if (await db.getUserByEmail(email)) return res.status(409).json({ error: "Identifiant indisponible." });
        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        const user = await db.createUser(email, username, hash);
        res.status(201).json({ token: signToken(user), user: { id: user.id, email, username } });
    } catch (e) { res.status(500).json({ error: "Erreur interne du serveur." }); }
});

app.post("/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Paramètres manquants." });
    try {
        const user = await db.getUserByEmail(email);
        if (!user || !(await bcrypt.compare(password, user.password_hash)))
            return res.status(401).json({ error: "Identifiants incorrects." });
        res.json({ token: signToken(user), user: { id: user.id, email: user.email, username: user.username } });
    } catch (e) { res.status(500).json({ error: "Erreur interne du serveur." }); }
});

app.post('/auth/handshake', authRequired, async (req, res) => {
    try {
        const userId = req.user.id;
        const kemPub = req.body.kem_pub_b64 || req.body.clientKemPub;
        const ecdhPub = req.body.ecdh_pub_b64 || req.body.clientEcdhPub;

        if (!kemPub || !ecdhPub) {
            return res.status(400).json({ error: "Matériel cryptographique incomplet." });
        }

        const sessionSecret = crypto.randomBytes(32).toString("hex");
        const envelope = await SessionManager.forgeSession(kemPub, ecdhPub, sessionSecret);
        const sessionId = await db.saveSessionKey(userId, sessionSecret);

        console.log(`[Handshake] Tunnel établi. Session ID : ${sessionId}`);
        
        res.json({ 
            session_id: sessionId, 
            secret_envelope: envelope 
        });
        
    } catch (error) {
        console.error("[Erreur Handshake]", error.message);
        res.status(500).json({ error: "Échec de l'établissement du tunnel sécurisé." });
    }
});

// ─── Routes Sécurisées (Via Tunnel) ───────────────────────────

app.get("/users/search", async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.status(400).json({ error: "Requête invalide." });
    try {
        const users = (await db.searchUsers(q)).filter(u => u.id !== req.userId);
        res.json(users);
    } catch (e) { res.status(500).json({ error: "Erreur interne du serveur." }); }
});

app.post("/pacte", async (req, res) => {
    const { user_b, kem_pub_b64, ecdh_pub_b64 } = req.body;
    
    if (!user_b || !kem_pub_b64 || !ecdh_pub_b64) return res.status(400).json({ error: "Paramètres manquants." });
    if (user_b === req.userId) return res.status(400).json({ error: "Opération non autorisée." });
    
    try {
        if (await db.getPactBetween(req.userId, user_b)) return res.status(409).json({ error: "Conflit : ressource existante." });

        const secret = crypto.randomBytes(32);
        const secretB64 = secret.toString("base64"); 

        const envelope = await SessionManager.forgeSession(kem_pub_b64, ecdh_pub_b64, secretB64);
        const pact = await db.createPact(req.userId, user_b, secretB64);
        
        const rawKeys    = keyMgr.generateKeyBatch();
        const maskedKeys = keyMgr.maskKeyBatch(rawKeys, secret);
        await nextcloud.uploadKeyBatch(pact.id_pacte, maskedKeys);

        console.log(`[Pacte] Nouveau lien établi : ${req.userId} et ${user_b}.`);
        res.status(201).json({ id_pacte: pact.id_pacte, keys_available: keyMgr.BATCH_SIZE, secret_envelope: envelope });
    } catch (e) { 
        console.error("[Erreur Pacte]", e.message);
        res.status(500).json({ error: "Erreur lors de la création de la ressource." }); 
    }
});

app.get("/pactes", async (req, res) => {
    try {
        const pacts = await db.getPactsForUser(req.userId);
        res.json(pacts.map(p => ({
            id_pacte: p.id_pacte, user_a: p.user_a, user_b: p.user_b,
            username_a: p.username_a, username_b: p.username_b, current_index: p.current_index,
        })));
    } catch (e) { res.status(500).json({ error: "Erreur interne du serveur." }); }
});

app.post("/pactes/:id/fetch-keys", async (req, res) => {
    const { id: pacteId } = req.params;

    try {
        const pact = await assertPactMember(pacteId, req.userId);
        
        const startIndex = pact.current_index; 
        const batch = await keyMgr.fetchKeyBatch(pacteId, startIndex, 100);

        if (batch.length === 0) return res.status(410).json({ error: "Ressource épuisée." });

        const keys = batch.map(({ index, keyBuffer }) => ({
            key_id: `${pacteId}_${index}`, index, key_enc_b64: keyBuffer.toString("base64"),
        }));

        res.json({ keys, fetched: batch.length });
    } catch (e) { 
        res.status(e.status || 500).json({ error: e.message }); 
    }
});

app.delete("/pactes/:id/keys/confirm", async (req, res) => {
    const { id: pacteId } = req.params;
    const { indexes } = req.body;

    if (!Array.isArray(indexes) || indexes.length === 0) return res.status(400).json({ error: "Format de requête invalide." });
    
    try {
        await assertPactMember(pacteId, req.userId);
        await keyMgr.confirmKeysUsed(pacteId, indexes);
        await db.incrementKeyIndex(req.params.id);
        
        res.json({ confirmed: indexes.length });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.post("/pacts/:id/refill", async (req, res) => {
    try {
        await assertPactMember(req.params.id, req.userId);
        const result = await _triggerRefill(req.params.id);
        res.json({ id_pacte: req.params.id, keys_generated: result.count });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

async function _triggerRefill(pacteId) {
    const secret = await db.getPactSecret(pacteId);
    const rawKeys = keyMgr.generateKeyBatch();
    const maskedKeys = keyMgr.maskKeyBatch(rawKeys, secret);
    await nextcloud.uploadKeyBatch(pacteId, maskedKeys);
    await db.resetKeyIndex(pacteId);
    return { count: keyMgr.BATCH_SIZE };
}

app.post("/pactes/:id/claim", async (req, res) => {
    const { id: pacteId } = req.params;
    const { kem_pub_b64, ecdh_pub_b64 } = req.body;

    if (!kem_pub_b64 || !ecdh_pub_b64) return res.status(400).json({ error: "Matériel cryptographique requis manquant." });

    try {
        const secretB64 = await db.getPactSecret(pacteId); 
        const envelope = await SessionManager.forgeSession(kem_pub_b64, ecdh_pub_b64, secretB64);

        res.json({ id_pacte: pacteId, secret_envelope: envelope });
    } catch (e) { 
        console.error("[Erreur Synchronisation]", e.message);
        res.status(500).json({ error: "Erreur lors de la synchronisation de l'état cryptographique." }); 
    }
});

// ─── Initialisation ───────────────────────────────────────────

app.get("/status", (req, res) => {
    res.json({ running: true, version: "2.1.0", mode: "hybrid-tunnel-active", pqc: "ML-KEM-768 + ECDH P-256 (FIPS 203)" });
});

async function start() {
    const required = ["JWT_SECRET", "DATABASE_URL", "NEXTCLOUD_URL", "NEXTCLOUD_USER", "NEXTCLOUD_PASS", "MASTER_KEY_HEX"];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) {
        console.error("Configuration environnementale incomplète :", missing.join(", "));
        process.exit(1);
    }
    await db.initDb();
    await nextcloud.ensureBaseDir();
    app.listen(PORT, () => {
        console.log(`[Démarrage] Serveur actif sur le port ${PORT}`);
        db.startSessionCleanup(); 
    });
}

start().catch(e => { console.error("Échec critique lors du démarrage :", e.message); process.exit(1); });