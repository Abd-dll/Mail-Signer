// ============================================================
// content.js — Script injecté dans Gmail (Interface Client)
// ============================================================

const LOCAL = "http://localhost:3000";
const LOCAL_TOKEN = "f10ce3400667235a908b43aa6247608423a527ab4a5507f1e5222db95ca3a0ca"; // Même valeur que config.json
const RAILWAY_URL = "https://mail-signer-railway-app-production.up.railway.app";

// Sets pour éviter d'injecter les boutons plusieurs fois
const processedToolbars = new WeakSet();
const processedMessages = new WeakSet();

// Stockage des pièces jointes capturées
window._msAttachments = [];

// ─── Injection du sidebar dans le DOM ────────────────────────────────────────
function createSidebar() {
  if (document.getElementById("mailsigner-sidebar")) return;

  const sidebar = document.createElement("div");
  sidebar.id = "mailsigner-sidebar";
  sidebar.innerHTML = `
    <div id="mailsigner-header">
      <span id="mailsigner-title">Mail Signer</span>
      <button id="mailsigner-close">✕</button>
    </div>
    <div id="mailsigner-content"></div>
  `;
  document.body.appendChild(sidebar);
  document.getElementById("mailsigner-close").addEventListener("click", closeSidebar);
}

function openSidebar(mode, data) {
  createSidebar();
  const sidebar = document.getElementById("mailsigner-sidebar");
  sidebar.classList.add("open");

  // Affichage d'un chargement pendant la vérification de session
  const content = document.getElementById("mailsigner-content");
  content.innerHTML = `<div class="ms-status ms-info" style="display:block;">[Info] Vérification de l'identité...</div>`;

  // Vérification de la présence du JWT dans la mémoire locale de Chrome
  chrome.storage.local.get(["jwt"], (res) => {
      if (res.jwt) {
          // L'utilisateur est connecté, affichage de l'outil demandé
          if (mode === "sign") renderSignPanel(data);
          else if (mode === "verify") renderVerifyPanel(data);
      } else {
          // L'utilisateur n'est pas connecté, affichage de l'authentification
          renderAuthPanel(mode, data);
      }
  });
}

function closeSidebar() {
  const sidebar = document.getElementById("mailsigner-sidebar");
  if (sidebar) sidebar.classList.remove("open");
}

