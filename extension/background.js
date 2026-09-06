// ============================================================
// background.js - Service Worker de l'extension
// Gère la persistance de la session de manière asynchrone
// ============================================================

const LOCAL_URL = "http://localhost:3000";
const LOCAL_TOKEN = "f10ce3400667235a908b43aa6247608423a527ab4a5507f1e5222db95ca3a0ca";

chrome.runtime.onStartup.addListener(autoArmTunnel);
chrome.runtime.onInstalled.addListener(autoArmTunnel);

// Implémentation du système "Heartbeat" pour la synchronisation du JWT
chrome.alarms.create("jwtHeartbeat", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "jwtHeartbeat") {
        autoArmTunnel();
    }
});

function autoArmTunnel() {
    // Vérification de la présence d'une session active dans le stockage local
    chrome.storage.local.get(["jwt"], (res) => {
        if (res.jwt) {
            // Transmission asynchrone du jeton au service cryptographique local
            fetch(LOCAL_URL + "/auth/setup-jwt", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "X-Local-Token": LOCAL_TOKEN
                },
                body: JSON.stringify({ jwt: res.jwt })
            })
            .then(r => r.json())
            .then(data => {
                if (data.error) console.error("[Background] Erreur locale :", data.error);
            })
            .catch(() => {
                console.warn("[Background] Service local introuvable (En attente de démarrage).");
            });
        }
    });
}