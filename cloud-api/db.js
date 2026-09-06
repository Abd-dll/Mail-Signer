// ============================================================
// db.js - Couche de persistance PostgreSQL
// Chiffrement AES-256-GCM au repos (At-Rest) pour secret_enc
// ============================================================

const { Pool } = require("pg");
const crypto = require("crypto");

// ─── Chiffrement au repos ──────────────────────────────────────

function getMasterKey() {
  const hex = process.env.MASTER_KEY_HEX;
  if (!hex || hex.length !== 64) {
    throw new Error("Clé MASTER_KEY_HEX manquante ou invalide.");
  }
  return Buffer.from(hex, "hex");
}

function encryptAtRest(plaintext) {
  const key = getMasterKey();
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const pt = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext);
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

function decryptAtRest(stored) {
  const key = getMasterKey();
  const [ivB64, tagB64, ctB64] = stored.split(":");
  const iv  = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct  = Buffer.from(ctB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

// ─── Connexion et Initialisation de la base de données ─────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, 
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pacts (
      id_pacte     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_a       UUID NOT NULL,
      user_b       UUID NOT NULL,
      secret_enc   TEXT NOT NULL,
      current_index INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_a, user_b)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email        VARCHAR(255) UNIQUE NOT NULL,
      username     VARCHAR(255) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at   TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS session_keys (
      id_session UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      session_key_hex TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("[Système] Base de données initialisée.");
}

// ─── Gestion des Utilisateurs ──────────────────────────────────

async function createUser(email, username, passwordHash) {
  const res = await pool.query(
    `INSERT INTO users (email, username, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, username`,
    [email, username, passwordHash]
  );
  return res.rows[0];
}

async function getUserByEmail(email) {
  const res = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  return res.rows[0] || null;
}

async function searchUsers(query) {
  const res = await pool.query(
    `SELECT id, email, username FROM users
     WHERE email ILIKE $1 OR username ILIKE $1
     LIMIT 20`,
    [`%${query}%`]
  );
  return res.rows;
}

// ─── Gestion des Pactes ────────────────────────────────────────

async function createPact(userA, userB, secretBuffer) {
  const secretEncAtRest = encryptAtRest(secretBuffer);
  const res = await pool.query(
    `INSERT INTO pacts (user_a, user_b, secret_enc)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userA, userB, secretEncAtRest]
  );
  return res.rows[0];
}

async function getPactSecret(idPacte) {
  const pact = await getPactById(idPacte);
  if (!pact) throw new Error("Pacte introuvable");
  return decryptAtRest(pact.secret_enc);
}

async function getPactById(idPacte) {
  const res = await pool.query("SELECT * FROM pacts WHERE id_pacte = $1", [idPacte]);
  return res.rows[0] || null;
}

async function getPactBetween(userA, userB) {
  const res = await pool.query(
    `SELECT * FROM pacts
     WHERE (user_a = $1 AND user_b = $2)
        OR (user_a = $2 AND user_b = $1)`,
    [userA, userB]
  );
  return res.rows[0] || null;
}

async function getPactsForUser(userId) {
  const res = await pool.query(
    `SELECT p.*, 
            ua.username AS username_a, ua.email AS email_a,
            ub.username AS username_b, ub.email AS email_b
     FROM pacts p
     JOIN users ua ON ua.id = p.user_a
     JOIN users ub ON ub.id = p.user_b
     WHERE p.user_a = $1 OR p.user_b = $1`,
    [userId]
  );
  return res.rows;
}

async function incrementKeyIndex(idPacte) {
  const res = await pool.query(
    `UPDATE pacts
     SET current_index = current_index + 1
     WHERE id_pacte = $1
     RETURNING current_index`,
    [idPacte]
  );
  return res.rows[0]?.current_index;
}

async function resetKeyIndex(idPacte) {
  await pool.query("UPDATE pacts SET current_index = 0 WHERE id_pacte = $1", [idPacte]);
}

// ─── Gestion des Sessions Hybrides ─────────────────────────────

async function saveSessionKey(userId, sessionKeyHex) {
    const res = await pool.query(`
        INSERT INTO session_keys (user_id, session_key_hex, expires_at)
        VALUES ($1, $2, NOW() + INTERVAL '2 hours')
        RETURNING id_session
    `, [userId, sessionKeyHex]);
    return res.rows[0].id_session;
}

async function getValidSessionKey(sessionId) {
    const res = await pool.query(`
        SELECT user_id, session_key_hex
        FROM session_keys
        WHERE id_session = $1 AND expires_at > NOW()
    `, [sessionId]);
    return res.rows[0];
}

async function runCleanupNow() {
    try {
        const query = `DELETE FROM session_keys WHERE expires_at < NOW()`;
        const result = await pool.query(query); 
        
        if (result.rowCount > 0) {
            console.log(`[Nettoyage] ${result.rowCount} session(s) obsolète(s) purgée(s).`);
        }
    } catch (err) {
        console.error("[Nettoyage] Erreur lors de la purge :", err.message);
    }
}

function startSessionCleanup() {
    runCleanupNow();
    setInterval(runCleanupNow, 1000 * 60 * 60);
}

module.exports = {
  encryptAtRest,
  decryptAtRest,
  getPactSecret,
  initDb,
  createUser,
  getUserByEmail,
  searchUsers,
  createPact,
  getPactById,
  getPactBetween,
  getPactsForUser,
  incrementKeyIndex,
  resetKeyIndex,
  saveSessionKey,
  getValidSessionKey,
  startSessionCleanup
};