// ─── Panneau AUTHENTIFICATION (Connexion & Inscription) ──────────────────────
function renderAuthPanel(mode, data) {
    const content = document.getElementById("mailsigner-content");
    
    const titleEl = document.getElementById("mailsigner-title");
    if (titleEl) titleEl.textContent = "Mail Signer";

    content.innerHTML = `
      <div id="ms-auth-container" style="padding: 10px;">
        
        <!-- FORMULAIRE DE CONNEXION -->
        <div id="ms-login-section">
            <h3 style="margin-top:0; color:#333; font-size: 14px;">Connexion</h3>
            <input type="email" id="ms-login-email" placeholder="Votre email" class="ms-input" style="width:100%; margin-bottom:8px; padding:8px; box-sizing:border-box;" />
            <input type="password" id="ms-login-pass" placeholder="Mot de passe" class="ms-input" style="width:100%; margin-bottom:12px; padding:8px; box-sizing:border-box;" />
            
            <button id="ms-btn-login" class="ms-btn" style="width:100%; padding:8px; background:#3498db; color:white; border:none; border-radius:4px; cursor:pointer;">Se connecter</button>
            
            <div style="text-align:center; margin-top:12px; font-size:12px;">
                <a href="#" id="ms-link-to-register" style="color:#3498db; text-decoration:none;">Pas encore de compte ? S'inscrire</a>
            </div>
        </div>

        <!-- FORMULAIRE D'INSCRIPTION (Caché par défaut) -->
        <div id="ms-register-section" style="display:none;">
            <h3 style="margin-top:0; color:#333; font-size: 14px;">Créer un compte</h3>
            
            <!-- Champ pseudo (username) -->
            <input type="text" id="ms-reg-user" placeholder="Votre pseudo (username)" class="ms-input" style="width:100%; margin-bottom:8px; padding:8px; box-sizing:border-box;" />
            
            <input type="email" id="ms-reg-email" placeholder="Votre email" class="ms-input" style="width:100%; margin-bottom:8px; padding:8px; box-sizing:border-box;" />
            <input type="password" id="ms-reg-pass" placeholder="Mot de passe" class="ms-input" style="width:100%; margin-bottom:8px; padding:8px; box-sizing:border-box;" />
            <input type="password" id="ms-reg-pass-confirm" placeholder="Confirmer mot de passe" class="ms-input" style="width:100%; margin-bottom:12px; padding:8px; box-sizing:border-box;" />
            
            <button id="ms-btn-register" class="ms-btn ms-btn-green" style="width:100%; padding:8px; background:#2ecc71; color:white; border:none; border-radius:4px; cursor:pointer;">S'inscrire</button>
            
            <div style="text-align:center; margin-top:12px; font-size:12px;">
                <a href="#" id="ms-link-to-login" style="color:#3498db; text-decoration:none;">Déjà un compte ? Se connecter</a>
            </div>
        </div>

        <!-- Zone d'affichage des statuts d'authentification -->
        <div id="ms-auth-status" class="ms-status" style="display:none; margin-top:15px; padding:8px; border-radius:4px; font-size:12px; text-align:center;"></div>
      </div>
    `;

    // Utilisation de requestAnimationFrame pour garantir le rendu du DOM avant l'attachement des événements
    requestAnimationFrame(() => {
        attachAuthListeners(mode, data);
    });
}

