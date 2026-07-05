/**
 * import.js - Module d'import Excel
 * Permet de charger des fichiers Excel et de les fusionner avec les données existantes
 */

(function() {
  'use strict';

  window.ImportModule = {
    /**
     * Importe des fichiers Excel
     * @param {FileList} files - Fichiers à importer
     */
    importFiles: function(files) {
      if (!files || files.length === 0) return;
      
      Utils.showToast('Traitement de ' + files.length + ' fichier(s)...', 'success');
      
      var promises = [];
      
      for (var i = 0; i < files.length; i++) {
        promises.push(ImportModule.processFile(files[i]));
      }
      
      Promise.all(promises).then(function(results) {
        var totalEntries = 0;
        var totalWorkers = 0;
        
        results.forEach(function(r) {
          if (r) {
            totalEntries += r.entriesCount;
            if (r.workerAdded) totalWorkers++;
          }
        });
        
        var msg = 'Import terminé: ' + totalEntries + ' nouvelle(s) entrée(s)';
        if (totalWorkers > 0) msg += ', ' + totalWorkers + ' nouveau(x) travailleur(s)';
        Utils.showToast(msg, 'success');
        
        // Rafraîchir les onglets
        if (typeof QuotidienModule !== 'undefined') QuotidienModule.refresh();
        if (typeof TravailleursModule !== 'undefined') TravailleursModule.refresh();
        
      }).catch(function(err) {
        console.error('Erreur import:', err);
        Utils.showToast('Erreur lors de l\'import', 'error');
      });
    },

    /**
     * Traite un fichier Excel
     * @param {File} file - Fichier à traiter
     * @returns {Promise}
     */
    processFile: function(file) {
      return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        
        reader.onload = function(e) {
          var data = new Uint8Array(e.target.result);
          
          var workbook = new ExcelJS.Workbook();
          workbook.xlsx.load(data).then(function() {

            // === Étape 1: Lire les infos du travailleur ===
            var sheetInfos = workbook.getWorksheet('INFORMATIONS TRAVAILLEUR');
            var workerInfo = null;

            if (sheetInfos) {
              var nom = '', prenom = '', dateDistinctive = '', type = 'travailleur';

              sheetInfos.eachRow(function(row, rowNum) {
                if (rowNum === 1) return; // Ignorer le titre
                var key = row.getCell(1).value;
                var value = row.getCell(2).value;

                if (key === 'Nom:') nom = value || '';
                if (key === 'Prénom:') prenom = value || '';
                if (key === 'Date distinctive:') dateDistinctive = ImportModule.normalizeDate(value);
                if (key === 'Type:') type = (value && value.toLowerCase().includes('stagiaire')) ? 'stagiaire' : 'travailleur';
              });

              workerInfo = { nom: nom, prenom: prenom, date_distinctive: dateDistinctive, type: type };
            }

            // === Étape 2: Lire le journal ===
            var sheetJournal = workbook.getWorksheet('JOURNAL');
            var entries = [];

            if (sheetJournal) {
              sheetJournal.eachRow(function(row, rowNum) {
                if (rowNum === 1) return; // Ignorer l'en-tête
                var cells = row.values;

                if (cells[1]) { // Date
                  entries.push({
                    uuid_travailleur: '', // Sera rempli après
                    date: ImportModule.normalizeDate(cells[1]),
                    atelier: cells[2] || '',
                    machine_nom: cells[3] || '',
                    duree_minutes: typeof cells[4] === 'number' ? cells[4] : Utils.parseDuree(cells[4]),
                    saisi_par: cells[5] || ''
                  });
                }
              });
            }

            // === Étape 3: Chercher ou créer le travailleur ===
            ImportModule.findOrCreateTravailleur(workerInfo).then(function(uuid) {
              // Mettre à jour les entrées avec l'uuid
              entries.forEach(function(e) {
                e.uuid_travailleur = uuid;
              });

              // === Étape 4: Fusionner les entrées ===
              DB.mergeJournalEntries(entries).then(function(addedCount) {
                resolve({
                  workerInfo: workerInfo,
                  entriesCount: addedCount,
                  workerAdded: false // Le travailleur existait déjà ou a été créé
                });
              });
            });
          }).catch(reject);
        };

        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
    },

    /**
     * Normalise une date (objet Date ou string) au format YYYY-MM-DD
     * @param {Date|string} value - Valeur brute de la cellule Excel
     * @returns {string}
     */
    normalizeDate: function(value) {
      if (!value) return '';
      if (value instanceof Date) {
        var y = value.getFullYear();
        var m = String(value.getMonth() + 1).padStart(2, '0');
        var d = String(value.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
      }
      return String(value).trim();
    },

    /**
     * Cherche un travailleur existant ou en crée un nouveau
     * @param {Object} workerInfo - Informations du travailleur
     * @returns {Promise} UUID du travailleur
     */
    findOrCreateTravailleur: function(workerInfo) {
      if (!workerInfo || !workerInfo.nom || !workerInfo.prenom) {
        // Pas d'info, générer un UUID aléatoire
        return Promise.resolve(Utils.generateUUID());
      }
      
      // Chercher dans la DB (actifs et inactifs)
      return DB.getAllTravailleursIncludingInactive().then(function(travailleurs) {
        // Chercher par nom + prénom + date distinctive
        var found = travailleurs.find(function(t) {
          var sameNom = t.nom.toLowerCase() === workerInfo.nom.toLowerCase();
          var samePrenom = t.prenom.toLowerCase() === workerInfo.prenom.toLowerCase();
          var sameDate = (t.date_distinctive || '') === (workerInfo.date_distinctive || '');
          return sameNom && samePrenom && sameDate;
        });
        
        if (found) {
          // Le travailleur existe, vérifier s'il est actif
          if (!found.actif) {
            // Le réactiver
            return DB.updateTravailleur(found.uuid, { actif: true, date_suppression: null }).then(function() {
              return found.uuid;
            });
          }
          return Promise.resolve(found.uuid);
        }
        
        // Créer un nouveau travailleur
        return DB.addTravailleur({
          nom: workerInfo.nom,
          prenom: workerInfo.prenom,
          date_distinctive: workerInfo.date_distinctive || '',
          type: workerInfo.type || 'travailleur'
        }).then(function(newWorker) {
          return newWorker.uuid;
        });
      });
    },

    /**
     * Demande confirmation pour un travailleur existant
     * @param {Object} workerInfo - Informations du travailleur lu du fichier
     * @param {Object} existingWorker - Travailleur existant en DB
     * @param {function} onConfirm - Callback si confirmé
     */
    confirmExistingWorker: function(workerInfo, existingWorker, onConfirm) {
      var message = '<p>Un travailleur avec le même nom a été trouvé dans la base de données:</p>' +
        '<div style="margin:12px 0;padding:12px;background:var(--bg-primary);border-radius:8px;">' +
          '<strong>' + Capitalize(existingWorker.prenom) + ' ' + Capitalize(existingWorker.nom) + '</strong><br>' +
          '<span style="font-size:13px;color:var(--text-secondary);">Ajouté le: ' + Utils.formatDateShort(existingWorker.date_creation) + '</span>';
      
      if (existingWorker.date_distinctive) {
        message += '<br><span style="font-size:13px;color:var(--text-secondary);">Date distinctive: ' + existingWorker.date_distinctive + '</span>';
      }
      
      message += '</div>' +
        '<p>Est-ce la même personne ?</p>';
      
      Utils.openModal(message, onConfirm, null, 'Oui, c\'est le même', 'Non, créer un nouveau');
    }
  };

  /**
   * Met en majuscule la première lettre
   */
  function Capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

})();
