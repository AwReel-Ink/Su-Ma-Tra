// ============================================================
// sync-ui.js — Interface utilisateur de synchronisation
// Gère l'affichage des QR codes, scanner, progression, statut
// ============================================================

const SyncUI = (() => {
  'use strict';

  // ----------------------------------------------------------
  // ÉTAT INTERNE
  // ----------------------------------------------------------
  let role         = null; // 'initiateur' | 'repondant'
  let scannerActif = null; // instance QR scanner
  let modalEl      = null;

  // ----------------------------------------------------------
  // POINT D'ENTRÉE — Ouvrir le panneau de synchronisation
  // ----------------------------------------------------------
  function ouvrirPanneauSync() {
    modalEl = creerModal();
    document.body.appendChild(modalEl);
    afficherEcranChoixRole();
    piegerFocus(modalEl);
  }

  // ----------------------------------------------------------
  // FERMER PROPREMENT
  // ----------------------------------------------------------
  function fermer() {
    arreterScanner();
    SyncWebRTC.fermer();
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
    role = null;
  }

  // ----------------------------------------------------------
  // CRÉER LA MODAL DE BASE
  // ----------------------------------------------------------
  function creerModal() {
    const overlay = document.createElement('div');
    overlay.id = 'sync-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Synchronisation entre appareils');
    overlay.innerHTML = `
      <div id="sync-modal">
        <button id="sync-btn-fermer" aria-label="Fermer" title="Fermer">✕</button>
        <div id="sync-contenu"></div>
      </div>
    `;

    overlay.querySelector('#sync-btn-fermer').addEventListener('click', fermer);

    // Clic hors modal = fermer
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) fermer();
    });

    // Echap = fermer
    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') fermer();
    });

    return overlay;
  }

  // ----------------------------------------------------------
  // ÉCRAN 1 — CHOIX DU RÔLE
  // ----------------------------------------------------------
  function afficherEcranChoixRole() {
    setContenu(`
      <div class="sync-ecran" id="sync-ecran-role">
        <div class="sync-icone">🔄</div>
        <h2 class="sync-titre">Synchroniser les données</h2>
        <p class="sync-desc">
          Choisissez le rôle de <strong>cet appareil</strong> pour la synchronisation.
        </p>

        <div class="sync-roles">
          <button class="sync-role-btn" id="sync-btn-initiateur">
            <span class="sync-role-icone">📤</span>
            <span class="sync-role-nom">Cet appareil envoie</span>
            <span class="sync-role-desc">Il génère le premier QR code</span>
          </button>

          <button class="sync-role-btn" id="sync-btn-repondant">
            <span class="sync-role-icone">📥</span>
            <span class="sync-role-nom">Cet appareil reçoit</span>
            <span class="sync-role-desc">Il scanne le QR de l'autre</span>
          </button>
        </div>

        <p class="sync-note">
          💡 Les deux appareils doivent être sur le même réseau Wi-Fi ou proches l'un de l'autre.
        </p>
      </div>
    `);

    document.getElementById('sync-btn-initiateur').addEventListener('click', function() {
      role = 'initiateur';
      demarrerInitiateur();
    });

    document.getElementById('sync-btn-repondant').addEventListener('click', function() {
      role = 'repondant';
      demarrerRepondant();
    });
  }

  // ----------------------------------------------------------
  // FLUX INITIATEUR (Appareil A)
  // Étape 1 : génère QR offre
  // Étape 2 : scanne QR réponse
  // Étape 3 : sync
  // ----------------------------------------------------------
  async function demarrerInitiateur() {
    try {
      afficherChargement('Préparation de la connexion…');

      // Configurer les callbacks WebRTC
      SyncWebRTC.onConnected(function() {
        onConnexionEtablie();
      });
      SyncWebRTC.onData(function(donnees) {
        onDonneesRecues(donnees);
      });
      SyncWebRTC.onError(function(err) {
        afficherErreur(err.message);
      });
      SyncWebRTC.onProgress(function(pct) {
        mettreAJourProgression(pct);
      });

      const offreEncodee = await SyncWebRTC.genererOffre();
      afficherQRCode(offreEncodee, 'initiateur-offre');

    } catch(e) {
      afficherErreur('Impossible de démarrer la connexion : ' + e.message);
    }
  }

  // ----------------------------------------------------------
  // AFFICHER QR CODE + instructions selon l'étape
  // ----------------------------------------------------------
  function afficherQRCode(donneeQR, etape) {
    let titre, instruction, boutonLabel;

    if (etape === 'initiateur-offre') {
      titre        = 'Étape 1 sur 2 — QR code à scanner';
      instruction  = 'Montrez ce QR code à <strong>l\'autre appareil</strong>. Il va le scanner.';
      boutonLabel  = 'L\'autre appareil a scanné → Scanner sa réponse';
    } else if (etape === 'repondant-reponse') {
      titre        = 'Étape 2 sur 2 — QR code de réponse';
      instruction  = 'Montrez ce QR code à <strong>l\'appareil initial</strong>. Il va le scanner.';
      boutonLabel  = null;
    }

    setContenu(`
      <div class="sync-ecran" id="sync-ecran-qr">
        <h2 class="sync-titre">${titre}</h2>
        <p class="sync-desc">${instruction}</p>

        <div id="sync-qr-container">
          <canvas id="sync-qr-canvas"></canvas>
        </div>

        <div class="sync-qr-actions">
          ${boutonLabel ? `<button class="sync-btn-principal" id="sync-btn-scanner-suite">${boutonLabel}</button>` : ''}
          <button class="sync-btn-secondaire" id="sync-btn-retour-role">← Recommencer</button>
        </div>
      </div>
    `);

    // Générer le QR
    genererQRCanvas('sync-qr-canvas', donneeQR);

    if (boutonLabel) {
      document.getElementById('sync-btn-scanner-suite').addEventListener('click', function() {
        afficherScanner('initiateur-reponse');
      });
    }

    document.getElementById('sync-btn-retour-role').addEventListener('click', function() {
      SyncWebRTC.fermer();
      afficherEcranChoixRole();
    });
  }

  // ----------------------------------------------------------
  // AFFICHER LE SCANNER QR
  // ----------------------------------------------------------
  function afficherScanner(etape) {
    let titre, instruction;

    if (etape === 'repondant-offre') {
      titre       = 'Étape 1 sur 2 — Scanner le QR de l\'autre appareil';
      instruction = 'Pointez la caméra vers le QR code affiché sur l\'autre appareil.';
    } else if (etape === 'initiateur-reponse') {
      titre       = 'Étape 2 sur 2 — Scanner la réponse';
      instruction = 'Scannez le QR code affiché sur l\'autre appareil.';
    }

    setContenu(`
      <div class="sync-ecran" id="sync-ecran-scanner">
        <h2 class="sync-titre">${titre}</h2>
        <p class="sync-desc">${instruction}</p>

        <div id="sync-scanner-wrapper">
          <div id="sync-scanner-viewfinder">
            <video id="sync-scanner-video" playsinline muted></video>
            <div class="sync-scanner-cadre"></div>
          </div>
        </div>

        <p id="sync-scanner-statut" class="sync-scanner-statut">Démarrage de la caméra…</p>

        <button class="sync-btn-secondaire" id="sync-btn-retour-role">← Recommencer</button>
      </div>
    `);

    document.getElementById('sync-btn-retour-role').addEventListener('click', function() {
      arreterScanner();
      SyncWebRTC.fermer();
      afficherEcranChoixRole();
    });

    demarrerScanner(etape);
  }

  // ----------------------------------------------------------
  // DÉMARRER LE SCAN QR (caméra native)
  // ----------------------------------------------------------
  async function demarrerScanner(etape) {
    const video     = document.getElementById('sync-scanner-video');
    const statutEl  = document.getElementById('sync-scanner-statut');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });

      video.srcObject = stream;
      await video.play();

      if (statutEl) statutEl.textContent = 'Recherche du QR code…';

      // Utiliser BarcodeDetector si disponible, sinon fallback
      if ('BarcodeDetector' in window) {
        scanAvecBarcodeDetector(video, etape, stream);
      } else {
        scanAvecCanvas(video, etape, stream);
      }

    } catch(e) {
      if (statutEl) statutEl.textContent = '❌ Caméra inaccessible : ' + e.message;
    }
  }

  // ----------------------------------------------------------
  // SCAN VIA BarcodeDetector API (Chrome/Android natif)
  // ----------------------------------------------------------
  function scanAvecBarcodeDetector(video, etape, stream) {
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    let actif = true;

    scannerActif = { stop: function() { actif = false; arreterStream(stream); } };

    async function boucle() {
      if (!actif || !document.getElementById('sync-scanner-video')) return;

      try {
        const codes = await detector.detect(video);
        if (codes.length > 0) {
          const valeur = codes[0].rawValue;
          actif = false;
          arreterStream(stream);
          await traiterQRScanne(valeur, etape);
          return;
        }
      } catch(e) {
        // Frame pas encore disponible, on continue
      }

      requestAnimationFrame(boucle);
    }

    requestAnimationFrame(boucle);
  }

  // ----------------------------------------------------------
  // SCAN VIA CANVAS (fallback universel)
  // Utilise jsQR si disponible
  // ----------------------------------------------------------
  function scanAvecCanvas(video, etape, stream) {
    if (typeof jsQR === 'undefined') {
      const statutEl = document.getElementById('sync-scanner-statut');
      if (statutEl) statutEl.textContent = '❌ Scanner non disponible sur cet appareil';
      return;
    }

    const canvas  = document.createElement('canvas');
    const ctx     = canvas.getContext('2d');
    let actif     = true;

    scannerActif = { stop: function() { actif = false; arreterStream(stream); } };

    function boucle() {
      if (!actif || !document.getElementById('sync-scanner-video')) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);
        if (code) {
          actif = false;
          arreterStream(stream);
          traiterQRScanne(code.data, etape);
          return;
        }
      }
      requestAnimationFrame(boucle);
    }

    requestAnimationFrame(boucle);
  }

  // ----------------------------------------------------------
  // ARRÊTER LE STREAM CAMÉRA
  // ----------------------------------------------------------
  function arreterStream(stream) {
    if (stream) {
      stream.getTracks().forEach(function(t) { t.stop(); });
    }
  }

  function arreterScanner() {
    if (scannerActif) {
      scannerActif.stop();
      scannerActif = null;
    }
  }

  // ----------------------------------------------------------
  // TRAITER UN QR SCANNÉ
  // ----------------------------------------------------------
  async function traiterQRScanne(valeur, etape) {
    try {
      if (etape === 'repondant-offre') {
        // Côté B : on a reçu l'offre, on génère la réponse
        afficherChargement('Traitement du QR code…');
        const reponseEncodee = await SyncWebRTC.recevoirOffreEtRepondre(valeur);
        afficherQRCode(reponseEncodee, 'repondant-reponse');

      } else if (etape === 'initiateur-reponse') {
        // Côté A : on a reçu la réponse → connexion !
        afficherChargement('Connexion en cours…');
        await SyncWebRTC.recevoirReponse(valeur);
        // onConnected callback prendra le relais
      }
    } catch(e) {
      afficherErreur('QR code invalide : ' + e.message);
    }
  }

  // ----------------------------------------------------------
  // FLUX RÉPONDANT (Appareil B)
  // ----------------------------------------------------------
  async function demarrerRepondant() {
    // Configurer les callbacks
    SyncWebRTC.onConnected(function() {
      onConnexionEtablie();
    });
    SyncWebRTC.onData(function(donnees) {
      onDonneesRecues(donnees);
    });
    SyncWebRTC.onError(function(err) {
      afficherErreur(err.message);
    });
    SyncWebRTC.onProgress(function(pct) {
      mettreAJourProgression(pct);
    });

    afficherScanner('repondant-offre');
  }

  // ----------------------------------------------------------
  // CONNEXION ÉTABLIE → lancer l'échange
  // ----------------------------------------------------------
  async function onConnexionEtablie() {
    afficherChargement('Connexion établie ! Échange des données…');

    try {
      const donnees = await SyncFusion.collecterDonneesLocales();
      await SyncWebRTC.envoyerDonnees(donnees);
      console.log('[SyncUI] Données envoyées, en attente des données distantes…');
      afficherAttente();
    } catch(e) {
      afficherErreur('Erreur lors de l\'envoi : ' + e.message);
    }
  }

  // ----------------------------------------------------------
  // DONNÉES REÇUES → fusionner et appliquer
  // ----------------------------------------------------------
  async function onDonneesRecues(donneesDistantes) {
    try {
      afficherChargement('Fusion des données…');
      const donneesLocales = await SyncFusion.collecterDonneesLocales();
      const fusionne       = await SyncFusion.fusionnerTout(donneesLocales, donneesDistantes);
      await SyncFusion.appliquerFusion(fusionne);

      afficherSucces({
        travailleurs: fusionne.travailleurs.length,
        machines:     fusionne.machines.length,
        journal:      fusionne.journal.length
      });

    } catch(e) {
      afficherErreur('Erreur lors de la fusion : ' + e.message);
    }
  }

  // ----------------------------------------------------------
  // ÉCRAN ATTENTE (données envoyées, on attend l'autre)
  // ----------------------------------------------------------
  function afficherAttente() {
    setContenu(`
      <div class="sync-ecran sync-ecran-attente">
        <div class="sync-spinner" aria-hidden="true"></div>
        <h2 class="sync-titre">Données envoyées ✅</h2>
        <p class="sync-desc">En attente des données de l'autre appareil…</p>
        <div class="sync-progress-wrapper">
          <div class="sync-progress-bar" id="sync-progress-bar" style="width:0%"></div>
        </div>
        <p id="sync-progress-label" class="sync-progress-label">0 %</p>
      </div>
    `);
  }

  // ----------------------------------------------------------
  // MISE À JOUR DE LA BARRE DE PROGRESSION
  // ----------------------------------------------------------
  function mettreAJourProgression(pct) {
    const bar   = document.getElementById('sync-progress-bar');
    const label = document.getElementById('sync-progress-label');
    if (bar)   bar.style.width   = pct + '%';
    if (label) label.textContent = pct + ' %';
  }

  // ----------------------------------------------------------
  // ÉCRAN CHARGEMENT
  // ----------------------------------------------------------
  function afficherChargement(message) {
    setContenu(`
      <div class="sync-ecran sync-ecran-chargement">
        <div class="sync-spinner" aria-hidden="true"></div>
        <p class="sync-desc">${message}</p>
      </div>
    `);
  }

  // ----------------------------------------------------------
  // ÉCRAN SUCCÈS
  // ----------------------------------------------------------
  function afficherSucces(stats) {
    setContenu(`
      <div class="sync-ecran sync-ecran-succes">
        <div class="sync-icone-succes" aria-hidden="true">✅</div>
        <h2 class="sync-titre">Synchronisation réussie !</h2>
        <ul class="sync-stats">
          <li><strong>${stats.travailleurs}</strong> travailleur(s)</li>
          <li><strong>${stats.machines}</strong> machine(s)</li>
          <li><strong>${stats.journal}</strong> entrée(s) de journal</li>
        </ul>
        <p class="sync-desc">Les données sont à jour sur cet appareil.</p>
        <button class="sync-btn-principal" id="sync-btn-terminer">Terminer</button>
      </div>
    `);

    document.getElementById('sync-btn-terminer').addEventListener('click', function() {
      fermer();
      // Recharger l'interface principale si disponible
      if (typeof App !== 'undefined' && typeof App.rafraichir === 'function') {
        App.rafraichir();
      }
    });
  }

  // ----------------------------------------------------------
  // ÉCRAN ERREUR
  // ----------------------------------------------------------
  function afficherErreur(message) {
    setContenu(`
      <div class="sync-ecran sync-ecran-erreur">
        <div class="sync-icone-erreur" aria-hidden="true">❌</div>
        <h2 class="sync-titre">Une erreur est survenue</h2>
        <p class="sync-desc sync-erreur-msg">${message}</p>
        <div class="sync-erreur-actions">
          <button class="sync-btn-principal" id="sync-btn-reessayer">Réessayer</button>
          <button class="sync-btn-secondaire" id="sync-btn-fermer-erreur">Fermer</button>
        </div>
      </div>
    `);

    document.getElementById('sync-btn-reessayer').addEventListener('click', function() {
      SyncWebRTC.fermer();
      afficherEcranChoixRole();
    });

    document.getElementById('sync-btn-fermer-erreur').addEventListener('click', fermer);
  }

  // ----------------------------------------------------------
  // GÉNÉRER UN QR CODE SUR CANVAS (lib qrcode.js)
  // ----------------------------------------------------------
  function genererQRCanvas(canvasId, donnees) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Vider le conteneur et remplacer canvas par un div
  const container = canvas.parentElement;
  container.innerHTML = '';
  const div = document.createElement('div');
  container.appendChild(div);

  if (typeof QRCode !== 'undefined') {
    new QRCode(div, {
      text:         donnees,
      width:        260,
      height:       260,
      colorDark:    '#1a1a2e',
      colorLight:   '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    div.textContent = 'QR lib manquante';
    console.warn('[SyncUI] qrcode.js non chargé');
  }
}

  // ----------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------
  function setContenu(html) {
    const zone = document.getElementById('sync-contenu');
    if (zone) zone.innerHTML = html;
  }

  function piegerFocus(el) {
    setTimeout(function() {
      const premier = el.querySelector('button, [tabindex]');
      if (premier) premier.focus();
    }, 50);
  }

    // ----------------------------------------------------------
  // API PUBLIQUE
  // ----------------------------------------------------------
  return {
    ouvrir: ouvrirPanneauSync,
    fermer
  };

})(); // ← fin de l'IIFE, SyncUI existe maintenant

// Branchement du bouton
document.addEventListener('DOMContentLoaded', function() {
  var btn = document.getElementById('btn-ouvrir-sync');
  if (btn) btn.addEventListener('click', function() {
    SyncUI.ouvrir();
  });
});