// ─── LOGIQUE D'AUTHENTIFICATION ──────────────────────────────────────────────
function attachAuthListeners(mode, data) {
    const loginSection = document.getElementById("ms-login-section");
    const registerSection = document.getElementById("ms-register-section");
    const statusDiv = document.getElementById("ms-auth-status");
    
    const linkToRegister = document.getElementById("ms-link-to-register");
    const linkToLogin = document.getElementById("ms-link-to-login");
    const btnLogin = document.getElementById("ms-btn-login");
    const btnRegister = document.getElementById("ms-btn-register");

    // -- Bascule (Toggle) entre Connexion et Inscription --
    if (linkToRegister && loginSection && registerSection && statusDiv) {
        linkToRegister.addEventListener("click", (e) => {
            e.preventDefault();
            loginSection.style.display = "none";
            registerSection.style.display = "block";
            statusDiv.style.display = "none";
        });
    }

    if (linkToLogin && loginSection && registerSection && statusDiv) {
        linkToLogin.addEventListener("click", (e) => {
            e.preventDefault();
            registerSection.style.display = "none";
            loginSection.style.display = "block";
            statusDiv.style.display = "none";
        });
    }

    // -- Action : Se Connecter --
    if (btnLogin) {
        btnLogin.addEventListener("click", async () => {
            const email = document.getElementById("ms-login-email")?.value.trim();
            const password = document.getElementById("ms-login-pass")?.value;

            if (!email || !password) return showAuthStatus("Veuillez remplir tous les champs.", "error");

            showAuthStatus("[Info] Connexion au Cloud en cours...", "info");
            try {
                const res = await fetch(`${RAILWAY_URL}/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password })
                });
                const dataRes = await res.json();

                if (res.ok && dataRes.token) {
                    showAuthStatus("[Succès] Connecté. Configuration du tunnel local...", "ok");
                    
                    chrome.storage.local.set({ jwt: dataRes.token }, async () => {
                        try {
                            await fetch(LOCAL + "/auth/setup-jwt", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "X-Local-Token": LOCAL_TOKEN
                                },
                                body: JSON.stringify({ jwt: dataRes.token })
                            });
                            
                            openSidebar(mode, data);
                        } catch (err) {
                            showAuthStatus("[Erreur] Assurez-vous que le serveur local est lancé.", "error");
                        }
                    });

                } else {
                    showAuthStatus("[Erreur] " + (dataRes.error || "Identifiants invalides"), "error");
                }
            } catch (err) {
                showAuthStatus("[Erreur] Serveur Cloud injoignable.", "error");
            }
        });
    }

    // -- Action : S'inscrire --
    if (btnRegister) {
        btnRegister.addEventListener("click", async () => {
            const username = document.getElementById("ms-reg-user")?.value.trim();
            const email = document.getElementById("ms-reg-email")?.value.trim();
            const password = document.getElementById("ms-reg-pass")?.value;
            const confirmPass = document.getElementById("ms-reg-pass-confirm")?.value;

            if (!username || !email || !password || !confirmPass) {
                return showAuthStatus("Veuillez remplir tous les champs.", "error");
            }
            if (password !== confirmPass) {
                return showAuthStatus("Les mots de passe ne correspondent pas.", "error");
            }

            showAuthStatus("[Info] Création du compte en cours...", "info");
            try {
                const res = await fetch(`${RAILWAY_URL}/auth/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, email, password })
                });
                const dataRes = await res.json();

                if (res.ok) {
                    showAuthStatus("[Succès] Compte créé. Vous pouvez vous connecter.", "ok");
                    setTimeout(() => {
                        const emailInput = document.getElementById("ms-login-email");
                        const passInput = document.getElementById("ms-login-pass");
                        const userInput = document.getElementById("ms-reg-user");
                        const linkLogin = document.getElementById("ms-link-to-login");

                        if (emailInput) emailInput.value = email;
                        if (passInput) passInput.value = "";
                        if (userInput) userInput.value = "";
                        if (linkLogin) linkLogin.click();
                    }, 1500);
                } else {
                    showAuthStatus("[Erreur] " + (dataRes.error || "Impossible de créer le compte"), "error");
                }
            } catch (err) {
                showAuthStatus("[Erreur] Serveur Cloud injoignable.", "error");
            }
        });
    }
}

function showAuthStatus(message, type) {
    const statusDiv = document.getElementById("ms-auth-status");
    if (!statusDiv) return;

    statusDiv.textContent = message;
    statusDiv.style.display = "block";
    
    if (type === "error") {
        statusDiv.style.color = "#c0392b";
        statusDiv.style.backgroundColor = "#fadbd8";
    } else if (type === "ok") {
        statusDiv.style.color = "#27ae60";
        statusDiv.style.backgroundColor = "#d5f5e3";
    } else {
        statusDiv.style.color = "#2980b9";
        statusDiv.style.backgroundColor = "#d4e6f1";
    }
}

