// ============================================================
// popup.js - Contrôleur de la vue d'authentification native
// ============================================================

const RAILWAY_URL = "https://mail-signer-railway-app-production.up.railway.app";
const LOCAL_URL = "http://localhost:3000";
const LOCAL_TOKEN = "f10ce3400667235a908b43aa6247608423a527ab4a5507f1e5222db95ca3a0ca";

// Vérification de la session active au chargement
chrome.storage.local.get(["userEmail", "jwt"], (res) => {
    if (res.jwt) {
        showLoggedView(res.userEmail);
        linkToLocalServer(res.jwt); 
    }
});

document.getElementById("btn-register").addEventListener("click", () => handleAuth("/auth/register"));
document.getElementById("btn-login").addEventListener("click", () => handleAuth("/auth/login"));

document.getElementById("btn-logout").addEventListener("click", () => {
    chrome.storage.local.remove(["userEmail", "jwt"]);
    document.getElementById("login-view").classList.remove("hidden");
    document.getElementById("logged-view").classList.add("hidden");
    setStatus("Session fermée.", "blue");
});

function handleAuth(route) {
    const email = document.getElementById("email").value;
    const username = document.getElementById("username").value || "User";
    const password = document.getElementById("password").value;

    if (!email || !password) return setStatus("Champs requis manquants.", "red");
    setStatus("Authentification auprès du service d'annuaire...", "black");

    fetch(RAILWAY_URL + route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password })
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) throw new Error(data.error);
        
        chrome.storage.local.set({ userEmail: email, jwt: data.token });
        showLoggedView(email);
        linkToLocalServer(data.token);
    })
    .catch(e => setStatus("[Erreur] " + e.message, "red"));
}

function linkToLocalServer(jwt) {
    setStatus("Transmission du jeton au service local...", "black");
    fetch(LOCAL_URL + "/auth/setup-jwt", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "X-Local-Token": LOCAL_TOKEN
        },
        body: JSON.stringify({ jwt: jwt })
    })
    .then(r => r.json())
    .then(data => {
        if(data.error) throw new Error(data.error);
        setStatus("Service local actif. Tunnel établi.", "green");
    })
    .catch(e => setStatus("[Erreur] Service local inaccessible.", "red"));
}

function showLoggedView(email) {
    document.getElementById("login-view").classList.add("hidden");
    document.getElementById("logged-view").classList.remove("hidden");
    document.getElementById("user-display").innerText = email;
}

function setStatus(msg, color) {
    const statusDiv = document.getElementById("status");
    statusDiv.innerText = msg;
    statusDiv.style.color = color;
}