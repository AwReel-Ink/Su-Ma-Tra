/**
 * db.js - Gestion IndexedDB pour Su-Mat-Tra
 * Base de données: SuMatTra_DB version 1
 */

window.SYSTEM_MACHINES = [
  { id: 'absent', nom: 'Absent',  system: true, actif: true, description: 'Absence non justifiée' },
  { id: 'conge',  nom: 'Congé',   system: true, actif: true, description: 'Absence justifiée' }
];

(function() {
  'use strict';

  var DB_NAME = 'SuMatTra_DB';
  var DB_VERSION = 1;
  var db = null;

  function initDB() {
    return new Promise(function(resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = function(event) {
        console.error('Erreur ouverture DB:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = function(event) {
        db = event.target.result;
        console.log('IndexedDB ouverte avec succès');
        resolve(db);
      };

      request.onupgradeneeded = function(event) {
        var database = event.target.result;
        console.log('Mise à niveau DB vers version ' + DB_VERSION);

        if (!database.objectStoreNames.contains('config')) {
          database.createObjectStore('config', { keyPath: 'key' });
        }

        if (!database.objectStoreNames.contains('travailleurs')) {
          var travailleurStore = database.createObjectStore('travailleurs', { keyPath: 'uuid' });
          travailleurStore.createIndex('nom', 'nom', { unique: false });
          travailleurStore.createIndex('actif', 'actif', { unique: false });
        }

        if (!database.objectStoreNames.contains('machines')) {
          var machineStore = database.createObjectStore('machines', { keyPath: 'id', autoIncrement: true });
          machineStore.createIndex('nom', 'nom', { unique: false });
          machineStore.createIndex('actif', 'actif', { unique: false });
        }

        if (!database.objectStoreNames.contains('journal')) {
          var journalStore = database.createObjectStore('journal', { keyPath: 'id', autoIncrement: true });
          journalStore.createIndex('date', 'date', { unique: false });
          journalStore.createIndex('uuid_travailleur', 'uuid_travailleur', { unique: false });
          journalStore.createIndex('machine_nom', 'machine_nom', { unique: false });
        }
      };
    });
  }

  function getConfig(key) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['config'], 'readonly');
      var store = transaction.objectStore('config');
      var request = store.get(key);
      request.onsuccess = function() {
        resolve(request.result ? request.result.value : null);
      };
      request.onerror = function() { reject(request.error); };
    });
  }

  function setConfig(key, value) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['config'], 'readwrite');
      var store = transaction.objectStore('config');
      var request = store.put({ key: key, value: value });
      request.onsuccess = function() { resolve(); };
      request.onerror = function() { reject(request.error); };
    });
  }

  function getAllTravailleurs() {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['travailleurs'], 'readonly');
      var store = transaction.objectStore('travailleurs');
      var request = store.getAll();
      request.onsuccess = function() {
        var actifs = request.result.filter(function(t) { return t.actif !== false; });
        actifs.sort(function(a, b) {
          return (a.nom + ' ' + a.prenom).toLowerCase()
            .localeCompare((b.nom + ' ' + b.prenom).toLowerCase());
        });
        resolve(actifs);
      };
      request.onerror = function() { reject(request.error); };
    });
  }

  function getTravailleur(uuid) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['travailleurs'], 'readonly');
      var store = transaction.objectStore('travailleurs');
      var request = store.get(uuid);
      request.onsuccess = function() { resolve(request.result || null); };
      request.onerror = function() { reject(request.error); };
    });
  }

  function addTravailleur(data) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var now = new Date().toISOString().split('T')[0];
      var travailleur = {
        uuid:             data.uuid || Utils.generateUUID(),
        nom:              data.nom,
        prenom:           data.prenom,
        date_distinctive: data.date_distinctive || '',
        type:             data.type || 'travailleur',
        atelier:          data.atelier || '',
        actif:            true,
        date_creation:    data.date_creation || now,
        date_suppression: null
      };
      var transaction = db.transaction(['travailleurs'], 'readwrite');
      var store = transaction.objectStore('travailleurs');
      var request = store.add(travailleur);
      request.onsuccess = function() { resolve(travailleur); };
      request.onerror = function() { reject(request.error); };
    });
  }

  function updateTravailleur(uuid, data) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['travailleurs'], 'readwrite');
      var store = transaction.objectStore('travailleurs');
      var getRequest = store.get(uuid);
      getRequest.onsuccess = function() {
        var existing = getRequest.result;
        if (!existing) { reject(new Error('Travailleur non trouvé')); return; }
        var updated = Object.assign({}, existing, data);
        var putRequest = store.put(updated);
        putRequest.onsuccess = function() { resolve(updated); };
        putRequest.onerror = function() { reject(putRequest.error); };
      };
      getRequest.onerror = function() { reject(getRequest.error); };
    });
  }

  function deleteTravailleur(uuid) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var now = new Date().toISOString().split('T')[0];
      updateTravailleur(uuid, { actif: false, date_suppression: now })
        .then(resolve).catch(reject);
    });
  }

  function getAllTravailleursIncludingInactive() {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['travailleurs'], 'readonly');
      var store = transaction.objectStore('travailleurs');
      var request = store.getAll();
      request.onsuccess = function() { resolve(request.result); };
      request.onerror = function() { reject(request.error); };
    });
  }

    function getAllMachines() {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['machines'], 'readonly');
      var store = transaction.objectStore('machines');
      var request = store.getAll();
      request.onsuccess = function() {
        var actives = request.result.filter(function(m) { return m.actif !== false; });
        actives.sort(function(a, b) { return a.nom.localeCompare(b.nom); });
        // Entrées système toujours en tête
        resolve(window.SYSTEM_MACHINES.concat(actives));
      };
      request.onerror = function() { reject(request.error); };
    });
  }

  function addMachine(data) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var now = new Date().toISOString().split('T')[0];

      var machine = {
        nom:              typeof data === 'string' ? data : (data.nom || ''),
        description:      typeof data === 'object' ? (data.description || '') : '',
        date_creation:    now,
        date_suppression: null,
        actif:            true
      };

      var transaction = db.transaction(['machines'], 'readwrite');
      var store = transaction.objectStore('machines');
      var request = store.add(machine);
      request.onsuccess = function() { resolve(request.result); };
      request.onerror = function() { reject(request.error); };
    });
  }

  function updateMachine(id, nouveauNom) {
    if (id === 'absent' || id === 'conge') {
      return Promise.reject(new Error('Entrée système non modifiable'));
    }
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }

      var transactionMachines = db.transaction(['machines'], 'readwrite');
      var machineStore = transactionMachines.objectStore('machines');

      machineStore.get(id).onsuccess = function(event) {
        var machine = event.target.result;
        if (!machine) { reject(new Error('Machine non trouvée')); return; }
        var ancienNom = machine.nom;
        machine.nom = nouveauNom;

        machineStore.put(machine).onsuccess = function() {
          var transactionJournal = db.transaction(['journal'], 'readwrite');
          var journalStore = transactionJournal.objectStore('journal');
          var index = journalStore.index('machine_nom');

          index.getAll(ancienNom).onsuccess = function(e) {
            var entries = e.target.result;
            if (entries.length === 0) { resolve(machine); return; }
            var updatedCount = 0;
            entries.forEach(function(entry) {
              entry.machine_nom = nouveauNom;
              journalStore.put(entry).onsuccess = function() {
                updatedCount++;
                if (updatedCount === entries.length) { resolve(machine); }
              };
            });
          };
        };
      };

      transactionMachines.onerror = function() { reject(transactionMachines.error); };
    });
  }

  function deleteMachine(id) {
    if (id === 'absent' || id === 'conge') {
      return Promise.reject(new Error('Entrée système non supprimable'));
    }
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var now = new Date().toISOString().split('T')[0];
      var transaction = db.transaction(['machines'], 'readwrite');
      var store = transaction.objectStore('machines');

      store.get(id).onsuccess = function(event) {
        var machine = event.target.result;
        if (!machine) { reject(new Error('Machine non trouvée')); return; }
        machine.actif = false;
        machine.date_suppression = now;
        store.put(machine).onsuccess = function() { resolve(); };
      };
    });
  }

  // =========================================================
  //  CLEAR COMPLET (pour import atelier mode écrasement)
  // =========================================================

  function clearAllTravailleurs() {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['travailleurs'], 'readwrite');
      var store = transaction.objectStore('travailleurs');
      var request = store.clear();
      request.onsuccess = function() { resolve(); };
      request.onerror = function() { reject(request.error); };
    });
  }

  function clearAllMachines() {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['machines'], 'readwrite');
      var store = transaction.objectStore('machines');
      var request = store.clear();
      request.onsuccess = function() { resolve(); };
      request.onerror = function() { reject(request.error); };
    });
  }

  // =========================================================
  //  JOURNAL
  // =========================================================

  function getJournalByDate(date) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['journal'], 'readonly');
      var store = transaction.objectStore('journal');
      var index = store.index('date');
      var request = index.getAll(date);
      request.onsuccess = function() { resolve(request.result); };
      request.onerror = function() { reject(request.error); };
    });
  }

  function getJournalByTravailleur(uuid) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['journal'], 'readonly');
      var store = transaction.objectStore('journal');
      var index = store.index('uuid_travailleur');
      var request = index.getAll(uuid);
      request.onsuccess = function() {
        var results = request.result;
        results.sort(function(a, b) { return b.date.localeCompare(a.date); });
        resolve(results);
      };
      request.onerror = function() { reject(request.error); };
    });
  }

  function getJournalByPeriode(uuid, dateDebut, dateFin) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      getJournalByTravailleur(uuid).then(function(entries) {
        resolve(entries.filter(function(e) {
          return e.date >= dateDebut && e.date <= dateFin;
        }));
      }).catch(reject);
    });
  }

  function addJournalEntry(data) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var entry = {
        uuid_travailleur: data.uuid_travailleur,
        date:             data.date,
        atelier:          data.atelier,
        machine_nom:      data.machine_nom,
        duree_minutes:    data.duree_minutes,
        commentaire:      data.commentaire || '',
        saisi_par:        data.saisi_par   || '',
        date_saisie:      new Date().toISOString().split('T')[0]
      };
      var transaction = db.transaction(['journal'], 'readwrite');
      var store = transaction.objectStore('journal');
      var request = store.add(entry);
      request.onsuccess = function() { resolve(request.result); };
      request.onerror = function() { reject(request.error); };
    });
  }

  function updateJournalEntry(id, data) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['journal'], 'readwrite');
      var store = transaction.objectStore('journal');
      store.get(id).onsuccess = function(event) {
        var entry = event.target.result;
        if (!entry) { reject(new Error('Entrée non trouvée')); return; }
        var updated = Object.assign({}, entry, data);
        store.put(updated).onsuccess = function() { resolve(updated); };
      };
    });
  }

  function deleteJournalEntry(id) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['journal'], 'readwrite');
      var store = transaction.objectStore('journal');
      var request = store.delete(id);
      request.onsuccess = function() { resolve(); };
      request.onerror = function() { reject(request.error); };
    });
  }

  function getLastUsageByMachine(machineNom) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['journal'], 'readonly');
      var store = transaction.objectStore('journal');
      var index = store.index('machine_nom');
      var request = index.getAll(machineNom);
      request.onsuccess = function() {
        var entries = request.result;
        var lastByWorker = {};
        entries.forEach(function(e) {
          if (!lastByWorker[e.uuid_travailleur] ||
              e.date > lastByWorker[e.uuid_travailleur].date) {
            lastByWorker[e.uuid_travailleur] = e;
          }
        });
        var result = Object.values(lastByWorker).sort(function(a, b) {
          return b.date.localeCompare(a.date);
        });
        resolve(result);
      };
      request.onerror = function() { reject(request.error); };
    });
  }

  function mergeJournalEntries(entries) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      if (!entries || entries.length === 0) { resolve(0); return; }

      var transaction = db.transaction(['journal'], 'readwrite');
      var store = transaction.objectStore('journal');
      var request = store.getAll();

      request.onsuccess = function() {
        var existingKeys = {};
        request.result.forEach(function(e) {
          existingKeys[e.uuid_travailleur + '|' + e.date + '|' + e.machine_nom + '|' + e.duree_minutes] = true;
        });

        var entriesToAdd = entries.filter(function(e) {
          return !existingKeys[e.uuid_travailleur + '|' + e.date + '|' + e.machine_nom + '|' + e.duree_minutes];
        });

        if (entriesToAdd.length === 0) { resolve(0); return; }

        var addedCount = 0;
        var i = 0;
        function addNext() {
          if (i >= entriesToAdd.length) { resolve(addedCount); return; }
          var req = store.add(entriesToAdd[i]);
          req.onsuccess = function() { addedCount++; i++; addNext(); };
          req.onerror   = function() { i++; addNext(); };
        }
        addNext();
      };
      request.onerror = function() { reject(request.error); };
    });
  }

  function getAllJournalEntries() {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB non initialisée')); return; }
      var transaction = db.transaction(['journal'], 'readonly');
      var store = transaction.objectStore('journal');
      var request = store.getAll();
      request.onsuccess = function() { resolve(request.result); };
      request.onerror = function() { reject(request.error); };
    });
  }

  // =========================================================
  //  API PUBLIQUE
  // =========================================================
  window.DB = {
    init:                          initDB,
    getConfig:                     getConfig,
    setConfig:                     setConfig,
    getAllTravailleurs:             getAllTravailleurs,
    getTravailleur:                getTravailleur,
    addTravailleur:                addTravailleur,
    updateTravailleur:             updateTravailleur,
    deleteTravailleur:             deleteTravailleur,
    getAllTravailleursIncludingInactive: getAllTravailleursIncludingInactive,
    getAllMachines:                 getAllMachines,
    addMachine:                    addMachine,
    updateMachine:                 updateMachine,
    deleteMachine:                 deleteMachine,
    clearAllTravailleurs:          clearAllTravailleurs,
    clearAllMachines:              clearAllMachines,
    getJournalByDate:              getJournalByDate,
    getJournalByTravailleur:       getJournalByTravailleur,
    getJournalByPeriode:           getJournalByPeriode,
    addJournalEntry:               addJournalEntry,
    updateJournalEntry:            updateJournalEntry,
    deleteJournalEntry:            deleteJournalEntry,
    getLastUsageByMachine:         getLastUsageByMachine,
    mergeJournalEntries:           mergeJournalEntries,
    getAllJournalEntries:           getAllJournalEntries
  };

})();