// ─── Panneaux Principaux ─────────────────────────────────────────────────────
function renderSignPanel(data) {
  const content = document.getElementById("mailsigner-content");
  
  const titleEl = document.getElementById("mailsigner-title");
  if (titleEl) titleEl.textContent = "Préparer l'envoi";

  content.innerHTML = `
    <div id="ms-status-service" class="ms-status ms-info">[Info] Vérification du service local...</div>

    <div class="ms-field">
      <label>Destinataire capturé</label>
      <input type="email" id="ms-to" value="${escapeHtml(data.to || '')}" readonly style="background-color: #f1f3f4; cursor: not-allowed;" />
    </div>

    <div class="ms-field">
      <label>Sujet capturé</label>
      <input type="text" id="ms-subject" value="${escapeHtml(data.subject || '')}" readonly style="background-color: #f1f3f4; cursor: not-allowed;" />
    </div>

    <div class="ms-field">
      <label>Corps du mail capturé</label>
      <textarea id="ms-body" readonly style="background-color: #f1f3f4; cursor: not-allowed; resize: none; height: 80px;">${escapeHtml(data.body || '')}</textarea>
    </div>

    <div class="ms-field" style="font-size: 11px; color: #555; background: #e8f0fe; padding: 6px; border-radius: 4px;">
      Pièces jointes détectées : <strong id="ms-attach-count">${window._msAttachments ? window._msAttachments.length : 0}</strong>
    </div>

    <div style="display:flex; gap:8px; margin-top:12px;">
      <button id="ms-btn-sign" class="ms-btn" style="flex:2;" disabled>Signer</button>
      <button id="ms-btn-pacte-toggle" class="ms-btn ms-btn-green" style="flex:1;" title="Nouveau pacte">Pactiser</button>
    </div>

    <div id="ms-pacte-section" style="display:none; margin-top:10px; padding:10px; border:1px dashed #2ecc71; border-radius:6px; background:#f9fcf9;">
        <label style="font-size:11px; font-weight:bold; color:#27ae60;">Email du contact à pactiser :</label>
        <input type="email" id="ms-pacte-email" placeholder="contact@email.com" value="${escapeHtml(data.to || '')}" style="width:100%; box-sizing:border-box; margin-top:4px; padding:6px; border:1px solid #ccc; border-radius:4px;" />
        <button id="ms-btn-do-pacte" class="ms-btn ms-btn-green" style="margin-top:8px; width:100%; padding:6px;">Lancer la poignée de main</button>
    </div>

    <div id="ms-status-sign" class="ms-status" style="display:none; margin-top:8px;"></div>

    <div id="ms-result" style="display:none; margin-top:8px;">
      <div class="ms-result-box">
        <div class="ms-field">
          <label>Clé utilisée</label>
          <input type="text" id="ms-out-keyid" readonly />
        </div>
      </div>
      <button id="ms-btn-insert" class="ms-btn ms-btn-green" style="margin-top:8px;">Insérer la signature</button>
      <div id="ms-status-insert" class="ms-status ms-ok" style="display:none;">[Succès] Signature insérée.</div>
    </div>
  `;

  requestAnimationFrame(() => {
      const btnSign = document.getElementById("ms-btn-sign");
      const btnPacteToggle = document.getElementById("ms-btn-pacte-toggle");
      const btnDoPacte = document.getElementById("ms-btn-do-pacte");

      if (btnSign) btnSign.addEventListener("click", doSign);
      
      if (btnPacteToggle) {
          btnPacteToggle.addEventListener("click", () => {
              const section = document.getElementById("ms-pacte-section");
              if (section) section.style.display = section.style.display === "none" ? "block" : "none";
          });
      }

      if (btnDoPacte) {
          btnDoPacte.addEventListener("click", () => {
              const emailInput = document.getElementById("ms-pacte-email");
              const email = emailInput ? emailInput.value.trim() : "";
              if (!email || !email.includes('@')) {
                  setStatus("ms-status-sign", "error", "Veuillez entrer un email valide.");
                  show("ms-status-sign");
                  return;
              }
              doCreatePact(email);
          });
      }

      checkService("sign");
  });

  // Synchronisation en temps réel (Live Sync)
  if (window._msSyncInterval) clearInterval(window._msSyncInterval);
  window._msSyncInterval = setInterval(() => {
      if (!document.getElementById("ms-to")) {
          clearInterval(window._msSyncInterval);
          return;
      }

      const cw = window._msActiveCompose;
      if (cw) {
          const subjectEl = cw.querySelector("input[name='subjectbox'], input[placeholder='Objet']");
          const bodyEl = cw.querySelector("div[aria-label='Corps du message'], div[aria-label='Message Body'], div[g_editable='true']");
          const toEmail = extractRecipient(cw);

          const toField = document.getElementById("ms-to");
          const subjField = document.getElementById("ms-subject");
          const bodyField = document.getElementById("ms-body");

          if (toField && toEmail) toField.value = toEmail;
          if (subjField && subjectEl) subjField.value = subjectEl.value;
          if (bodyField && bodyEl) bodyField.value = bodyEl.innerText;
          
          const attachCount = document.getElementById("ms-attach-count");
          if (attachCount) {
              attachCount.innerText = window._msAttachments ? window._msAttachments.length : 0;
          }
      }
  }, 500);
}

