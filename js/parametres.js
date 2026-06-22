/**
 * parametres.js - Module onglet Paramètres
 */

(function() {
  'use strict';

  window.ParametresModule = {

    init: function() {
      ParametresModule.loadConfig();

      var btnSave = document.getElementById('btn-save-config');
      if (btnSave) btnSave.addEventListener('click', ParametresModule.saveConfig);

      var btnExportAll = document.getElementById('btn-export-all');
      if (btnExportAll) btnExportAll.addEventListener('click', function() {
        if (typeof ExcelModule !== 'undefined') ExcelModule.exportAll();
      });

      var btnExportOne = document.getElementById('btn-export-one');
      if (btnExportOne) btnExportOne.addEventListener('click', function() {
        if (typeof ExcelModule !== 'undefined') ExcelModule.exportOne();
      });

      var btnImport = document.getElementById('btn-import-files');
      var inputImport = document.getElementById('input-import-files');
      if (btnImport && inputImport) {
        btnImport.addEventListener('click', function() { inputImport.click(); });
        inputImport.addEventListener('change', function(e) {
          if (e.target.files.length > 0) {
            if (typeof ImportModule !== 'undefined') ImportModule.importFiles(e.target.files);
            inputImport.value = '';
          }
        });
      }

      // Export atelier
      var btnExportAtelier = document.getElementById('btn-export-atelier');
      if (btnExportAtelier) btnExportAtelier.addEventListener('click', ParametresModule.exportAtelier);

      // Import atelier
      var btnImportAtelier = document.getElementById('btn-import-atelier');
      var inputImportAtelier = document.getElementById('input-import-atelier');
      if (btnImportAtelier && inputImportAtelier) {
        btnImportAtelier.addEventListener('click', function() { inputImportAtelier.click(); });
        inputImportAtelier.addEventListener('change', function(e) {
          if (e.target.files.length > 0) {
            ParametresModule.handleImportAtelier(e.target.files[0]);
            inputImportAtelier.value = '';
          }
        });
      }

      var btnTheme = document.getElementById('btn-theme');
      if (btnTheme) btnTheme.addEventListener('click', function() { App.toggleTheme(); });

      ParametresModule.refresh();
    },

    loadConfig: function() {
      var inputAtelier  = document.getElementById('input-atelier-nom');
      var inputMoniteur = document.getElementById('input-moniteur-nom');
      Promise.all([
        DB.getConfig('atelier_nom'),
        DB.getConfig('moniteur_nom')
      ]).then(function(results) {
        if (inputAtelier)  inputAtelier.value  = results[0] || '';
        if (inputMoniteur) inputMoniteur.value = results[1] || '';
      });
    },

    saveConfig: function() {
      var inputAtelier  = document.getElementById('input-atelier-nom');
      var inputMoniteur = document.getElementById('input-moniteur-nom');
      var atelier  = inputAtelier  ? inputAtelier.value.trim()  : '';
      var moniteur = inputMoniteur ? inputMoniteur.value.trim() : '';

      Promise.all([
        DB.setConfig('atelier_nom',  atelier),
        DB.setConfig('moniteur_nom', moniteur)
      ]).then(function() {
        if (atelier) {
          App.setCurrentAtelier(atelier);
          var selectAtelier = document.getElementById('select-atelier');
          if (selectAtelier) {
            var optionExists = false;
            for (var i = 0; i < selectAtelier.options.length; i++) {
              if (selectAtelier.options[i].value === atelier) { optionExists = true; break; }
            }
            if (!optionExists) {
              var opt = document.createElement('option');
              opt.value = atelier;
              opt.textContent = atelier;
              selectAtelier.appendChild(opt);
            }
            selectAtelier.value = atelier;
          }
        }
        Utils.showToast('Configuration sauvegardée', 'success');
      }).catch(function() {
        Utils.showToast('Erreur lors de la sauvegarde', 'error');
      });
    },

    // =========================================================
    //  EXPORT ATELIER
    // =========================================================
    exportAtelier: function() {
      Promise.all([
        DB.getAllTravailleurs(),
        DB.getAllMachines(),
        DB.getConfig('atelier_nom')
      ]).then(function(results) {
        var travailleurs = results[0];
        var machines     = results[1];
        var atelierNom   = results[2] || '';

        var payload = {
          version:     1,
          type:        'su-mat-tra-atelier',
          atelier_nom: atelierNom,
          date_export: new Date().toISOString(),
          travailleurs: travailleurs.map(function(t) {
            return {
              uuid:             t.uuid,
              nom:              t.nom,
              prenom:           t.prenom,
              date_distinctive: t.date_distinctive || '',
              type:             t.type || 'travailleur',
              date_creation:    t.date_creation || ''
            };
          }),
          machines: machines.map(function(m) {
            return {
              nom:         m.nom,
              description: m.description || ''
            };
          })
        };

        var json     = JSON.stringify(payload, null, 2);
        var blob     = new Blob([json], { type: 'application/json' });
        var url      = window.URL.createObjectURL(blob);
        var a        = document.createElement('a');
        var dateStr  = new Date().toISOString().substring(0, 10);
        a.href       = url;
        a.download   = 'su-mat-tra_atelier_' + dateStr + '.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);

        Utils.showToast(
          travailleurs.length + ' travailleur(s) et ' + machines.length + ' matériel(s) exportés',
          'success'
        );
      }).catch(function() {
        Utils.showToast('Erreur lors de l\'export atelier', 'error');
      });
    },

    // =========================================================
    //  IMPORT ATELIER — lecture du fichier puis choix fusion/écrasement
    // =========================================================
    handleImportAtelier: function(file) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var payload;
        try {
          payload = JSON.parse(e.target.result);
        } catch (err) {
          Utils.showToast('Fichier invalide', 'error');
          return;
        }

        if (!payload || payload.type !== 'su-mat-tra-atelier') {
          Utils.showToast('Ce fichier n\'est pas un export atelier Su-Mat-Tra', 'error');
          return;
        }

        var nbT = (payload.travailleurs || []).length;
        var nbM = (payload.machines     || []).length;

        Utils.openModal(
          '<div style="text-align:center;">' +
            '<p style="font-size:16px;font-weight:600;margin-bottom:12px;">Import atelier détecté</p>' +
            '<p style="margin-bottom:6px;">📁 <strong>' + (payload.atelier_nom || 'Sans nom') + '</strong></p>' +
            '<p style="color:var(--text-secondary);font-size:13px;margin-bottom:18px;">' +
              'Exporté le ' + new Date(payload.date_export).toLocaleDateString('fr-FR') +
            '</p>' +
            '<p style="margin-bottom:6px;">👥 ' + nbT + ' travailleur(s) &nbsp;|&nbsp; 🔧 ' + nbM + ' matériel(s)</p>' +
          '</div>' +
          '<div class="import-atelier-choice">' +
            '<div class="import-choice-card" id="choice-fusion">' +
              '<div class="choice-icon">🔀</div>' +
              '<div class="choice-title">Fusionner</div>' +
              '<div class="choice-desc">Ajoute uniquement les travailleurs et matériels absents de votre liste. Vos suppressions restent intactes.</div>' +
            '</div>' +
            '<div class="import-choice-card" id="choice-ecraser">' +
              '<div class="choice-icon">♻️</div>' +
              '<div class="choice-title">Écraser</div>' +
              '<div class="choice-desc">Remplace entièrement votre liste par celle du fichier. Vos suppressions seront perdues.</div>' +
            '</div>' +
          '</div>',
          null, null, null, null,
          true
        );

        setTimeout(function() {
          var cardFusion  = document.getElementById('choice-fusion');
          var cardEcraser = document.getElementById('choice-ecraser');

          if (cardFusion) {
            cardFusion.addEventListener('click', function() {
              Utils.closeModal();
              ParametresModule.importFusion(payload);
            });
          }
          if (cardEcraser) {
            cardEcraser.addEventListener('click', function() {
              Utils.closeModal();
              ParametresModule.importEcraser(payload);
            });
          }
        }, 50);
      };
      reader.readAsText(file);
    },

    // =========================================================
    //  FUSION : ajoute uniquement ce qui manque
    // =========================================================
    importFusion: function(payload) {
      Promise.all([
        DB.getAllTravailleursIncludingInactive(),  // ← inclut les inactifs
        DB.getAllMachines()
      ]).then(function(results) {
        var existingT = results[0];
        var existingM = results[1];

        var uuidsExistants = {};
        existingT.forEach(function(t) { uuidsExistants[t.uuid] = true; });

        var nomsExistants = {};
        existingM.forEach(function(m) { nomsExistants[m.nom.toLowerCase()] = true; });

        var nouveauxT = (payload.travailleurs || []).filter(function(t) {
          return !uuidsExistants[t.uuid];
        });
        var nouvellesM = (payload.machines || []).filter(function(m) {
          return !nomsExistants[m.nom.toLowerCase()];
        });

        var promessesT = nouveauxT.map(function(t) {
          return DB.addTravailleur(t).catch(function(err) {
            console.warn('Fusion travailleur ignoré:', t.nom, err);
          });
        });
        var promessesM = nouvellesM.map(function(m) {
          return DB.addMachine(m).catch(function(err) {
            console.warn('Fusion machine ignorée:', m.nom, err);
          });
        });

        return Promise.all(promessesT.concat(promessesM)).then(function() {
          Utils.showToast(
            nouveauxT.length + ' travailleur(s) et ' + nouvellesM.length + ' matériel(s) ajouté(s)',
            'success'
          );
          if (typeof TravailleursModule !== 'undefined') TravailleursModule.refresh();
          if (typeof MachinesModule !== 'undefined') MachinesModule.refresh();
        });
      }).catch(function(err) {
        console.error('Erreur fusion:', err);
        Utils.showToast('Erreur lors de la fusion', 'error');
      });
    },

    // =========================================================
    //  ÉCRASEMENT : confirmation puis remplacement total
    // =========================================================
    importEcraser: function(payload) {
      Utils.openModal(
        '<p style="text-align:center;font-size:15px;">⚠️ Êtes-vous sûr(e) ?</p>' +
        '<p style="text-align:center;color:var(--text-secondary);font-size:13px;margin-top:10px;">' +
          'Cette action supprimera <strong>tous vos travailleurs et matériels actuels</strong> ' +
          'et les remplacera par ceux du fichier importé.' +
        '</p>',
        function() {
          Utils.closeModal();
          ParametresModule.doEcraser(payload);
        },
        function() { Utils.closeModal(); },
        'Confirmer l\'écrasement',
        'Annuler'
      );
    },

    doEcraser: function(payload) {
      Promise.all([
        DB.clearAllTravailleurs(),
        DB.clearAllMachines()
      ]).then(function() {
        var promessesT = (payload.travailleurs || []).map(function(t) {
          return DB.addTravailleur(t).catch(function() {});
        });
        var promessesM = (payload.machines || []).map(function(m) {
          return DB.addMachine(m).catch(function() {});
        });

        return Promise.all(promessesT.concat(promessesM));
      }).then(function() {
        var nbT = (payload.travailleurs || []).length;
        var nbM = (payload.machines     || []).length;
        Utils.showToast(
          nbT + ' travailleur(s) et ' + nbM + ' matériel(s) importés',
          'success'
        );
        if (typeof TravailleursModule !== 'undefined') TravailleursModule.refresh();
        if (typeof MachinesModule !== 'undefined') MachinesModule.refresh();
      }).catch(function() {
        Utils.showToast('Erreur lors de l\'écrasement', 'error');
      });
    },

    refresh: function() {
      ParametresModule.loadConfig();
    }
  };

})();
