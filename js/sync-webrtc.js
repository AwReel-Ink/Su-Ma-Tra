// ============================================================
// sync-webrtc.js — Tunnel P2P WebRTC pour Su-Ma-Tra
// Échange de données via DataChannel, signaling par QR code
// ============================================================

const SyncWebRTC = (() => {
  'use strict';

  // ----------------------------------------------------------
  // CONFIGURATION ICE
  // Uniquement STUN Google — fonctionne en local sans internet
  // ----------------------------------------------------------
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  // ----------------------------------------------------------
  // ÉTAT INTERNE
  // ----------------------------------------------------------
  let peerConnection  = null;
  let dataChannel     = null;
  let onConnectedCb   = null;
  let onDataCb        = null;
  let onErrorCb       = null;
  let onProgressCb    = null;

  // Buffer de réception (les données arrivent en morceaux)
  let receiveBuffer   = [];
  let receivedSize    = 0;
  let expectedSize    = 0;

  // ----------------------------------------------------------
  // TAILLE MAX d'un message DataChannel (16kb safe)
  // ----------------------------------------------------------
  const CHUNK_SIZE = 16000;

  // ----------------------------------------------------------
  // CRÉER LA PEERCONNECTION
  // ----------------------------------------------------------
  function creerPeerConnection() {
    fermer(); // Nettoyer une éventuelle connexion précédente

    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    peerConnection.oniceconnectionstatechange = function() {
      const state = peerConnection.iceConnectionState;
      console.log('[WebRTC] ICE state:', state);

      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        if (onErrorCb) onErrorCb(new Error('Connexion WebRTC perdue: ' + state));
      }
    };

    peerConnection.onconnectionstatechange = function() {
      console.log('[WebRTC] Connection state:', peerConnection.connectionState);
    };

    return peerConnection;
  }

  // ----------------------------------------------------------
  // CONFIGURER LE DATACHANNEL (envoi et réception)
  // ----------------------------------------------------------
  function configurerDataChannel(channel) {
    dataChannel = channel;
    dataChannel.binaryType = 'arraybuffer';

    dataChannel.onopen = function() {
      console.log('[WebRTC] DataChannel ouvert ✅');
      if (onConnectedCb) onConnectedCb();
    };

    dataChannel.onclose = function() {
      console.log('[WebRTC] DataChannel fermé');
    };

    dataChannel.onerror = function(err) {
      console.error('[WebRTC] DataChannel erreur:', err);
      if (onErrorCb) onErrorCb(err);
    };

    dataChannel.onmessage = function(event) {
      traiterMessageRecu(event.data);
    };
  }

  // ----------------------------------------------------------
  // TRAITER UN MESSAGE REÇU
  // Protocole :
  //   Premier message  : JSON { type:'meta', size: N }
  //   Messages suivants: ArrayBuffer (chunks de données)
  //   Dernier message  : string 'END'
  // ----------------------------------------------------------
  function traiterMessageRecu(data) {
    // Message texte
    if (typeof data === 'string') {
      // Message de contrôle END
      if (data === 'END') {
        const blob = new Blob(receiveBuffer);
        const reader = new FileReader();
        reader.onload = function() {
          try {
            const texte = reader.result;
            const donnees = JSON.parse(texte);
            console.log('[WebRTC] Données reçues complètes ✅');
            receiveBuffer = [];
            receivedSize  = 0;
            expectedSize  = 0;
            if (onDataCb) onDataCb(donnees);
          } catch(e) {
            if (onErrorCb) onErrorCb(new Error('Erreur parsing données reçues'));
          }
        };
        reader.readAsText(blob);
        return;
      }

      // Message META (taille attendue)
      try {
        const meta = JSON.parse(data);
        if (meta.type === 'meta') {
          expectedSize  = meta.size;
          receiveBuffer = [];
          receivedSize  = 0;
          console.log(`[WebRTC] En attente de ${expectedSize} bytes...`);
        }
      } catch(e) {
        // pas un JSON de contrôle, ignorer
      }
      return;
    }

    // Chunk binaire
    receiveBuffer.push(data);
    receivedSize += data.byteLength;

    if (onProgressCb && expectedSize > 0) {
      onProgressCb(Math.round((receivedSize / expectedSize) * 100));
    }
  }

  // ----------------------------------------------------------
  // ENVOYER DES DONNÉES (JSON → binaire → chunks)
  // ----------------------------------------------------------
  async function envoyerDonnees(donnees) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      throw new Error('DataChannel non disponible');
    }

    // Sérialiser
    const texte  = JSON.stringify(donnees);
    const encoder = new TextEncoder();
    const buffer  = encoder.encode(texte);

    // Envoyer la taille en premier
    dataChannel.send(JSON.stringify({ type: 'meta', size: buffer.byteLength }));

    // Envoyer par chunks
    let offset = 0;
    while (offset < buffer.byteLength) {
      const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
      // Attendre que le buffer soit libéré si nécessaire
      await attendreBufferLibre();
      dataChannel.send(chunk);
      offset += CHUNK_SIZE;

      if (onProgressCb) {
        onProgressCb(Math.round((offset / buffer.byteLength) * 100));
      }
    }

    // Signal de fin
    dataChannel.send('END');
    console.log(`[WebRTC] Envoi terminé (${buffer.byteLength} bytes) ✅`);
  }

  // ----------------------------------------------------------
  // ATTENDRE QUE LE BUFFER DE SEND SOIT LIBRE
  // Évite de saturer le DataChannel
  // ----------------------------------------------------------
  function attendreBufferLibre() {
    return new Promise(function(resolve) {
      if (!dataChannel || dataChannel.bufferedAmount < 65536) {
        resolve();
        return;
      }
      const interval = setInterval(function() {
        if (!dataChannel || dataChannel.bufferedAmount < 65536) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });
  }

  // ----------------------------------------------------------
  // CÔTÉ A : GÉNÉRER L'OFFRE (celui qui affiche le 1er QR)
  // ----------------------------------------------------------
  async function genererOffre() {
    const pc = creerPeerConnection();

    // Créer le DataChannel côté initiateur
    const channel = pc.createDataChannel('sync', { ordered: true });
    configurerDataChannel(channel);

    // Collecter les candidats ICE avant de retourner l'offre
    const offre = await new Promise(async function(resolve, reject) {
      let offreSDP = null;
      let iceFini  = false;

      pc.onicecandidate = function(event) {
        if (event.candidate === null) {
          // Tous les candidats sont collectés
          iceFini = true;
          if (offreSDP) resolve(pc.localDescription);
        }
      };

      pc.onicegatheringstatechange = function() {
        if (pc.iceGatheringState === 'complete' && offreSDP) {
          resolve(pc.localDescription);
        }
      };

      try {
        const desc = await pc.createOffer();
        await pc.setLocalDescription(desc);
        offreSDP = desc;

        // Timeout de sécurité (5s max pour la collecte ICE)
        setTimeout(function() {
          if (pc.localDescription) resolve(pc.localDescription);
          else reject(new Error('Timeout collecte ICE'));
        }, 5000);

      } catch(e) {
        reject(e);
      }
    });

    // Encoder l'offre SDP pour le QR code
    const offreEncodee = encoderSDP(offre);
    console.log('[WebRTC] Offre générée, prête pour QR code');
    return offreEncodee;
  }

  // ----------------------------------------------------------
  // CÔTÉ B : RECEVOIR L'OFFRE ET GÉNÉRER LA RÉPONSE
  // ----------------------------------------------------------
  async function recevoirOffreEtRepondre(offreEncodee) {
    const pc = creerPeerConnection();

    // Recevoir le DataChannel côté répondant
    pc.ondatachannel = function(event) {
      configurerDataChannel(event.channel);
    };

    // Collecter la réponse SDP avec ICE
    const reponse = await new Promise(async function(resolve, reject) {
      let reponseSDP = null;

      pc.onicecandidate = function(event) {
        if (event.candidate === null && reponseSDP) {
          resolve(pc.localDescription);
        }
      };

      pc.onicegatheringstatechange = function() {
        if (pc.iceGatheringState === 'complete' && reponseSDP) {
          resolve(pc.localDescription);
        }
      };

      try {
        const offreDesc = decoderSDP(offreEncodee, 'offer');
        await pc.setRemoteDescription(offreDesc);

        const desc = await pc.createAnswer();
        await pc.setLocalDescription(desc);
        reponseSDP = desc;

        // Timeout de sécurité
        setTimeout(function() {
          if (pc.localDescription) resolve(pc.localDescription);
          else reject(new Error('Timeout collecte ICE réponse'));
        }, 5000);

      } catch(e) {
        reject(e);
      }
    });

    const reponseEncodee = encoderSDP(reponse);
    console.log('[WebRTC] Réponse générée, prête pour QR code');
    return reponseEncodee;
  }

  // ----------------------------------------------------------
  // CÔTÉ A : RECEVOIR LA RÉPONSE → CONNEXION ÉTABLIE
  // ----------------------------------------------------------
  async function recevoirReponse(reponseEncodee) {
    if (!peerConnection) throw new Error('Pas de PeerConnection active');

    try {
      const reponseDesc = decoderSDP(reponseEncodee, 'answer');
      await peerConnection.setRemoteDescription(reponseDesc);
      console.log('[WebRTC] Réponse reçue, connexion en cours...');
    } catch(e) {
      throw new Error('Erreur réception réponse: ' + e.message);
    }
  }

  // ----------------------------------------------------------
  // ENCODER / DECODER SDP pour QR code
  // SDP peut être long → on compresse avec un format compact
  // ----------------------------------------------------------
  function encoderSDP(sdpDesc) {
    const obj = {
      t: sdpDesc.type,       // 'offer' ou 'answer'
      s: sdpDesc.sdp          // le SDP brut
    };
    // Base64 pour passer dans un QR code
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  }

  function decoderSDP(encoded, typeAttendu) {
    try {
      const obj = JSON.parse(decodeURIComponent(escape(atob(encoded))));
      return new RTCSessionDescription({ type: obj.t, sdp: obj.s });
    } catch(e) {
      throw new Error('QR code invalide ou corrompu');
    }
  }

  // ----------------------------------------------------------
  // MÉMORISER UN APPAREIL APPAIRÉ (localStorage)
  // ----------------------------------------------------------
  const STORAGE_KEY = 'sumattra_appareils_appaires';

  function getAppareilsAppaires() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch(e) {
      return [];
    }
  }

  function sauvegarderAppareil(appareil) {
    // appareil = { id, nom, dateDernierSync }
    const liste = getAppareilsAppaires();
    const existant = liste.findIndex(function(a) { return a.id === appareil.id; });

    if (existant >= 0) {
      liste[existant] = appareil;
    } else {
      liste.push(appareil);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(liste));
  }

  function supprimerAppareil(id) {
    const liste = getAppareilsAppaires().filter(function(a) { return a.id !== id; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(liste));
  }

  // ----------------------------------------------------------
  // FERMER LA CONNEXION PROPREMENT
  // ----------------------------------------------------------
  function fermer() {
    if (dataChannel) {
      try { dataChannel.close(); } catch(e) {}
      dataChannel = null;
    }
    if (peerConnection) {
      try { peerConnection.close(); } catch(e) {}
      peerConnection = null;
    }
    receiveBuffer = [];
    receivedSize  = 0;
    expectedSize  = 0;
    console.log('[WebRTC] Connexion fermée');
  }

  // ----------------------------------------------------------
  // DÉFINIR LES CALLBACKS
  // ----------------------------------------------------------
  function onConnected(cb)  { onConnectedCb  = cb; }
  function onData(cb)       { onDataCb       = cb; }
  function onError(cb)      { onErrorCb      = cb; }
  function onProgress(cb)   { onProgressCb   = cb; }

  // ----------------------------------------------------------
  // API PUBLIQUE
  // ----------------------------------------------------------
  return {
    // Signaling
    genererOffre,
    recevoirOffreEtRepondre,
    recevoirReponse,
    // Données
    envoyerDonnees,
    // Appareils mémorisés
    getAppareilsAppaires,
    sauvegarderAppareil,
    supprimerAppareil,
    // Callbacks
    onConnected,
    onData,
    onError,
    onProgress,
    // Utilitaire
    fermer,
    // Accès état
    get estConnecte() {
      return dataChannel !== null && dataChannel.readyState === 'open';
    }
  };

})();