function renderVerifyPanel(data) {
  const content = document.getElementById("mailsigner-content");
  
  const titleEl = document.getElementById("mailsigner-title");
  if (titleEl) titleEl.textContent = "Vérifier la signature";

  content.innerHTML = `
    <div id="ms-status-service" class="ms-status ms-info">[Info] Vérification du service local...</div>

    <div class="ms-sig-info">
      <div class="ms-sig-row"><span>Clé</span><b>${escapeHtml(data.key_id || '')}</b></div>
      <div class="ms-sig-row"><span>Appareil</span><b>${escapeHtml(data.device_id || '')}</b></div>
    </div>

    <button id="ms-btn-verify" class="ms-btn" disabled>Vérifier maintenant</button>

    <div id="ms-status-verify" class="ms-status" style="display:none;"></div>

    <div id="ms-result-banner" style="display:none;"></div>
  `;

  requestAnimationFrame(() => {
      const btnVerify = document.getElementById("ms-btn-verify");
      if (btnVerify) {
          btnVerify.addEventListener("click", function() {
            doVerify(data);
          });
      }
      checkService("verify");
  });
}

// ─── Appels au service local ──────────────────────────────────────────────────
function checkService(mode) {
  fetch(LOCAL + "/status")
    .then(r => r.json())
    .then(data => {
      if (data.running) {
        setStatus("ms-status-service", "ok", `[Actif] Service local opérationnel`);
        const btnId = mode === "sign" ? "ms-btn-sign" : "ms-btn-verify";
        const btn = document.getElementById(btnId);
        if (btn) btn.disabled = false;
      } else {
        setStatus("ms-status-service", "error", "[Erreur] Service local inactif");
      }
    })
    .catch(() => {
      setStatus("ms-status-service", "error", "[Erreur] Impossible de joindre localhost:3000");
    });
}

function doCreatePact(targetEmail) {
    setStatus("ms-status-sign", "info", `[Info] Création du pacte avec ${targetEmail}...`);
    show("ms-status-sign");
    
    const btnDoPacte = document.getElementById("ms-btn-do-pacte");
    if (btnDoPacte) btnDoPacte.disabled = true;

    fetch(LOCAL + "/pacte/create", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Local-Token": LOCAL_TOKEN
        },
        body: JSON.stringify({ targetEmail: targetEmail })
    })
    .then(r => r.json())
    .then(data => {
        if (btnDoPacte) btnDoPacte.disabled = false;
        if (data.error) {
            setStatus("ms-status-sign", "error", "[Erreur] " + data.error);
        } else {
            setStatus("ms-status-sign", "ok", `[Succès] Pacte établi. Vous pouvez signer.`);
        }
    })
    .catch(err => {
        if (btnDoPacte) btnDoPacte.disabled = false;
        setStatus("ms-status-sign", "error", "[Erreur] Impossible de joindre le service local.");
    });
}

async function doSign() {
  const btnSign = document.getElementById("ms-btn-sign");
  const toEl = document.getElementById("ms-to");
  const subjectEl = document.getElementById("ms-subject");
  const bodyEl = document.getElementById("ms-body");

  const to = toEl ? toEl.value.trim() : "";
  const subject = subjectEl ? subjectEl.value : "";
  const body = bodyEl ? bodyEl.value : "";
  
  const attachment_hashes = [];
  if (window._msAttachments && window._msAttachments.length > 0) {
      for (let file of window._msAttachments) {
          const hash = await hashFile(file);
          attachment_hashes.push(hash);
      }
  }

  if (!to || !subject || !body) {
    setStatus("ms-status-sign", "error", "Veuillez remplir le destinataire, le sujet et le corps dans Gmail avant de signer.");
    show("ms-status-sign");
    return;
  }

  if (btnSign) btnSign.disabled = true;
  setStatus("ms-status-sign", "info", "[Info] Signature en cours...");
  show("ms-status-sign");

  fetch(LOCAL + "/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Local-Token": LOCAL_TOKEN
    },
    body: JSON.stringify({ to, subject, body, attachment_hashes })
  })
  .then(r => r.json())
  .then(data => {
    if (btnSign) btnSign.disabled = false;
    if (data.error) {
      setStatus("ms-status-sign", "error", "[Erreur] " + data.error);
    } else {
      setStatus("ms-status-sign", "ok", "[Succès] Document signé.");
      show("ms-result");
      
      const outKeyId = document.getElementById("ms-out-keyid");
      if (outKeyId) outKeyId.value = data.key_id;

      const signatureBlock = `
<br><br>
<div class="mailsigner-sig-block" style="border-left: 3px solid #2ecc71; padding-left: 10px; margin-top: 20px; font-family: monospace; color: #555;">
  <strong>[Protégé par Mail Signer (PQC)]</strong><br>
  Appareil : ${data.device_id}<br>
  Clé : ${data.key_id}<br>
  Sig : ${data.ciphertext_b64}
</div>`;

      const btnInsert = document.getElementById("ms-btn-insert");
      if (btnInsert) {
          btnInsert.onclick = () => {
            const composeWindow = document.querySelector("div[g_editable='true'][role='textbox']");
            if (composeWindow) {
               composeWindow.innerHTML += signatureBlock;
               setStatus("ms-status-insert", "ok", "[Succès] Signature insérée dans le mail.");
               show("ms-status-insert");
               
               window._msAttachments = [];
               const attachCount = document.getElementById("ms-attach-count");
               if (attachCount) attachCount.innerText = "0";
            } else {
               setStatus("ms-status-insert", "error", "[Erreur] Fenêtre de rédaction introuvable.");
               show("ms-status-insert");
            }
          };
      }
    }
  })
  .catch(err => {
    if (btnSign) btnSign.disabled = false;
    setStatus("ms-status-sign", "error", "[Erreur] Impossible de joindre le service local.");
  });
}

function doVerify(sigData) {
  setStatus("ms-status-verify", "info", "[Info] Vérification...");
  show("ms-status-verify");
  
  const btnVerify = document.getElementById("ms-btn-verify");
  if (btnVerify) btnVerify.disabled = true;

  fetch(LOCAL + "/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Local-Token": LOCAL_TOKEN
    },
    body: JSON.stringify({
      from_email:        sigData.from_email,
      subject:           sigData.subject,
      body:              sigData.body,
      key_id:            sigData.key_id,
      ciphertext_b64:    sigData.ciphertext_b64,
      attachment_hashes: sigData.attachment_hashes || []
    })
  })
  .then(r => r.json())
  .then(data => {
    if (btnVerify) btnVerify.disabled = false;

    if (data.error) {
      setStatus("ms-status-verify", "error", "" + data.error);
      return;
    }

    const banner = document.getElementById("ms-result-banner");
    if (!banner) return;

    if (data.valid) {
      banner.className = "ms-banner ms-banner-valid";
      banner.innerHTML = `[Succès] Signature valide<br><small>Appareil certifié : <strong>${data.device_id}</strong></small>`;
      setStatus("ms-status-verify", "ok", "Vérification réussie");
    } else {
      banner.className = "ms-banner ms-banner-invalid";
      banner.innerHTML = "[Alerte] Signature invalide<br><small>Ce mail a peut-être été altéré</small>";
      setStatus("ms-status-verify", "error", "Signature incorrecte");
    }
    show("ms-result-banner");
  })
  .catch(err => {
    if (btnVerify) btnVerify.disabled = false;
    setStatus("ms-status-verify", "error", "[Erreur Réseau] " + err.message);
  });
}

// ─── Détection des boutons Gmail ──────────────────────────────────────────────
function injectSignButton(toolbar) {
  if (toolbar.querySelector(".ms-sign-btn")) return;

  const btn = document.createElement("div");
  btn.className = "ms-sign-btn";
  btn.title = "Signer ce mail";
  btn.setAttribute("role", "button");
  btn.setAttribute("tabindex", "0");
  btn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4285f4" stroke-width="2.5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
    <span style="font-size:12px;font-family:'Google Sans',Arial,sans-serif;color:#4285f4;font-weight:600;margin-left:4px;">Signer</span>
  `;
  btn.addEventListener("click", () => {
    const cw = findComposeWindow(toolbar);
    window._msActiveCompose = cw;

    const subjectEl = cw.querySelector("input[name='subjectbox'], input[placeholder='Objet']");
    const bodyEl = cw.querySelector("div[aria-label='Corps du message'], div[aria-label='Message Body'], div[g_editable='true']");
    const recipientEmail = extractRecipient(cw);

    openSidebar("sign", {
      to:      recipientEmail,
      subject: subjectEl ? subjectEl.value : "",
      body:    bodyEl    ? bodyEl.innerText : ""
    });
  });

  toolbar.appendChild(btn);
}

function injectVerifyButton(messageEl, sigData) {
  if (messageEl.querySelector(".ms-verify-btn")) return;
  if (messageEl.dataset.msSigned) return;
  messageEl.dataset.msSigned = "1";

  const subject = document.querySelector("h2.hP")?.innerText.trim() || "";
  const body    = extractBodyFromMessage(messageEl);

  const fromEmailEl = document.querySelector("span.gD"); 
  const fromEmail = fromEmailEl ? fromEmailEl.getAttribute("email") : "inconnu@gmail.com";

  sigData.subject = subject;
  sigData.body    = body;
  sigData.from_email = fromEmail;

  const btn = document.createElement("button");
  btn.className = "ms-verify-btn";
  btn.textContent = "Vérifier la signature";
  btn.addEventListener("click", async () => {
    const attachment_hashes = await hashAttachmentsFromMessage(messageEl);
    openSidebar("verify", {
      from_email:        sigData.from_email,
      subject:           sigData.subject,
      body:              sigData.body,
      key_id:            sigData.key_id,
      device_id:         sigData.device_id,
      ciphertext_b64:    sigData.ciphertext_b64,
      attachment_hashes: attachment_hashes
    });
  });

  messageEl.appendChild(btn);
}

// ─── Extractions de données ───────────────────────────────────────────────────
function extractBodyFromMessage(messageEl) {
  const clone = messageEl.cloneNode(true);

  // 1. Tente de supprimer les blocs par leur classe (si Gmail ne les a pas purgés)
  clone.querySelectorAll(".mailsigner-sig-block").forEach(el => el.remove());
  clone.querySelectorAll(".ms-verify-btn").forEach(el => el.remove());
  
  // NOUVEAU : Supprime l'historique de conversation (les citations et le bouton [...])
  clone.querySelectorAll(".gmail_quote, .gmail_extra, .adL").forEach(el => el.remove());

  clone.style.position = "absolute";
  clone.style.left = "-9999px";
  document.body.appendChild(clone);
  let text = clone.innerText.trim();
  document.body.removeChild(clone);

  // 2. CORRECTION DU BUG : On inclut le crochet '[' dans le motif de découpe !
  if (text.includes("[Protégé par Mail Signer")) {
      text = text.split("[Protégé par Mail Signer")[0];
  } else if (text.includes("Protégé par Mail Signer")) {
      text = text.split("Protégé par Mail Signer")[0]; // Fallback au cas où
  }

  // 3. Sécurité finale (Regex) : on nettoie les crochets orphelins et les sauts de ligne invisibles à la fin
  text = text.replace(/[\n\r\s\[\]]+$/, '').trim();

  return text;
}

function extractSignatureData(messageEl) {
    const text = messageEl.innerText || "";
    if (!text.includes("Protégé par Mail Signer")) return null;

    const deviceMatch = text.match(/Appareil\s*:\s*([^\n]+)/);
    const keyMatch = text.match(/Clé\s*:\s*([a-zA-Z0-9\-_]+_\d+)/);
    const sigMatch = text.match(/Sig\s*:\s*([A-Za-z0-9+/=]+)/);

    if (deviceMatch && keyMatch && sigMatch) {
        return {
            v: 1,
            device_id: deviceMatch[1].trim(),
            key_id: keyMatch[1].trim(),
            ciphertext_b64: sigMatch[1].trim()
        };
    }
    return null;
}

function extractRecipient(composeWindow) {
  if (!composeWindow) return "";
  
  const chips = composeWindow.querySelectorAll('span[email], div[data-hovercard-id], span[data-hovercard-id]');
  for (let chip of chips) {
    const email = chip.getAttribute('email') || chip.getAttribute('data-hovercard-id');
    if (email && email.includes('@')) return email.trim();
  }

  const inputs = composeWindow.querySelectorAll('input[type="text"], input[type="email"], input[peoplekit-id]');
  for (let input of inputs) {
      if (input.value && input.value.includes('@')) {
          return input.value.trim();
      }
  }

  return "";
}

function findComposeWindow(toolbar) {
    let parent = toolbar.closest("div[role='dialog']"); 
    if (!parent) parent = toolbar.closest(".M9"); 
    if (!parent) parent = toolbar.closest(".AD"); 
    if (!parent) parent = document; 
    return parent;
}

// ─── Observateur DOM & Helpers ───────────────────────────────────────────────
const observer = new MutationObserver(() => {
  const fileInput = document.querySelector("input[type='file']");
  if (fileInput && !fileInput._msListening) {
    fileInput._msListening = true;
    fileInput.addEventListener("change", (e) => {
      const newFiles = Array.from(e.target.files);
      window._msAttachments = [...(window._msAttachments || []), ...newFiles];
    }, true);
  }

  document.querySelectorAll("td.gU.aYL").forEach(toolbar => {
    if (!processedToolbars.has(toolbar)) {
      processedToolbars.add(toolbar);
      injectSignButton(toolbar);
    }
  });

  document.querySelectorAll(".a3s.aiL").forEach(messageEl => {
    if (!processedMessages.has(messageEl)) {
      const sigData = extractSignatureData(messageEl);
      if (sigData) {
        processedMessages.add(messageEl);
        injectVerifyButton(messageEl, sigData);
      }
    }
  });
});
observer.observe(document.body, { childList: true, subtree: true });

async function hashFile(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashAttachmentsFromMessage(messageEl) {
  const container = messageEl.closest(".adn") || document.body;
  const spans = Array.from(container.querySelectorAll("span[download_url]"));
  if (spans.length === 0) return [];
  const hashes = [];
  for (const span of spans) {
    try {
      const raw = span.getAttribute("download_url");
      const url = raw.substring(raw.lastIndexOf("https://"));
      if (!url) continue;
      const response = await fetch(url, { credentials: "include" });
      const buffer   = await response.arrayBuffer();
      const hashBuf  = await crypto.subtle.digest("SHA-256", buffer);
      const hashHex  = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
      hashes.push(hashHex);
    } catch (e) {
      console.warn("[Avertissement] Impossible de hasher la pièce jointe :", e.message);
    }
  }
  return hashes;
}

function setStatus(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `ms-status ms-${type}`;
  el.textContent = msg;
  el.style.display = "block";
}

function show(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "block";
}

function hide(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}