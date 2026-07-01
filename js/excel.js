/**
 * excel.js - Module d'export Excel
 * Utilise la librairie ExcelJS (doit être chargée avant)
 */

(function() {
  'use strict';

  window.ExcelModule = {

    exportAll: function() {
      DB.getAllTravailleurs().then(function(travailleurs) {
        if (travailleurs.length === 0) {
          Utils.showToast('Aucun travailleur à exporter', 'warning');
          return;
        }

        // Étape 1 : demander les fichiers existants (optionnel)
        Utils.openModal(
          '<div style="text-align:center;">' +
            '<div style="font-size:40px;margin-bottom:12px;">📂</div>' +
            '<p style="font-size:16px;font-weight:700;margin-bottom:8px;">Export automatique de tous les travailleurs</p>' +
            '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;">' +
              travailleurs.length + ' travailleur(s) seront exportés.<br>' +
              'Si vous avez des fichiers Excel existants, sélectionnez-les tous en une seule fois.<br>' +
              'La correspondance sera faite automatiquement.' +
            '</p>' +
            '<div style="background:var(--bg-secondary);border-radius:10px;padding:14px;font-size:13px;color:var(--text-secondary);text-align:left;margin-bottom:8px;">' +
              '<p style="margin:0 0 6px 0;">✅ Fichier trouvé → fusion automatique</p>' +
              '<p style="margin:0 0 6px 0;">📄 Aucun fichier → export direct</p>' +
              '<p style="margin:0;">⚠️ Conflit d\'identité → pause + confirmation</p>' +
            '</div>' +
          '</div>',
          function() {
            // Oui : sélectionner des fichiers existants
            Utils.closeModal();
            var inputFile = document.createElement('input');
            inputFile.type = 'file';
            inputFile.accept = '.xlsx';
            inputFile.multiple = true;
            inputFile.addEventListener('change', function(e) {
              if (e.target.files.length > 0) {
                ExcelModule.exportAllWithFiles(travailleurs, Array.from(e.target.files));
              } else {
                ExcelModule.exportAllWithFiles(travailleurs, []);
              }
            });
            // Si l'utilisateur annule le sélecteur de fichier
            inputFile.addEventListener('cancel', function() {
              ExcelModule.exportAllWithFiles(travailleurs, []);
            });
            inputFile.click();
          },
          function() {
            // Non : export simple pour tous
            Utils.closeModal();
            ExcelModule.exportAllWithFiles(travailleurs, []);
          },
          'Sélectionner mes fichiers existants',
          'Exporter sans fichiers existants'
        );
      });
    },

    exportAllWithFiles: function(travailleurs, files) {
      Utils.showToast('Analyse des fichiers...', 'success');

      // Lire l'UUID de chaque fichier fourni → map uuid → file
      var fileReadPromises = files.map(function(file) {
        return new Promise(function(resolve) {
          var reader = new FileReader();
          reader.onload = function(e) {
            var data = new Uint8Array(e.target.result);
            ExcelModule.readIdentityFromFile(data).then(function(identity) {
              resolve({ file: file, data: data, identity: identity });
            });
          };
          reader.readAsArrayBuffer(file);
        });
      });

      Promise.all(fileReadPromises).then(function(fileInfos) {
        // Construire un index uuid → fileInfo et nom+prenom → fileInfo (fallback)
        var byUuid = {};
        var byName = {};
        fileInfos.forEach(function(fi) {
          if (fi.identity.uuid) {
            byUuid[fi.identity.uuid.trim().toLowerCase()] = fi;
          }
          if (fi.identity.nom && fi.identity.prenom) {
            var key = fi.identity.nom.trim().toLowerCase() + '_' + fi.identity.prenom.trim().toLowerCase();
            byName[key] = fi;
          }
        });

        // Préparer la file de traitement avec résolution fichier
        var queue = travailleurs.map(function(worker) {
          var fi = byUuid[worker.uuid.trim().toLowerCase()];
          if (!fi) {
            var key = worker.nom.trim().toLowerCase() + '_' + worker.prenom.trim().toLowerCase();
            fi = byName[key] || null;
          }
          return { worker: worker, fileInfo: fi };
        });

        // Stats finales
        var stats = { fusionne: 0, simple: 0, conflit: 0, erreur: 0 };

        // Traitement séquentiel avec gestion des conflits
        ExcelModule.processQueue(queue, 0, stats, byUuid, byName);
      });
    },

    processQueue: function(queue, index, stats, byUuid, byName) {
      if (index >= queue.length) {
        // Rapport final
        var msg = '✅ Export terminé — ' +
          stats.fusionne + ' fusionné(s), ' +
          stats.simple + ' nouveau(x)' +
          (stats.conflit > 0 ? ', ' + stats.conflit + ' conflit(s) ignoré(s)' : '') +
          (stats.erreur > 0 ? ', ' + stats.erreur + ' erreur(s)' : '');
        Utils.showToast(msg, 'success');
        return;
      }

      var item   = queue[index];
      var worker = item.worker;
      var fi     = item.fileInfo;

      // Indicateur de progression
      Utils.showToast(
        '(' + (index + 1) + '/' + queue.length + ') ' +
        Capitalize(worker.prenom) + ' ' + Capitalize(worker.nom) + '...',
        'success'
      );

      function next() {
        setTimeout(function() {
          ExcelModule.processQueue(queue, index + 1, stats, byUuid, byName);
        }, 400);
      }

      if (!fi) {
        // Pas de fichier → export simple
        ExcelModule.exportOneSimpleSilent(worker).then(function() {
          stats.simple++;
          next();
        }).catch(function() {
          stats.erreur++;
          next();
        });
        return;
      }

      // Fichier trouvé → vérifier l'identité
      var diffs = ExcelModule.compareIdentity(worker, fi.identity);

      if (diffs.length > 0) {
        // Conflit : pause et attente de décision utilisateur
        ExcelModule.showIdentityConflictModalBatch(
          worker, fi.identity, diffs, fi.file.name,
          function() {
            // Forcer la fusion quand même
            ExcelModule.doFusionSilent(worker, fi.data, fi.file.name).then(function() {
              stats.fusionne++;
              next();
            }).catch(function() {
              stats.erreur++;
              next();
            });
          },
          function() {
            // Ignorer ce travailleur
            stats.conflit++;
            next();
          },
          function() {
            // Export simple sans fusion
            ExcelModule.exportOneSimpleSilent(worker).then(function() {
              stats.simple++;
              next();
            }).catch(function() {
              stats.erreur++;
              next();
            });
          }
        );
        return;
      }

      // Même personne → fusion silencieuse
      ExcelModule.doFusionSilent(worker, fi.data, fi.file.name).then(function() {
        stats.fusionne++;
        next();
      }).catch(function() {
        stats.erreur++;
        next();
      });
    },

    /**
     * Export simple sans toast intermédiaire (version batch)
     */
    exportOneSimpleSilent: function(worker) {
      return new Promise(function(resolve, reject) {
        var workbook = new ExcelJS.Workbook();
        workbook.creator = 'Su-Mat-Tra';
        workbook.created = new Date();

        ExcelModule.createTravailleurSheet(workbook, worker).then(function() {
          var fileName = worker.nom.toLowerCase() + '_' + worker.prenom.toLowerCase() +
            '_' + (worker.date_distinctive || '').replace(/\//g, '-') +
            '_' + Utils.todayISO() + '.xlsx';
          workbook.xlsx.writeBuffer().then(function(buffer) {
            ExcelModule.downloadFile(buffer, fileName);
            resolve();
          }).catch(reject);
        }).catch(reject);
      });
    },

    /**
     * Fusion silencieuse (version batch)
     */
    doFusionSilent: function(worker, data, originalFileName) {
      return new Promise(function(resolve, reject) {
        var workbookExisting = new ExcelJS.Workbook();
        workbookExisting.xlsx.load(data).then(function() {
          var existingEntries = [];

          var sheetName = 'JOURNAL_' + Capitalize(worker.nom);
          var sheet = workbookExisting.getWorksheet(sheetName);
          if (!sheet) sheet = workbookExisting.getWorksheet('JOURNAL');

          if (sheet) {
            sheet.eachRow(function(row, rowNum) {
              if (rowNum > 1) {
                var cells = row.values;
                existingEntries.push({
                  uuid_travailleur: worker.uuid,
                  date:             cells[1] || '',
                  atelier:          cells[2] || '',
                  machine_nom:      cells[3] || '',
                  duree_minutes:    typeof cells[4] === 'number' ? cells[4] : Utils.parseDuree(cells[4]),
                  saisi_par:        cells[5] || '',
                  commentaire:      cells[6] || ''
                });
              }
            });
          }

          DB.getJournalByTravailleur(worker.uuid).then(function(localEntries) {
            var seen = {};
            localEntries.forEach(function(e) {
              seen[e.date + '|' + e.machine_nom + '|' + e.duree_minutes] = true;
            });

            var uniqueExisting = existingEntries.filter(function(e) {
              var key = e.date + '|' + e.machine_nom + '|' + e.duree_minutes;
              if (seen[key]) return false;
              seen[key] = true;
              return true;
            });

            var allEntries = localEntries.concat(uniqueExisting);

            var workbook = new ExcelJS.Workbook();
            workbook.creator = 'Su-Mat-Tra';
            workbook.created = new Date();

            ExcelModule.createTravailleurSheet(workbook, worker, allEntries).then(function() {
              workbook.xlsx.writeBuffer().then(function(buffer) {
                ExcelModule.downloadFile(buffer, originalFileName);
                resolve();
              }).catch(reject);
            }).catch(reject);
          }).catch(reject);
        }).catch(reject);
      });
    },

    /**
     * Modale conflit version batch — avec 3 choix
     */
    showIdentityConflictModalBatch: function(worker, fileIdentity, diffs, fileName, onForce, onSkip, onSimple) {
      var rowsHtml = diffs.map(function(d) {
        return '<tr>' +
          '<td style="font-weight:600;padding:5px 8px;color:var(--text-secondary);font-size:12px;">' + d.champ + '</td>' +
          '<td style="padding:5px 8px;color:var(--accent);font-size:12px;">📱 ' + d.appli + '</td>' +
          '<td style="padding:5px 8px;color:#e74c3c;font-size:12px;">📄 ' + d.fichier + '</td>' +
        '</tr>';
      }).join('');

      var html =
        '<div style="text-align:center;margin-bottom:14px;">' +
          '<div style="font-size:30px;margin-bottom:6px;">⚠️</div>' +
          '<p style="font-size:15px;font-weight:700;color:#e74c3c;margin-bottom:4px;">Conflit d\'identité détecté</p>' +
          '<p style="font-size:13px;color:var(--text-secondary);">' +
            'Le fichier <strong>' + fileName + '</strong><br>ne correspond pas à ' +
            '<strong>' + Capitalize(worker.prenom) + ' ' + Capitalize(worker.nom) + '</strong>' +
          '</p>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">' +
          '<thead><tr>' +
            '<th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--border);font-size:12px;"></th>' +
            '<th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--border);font-size:12px;">Application</th>' +
            '<th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--border);font-size:12px;">Fichier</th>' +
          '</tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' +
          '<button id="btn-batch-simple" style="padding:12px;font-size:14px;font-weight:600;background:var(--accent);color:#fff;border:none;border-radius:10px;cursor:pointer;">' +
            '📄 Exporter sans ce fichier (export direct)' +
          '</button>' +
          '<button id="btn-batch-skip" style="padding:10px;font-size:13px;font-weight:500;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);border-radius:10px;cursor:pointer;">' +
            '⏭️ Passer ce travailleur' +
          '</button>' +
          '<button id="btn-batch-force" style="padding:8px;font-size:12px;font-weight:400;background:transparent;color:#e74c3c;border:1px solid #e74c3c;border-radius:8px;cursor:pointer;opacity:0.7;">' +
            'Forcer la fusion quand même' +
          '</button>' +
        '</div>';

      Utils.openModal(html, null, null, null, null, true);

      setTimeout(function() {
        var btnSimple = document.getElementById('btn-batch-simple');
        var btnSkip   = document.getElementById('btn-batch-skip');
        var btnForce  = document.getElementById('btn-batch-force');

        if (btnSimple) btnSimple.addEventListener('click', function() { Utils.closeModal(); onSimple(); });
        if (btnSkip)   btnSkip.addEventListener('click',   function() { Utils.closeModal(); onSkip(); });
        if (btnForce)  btnForce.addEventListener('click',  function() { Utils.closeModal(); onForce(); });
      }, 50);
    },

    exportOne: function() {
      DB.getAllTravailleurs().then(function(travailleurs) {
        if (travailleurs.length === 0) {
          Utils.showToast('Aucun travailleur disponible', 'warning');
          return;
        }

        var optionsHtml = travailleurs.map(function(t) {
          return '<option value="' + t.uuid + '">' + Capitalize(t.prenom) + ' ' + Capitalize(t.nom) + '</option>';
        }).join('');

        Utils.openModal(
          '<div class="field-group"><label>Sélectionner un travailleur</label><select id="export-worker-select">' + optionsHtml + '</select></div>',
          function() {
            var select = document.getElementById('export-worker-select');
            if (!select) return;
            var uuid = select.value;
            var worker = travailleurs.find(function(t) { return t.uuid === uuid; });
            if (!worker) return;

            Utils.closeModal();

            Utils.openModal(
              '<p>Avez-vous un fichier Excel existant pour ce travailleur ?</p>' +
              '<p style="font-size:13px;color:var(--text-secondary);margin-top:8px;">Si oui, les données seront fusionnées intelligemment sans perte.</p>',
              function() {
                Utils.closeModal();
                var inputFile = document.createElement('input');
                inputFile.type = 'file';
                inputFile.accept = '.xlsx';
                inputFile.addEventListener('change', function(e) {
                  if (e.target.files.length > 0) {
                    ExcelModule.exportOneWithFusion(worker, e.target.files[0]);
                  }
                });
                inputFile.click();
              },
              function() {
                Utils.closeModal();
                ExcelModule.exportOneSimple(worker);
              },
              'Oui, charger un fichier',
              'Non, exporter directement'
            );
          },
          null,
          'Exporter',
          'Annuler'
        );
      });
    },

    exportOneSimple: function(worker) {
      Utils.showToast('Génération en cours...', 'success');

      var workbook = new ExcelJS.Workbook();
      workbook.creator = 'Su-Mat-Tra';
      workbook.created = new Date();

      ExcelModule.createTravailleurSheet(workbook, worker).then(function() {
        var fileName = worker.nom.toLowerCase() + '_' + worker.prenom.toLowerCase() + '_' + (worker.date_distinctive || '').replace(/\//g, '-') + '_' + Utils.todayISO() + '.xlsx';
        workbook.xlsx.writeBuffer().then(function(buffer) {
          ExcelModule.downloadFile(buffer, fileName);
          Utils.showToast('Export terminé', 'success');
        });
      });
    },

    /**
     * Lit les infos d'identité depuis la 1ère feuille du fichier Excel existant
     */
    readIdentityFromFile: function(data) {
      return new Promise(function(resolve) {
        var wb = new ExcelJS.Workbook();
        wb.xlsx.load(data).then(function() {
          var identity = { nom: '', prenom: '', date_distinctive: '', uuid: '' };

          // La 1ère feuille contient les infos (feuille INDEX 0)
          var sheet = wb.worksheets[0];
          if (!sheet) { resolve(identity); return; }

          sheet.eachRow(function(row) {
            var label = (row.getCell(1).value || '').toString().toLowerCase().replace(':', '').trim();
            var val   = (row.getCell(2).value || '').toString().trim();

            if (label === 'nom')                identity.nom              = val;
            if (label === 'prénom')             identity.prenom           = val;
            if (label === 'date de naissance')  identity.date_distinctive = val;
            if (label === 'uuid' || label === 'id') identity.uuid         = val;
          });

          resolve(identity);
        }).catch(function() {
          resolve({ nom: '', prenom: '', date_distinctive: '', uuid: '' });
        });
      });
    },

    /**
     * Compare deux identités, retourne les champs différents
     */
    compareIdentity: function(worker, fileIdentity) {
      var diffs = [];

      var nomWorker  = Capitalize(worker.nom);
      var nomFile    = Capitalize(fileIdentity.nom);
      if (nomWorker && nomFile && nomWorker !== nomFile) {
        diffs.push({ champ: 'Nom', appli: nomWorker, fichier: nomFile });
      }

      var prenomWorker = Capitalize(worker.prenom);
      var prenomFile   = Capitalize(fileIdentity.prenom);
      if (prenomWorker && prenomFile && prenomWorker !== prenomFile) {
        diffs.push({ champ: 'Prénom', appli: prenomWorker, fichier: prenomFile });
      }

      var dateWorker = (worker.date_distinctive || '').trim();
      var dateFile   = (fileIdentity.date_distinctive || '').trim();
      if (dateWorker && dateFile && dateWorker !== dateFile) {
        diffs.push({ champ: 'Date de naissance', appli: dateWorker, fichier: dateFile });
      }

      var uuidWorker = (worker.uuid || '').trim();
      var uuidFile   = (fileIdentity.uuid || '').trim();
      if (uuidWorker && uuidFile && uuidWorker !== uuidFile) {
        diffs.push({ champ: 'ID', appli: uuidWorker, fichier: uuidFile });
      }

      return diffs;
    },

    /**
     * Affiche la modale d'avertissement de conflit d'identité
     */
    showIdentityConflictModal: function(worker, fileIdentity, diffs, fileName, onForce) {
      var rowsHtml = diffs.map(function(d) {
        return '<tr>' +
          '<td style="font-weight:600;padding:6px 10px;color:var(--text-secondary);">' + d.champ + '</td>' +
          '<td style="padding:6px 10px;color:var(--accent);">📱 ' + d.appli + '</td>' +
          '<td style="padding:6px 10px;color:#e74c3c;">📄 ' + d.fichier + '</td>' +
        '</tr>';
      }).join('');

      var html =
        '<div style="text-align:center;margin-bottom:16px;">' +
          '<div style="font-size:32px;margin-bottom:8px;">⚠️</div>' +
          '<p style="font-size:16px;font-weight:700;color:#e74c3c;margin-bottom:4px;">Ce ne sont pas les mêmes personnes</p>' +
          '<p style="font-size:13px;color:var(--text-secondary);">Le fichier sélectionné ne correspond pas au travailleur que vous exportez.</p>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;">' +
          '<thead><tr>' +
            '<th style="padding:6px 10px;text-align:left;border-bottom:2px solid var(--border);"></th>' +
            '<th style="padding:6px 10px;text-align:left;border-bottom:2px solid var(--border);">Dans l\'application</th>' +
            '<th style="padding:6px 10px;text-align:left;border-bottom:2px solid var(--border);">Dans le fichier</th>' +
          '</tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
        '<div style="display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;">' +
          '<button id="btn-conflict-cancel" style="' +
            'padding:16px 32px;font-size:16px;font-weight:700;' +
            'background:var(--accent);color:#fff;border:none;border-radius:10px;cursor:pointer;' +
            'flex:2;min-width:160px;' +
          '">✅ Annuler</button>' +
          '<button id="btn-conflict-force" style="' +
            'padding:9px 16px;font-size:12px;font-weight:500;' +
            'background:transparent;color:#e74c3c;border:2px solid #e74c3c;border-radius:8px;cursor:pointer;' +
            'flex:1;min-width:80px;max-width:140px;opacity:0.8;' +
          '">Forcer le remplacement</button>' +
        '</div>';

      // Ouvrir modale sans boutons natifs (on gère nous-mêmes)
      Utils.openModal(html, null, null, null, null, true);

      setTimeout(function() {
        var btnCancel = document.getElementById('btn-conflict-cancel');
        var btnForce  = document.getElementById('btn-conflict-force');

        if (btnCancel) {
          btnCancel.addEventListener('click', function() {
            Utils.closeModal();
          });
        }
        if (btnForce) {
          btnForce.addEventListener('click', function() {
            Utils.closeModal();
            onForce();
          });
        }
      }, 50);
    },

    /**
     * Exporte un travailleur avec fusion de fichier existant
     */
    exportOneWithFusion: function(worker, file) {
      Utils.showToast('Lecture du fichier existant...', 'success');

      var originalFileName = file.name;

      var reader = new FileReader();
      reader.onload = function(e) {
        var data = new Uint8Array(e.target.result);

        // 1. Lire l'identité du fichier existant
        ExcelModule.readIdentityFromFile(data).then(function(fileIdentity) {

          // 2. Comparer avec le travailleur à exporter
          var diffs = ExcelModule.compareIdentity(worker, fileIdentity);

          if (diffs.length > 0) {
            // Conflit détecté → modale d'avertissement
            ExcelModule.showIdentityConflictModal(
              worker, fileIdentity, diffs, originalFileName,
              function() {
                // Forcer : continuer la fusion quand même
                ExcelModule.doFusion(worker, data, originalFileName);
              }
            );
          } else {
            // Même personne → fusion silencieuse
            ExcelModule.doFusion(worker, data, originalFileName);
          }
        });
      };
      reader.readAsArrayBuffer(file);
    },

    /**
     * Effectue la fusion réelle et génère le fichier
     */
    doFusion: function(worker, data, originalFileName) {
      Utils.showToast('Fusion en cours...', 'success');

      var workbookExisting = new ExcelJS.Workbook();
      workbookExisting.xlsx.load(data).then(function() {
        var existingEntries = [];

        var sheetName = 'JOURNAL_' + Capitalize(worker.nom);
        var sheet = workbookExisting.getWorksheet(sheetName);
        if (!sheet) sheet = workbookExisting.getWorksheet('JOURNAL');

        if (sheet) {
          sheet.eachRow(function(row, rowNum) {
            if (rowNum > 1) {
              var cells = row.values;
              existingEntries.push({
                uuid_travailleur: worker.uuid,
                date:             cells[1] || '',
                atelier:          cells[2] || '',
                machine_nom:      cells[3] || '',
                duree_minutes:    typeof cells[4] === 'number' ? cells[4] : Utils.parseDuree(cells[4]),
                saisi_par:        cells[5] || '',
                commentaire:      cells[6] || ''
              });
            }
          });
        }

        DB.getJournalByTravailleur(worker.uuid).then(function(localEntries) {
          // Dédoublonner
          var seen = {};
          localEntries.forEach(function(e) {
            seen[e.date + '|' + e.machine_nom + '|' + e.duree_minutes] = true;
          });

          var uniqueExisting = existingEntries.filter(function(e) {
            var key = e.date + '|' + e.machine_nom + '|' + e.duree_minutes;
            if (seen[key]) return false;
            seen[key] = true;
            return true;
          });

          var allEntries = localEntries.concat(uniqueExisting);

          var workbook = new ExcelJS.Workbook();
          workbook.creator = 'Su-Mat-Tra';
          workbook.created = new Date();

          ExcelModule.createTravailleurSheet(workbook, worker, allEntries).then(function() {
            workbook.xlsx.writeBuffer().then(function(buffer) {
              // Conserver le nom de fichier original
              ExcelModule.downloadFile(buffer, originalFileName);
              Utils.showToast('Fusion terminée : ' + allEntries.length + ' entrée(s) au total', 'success');
            });
          });
        });
      });
    },

    /**
     * Crée les feuilles pour un travailleur dans le workbook
     */
    createTravailleurSheet: function(workbook, worker, customEntries) {
      return new Promise(function(resolve) {
        var promiseEntries = customEntries ? Promise.resolve(customEntries) : DB.getJournalByTravailleur(worker.uuid);

        Promise.all([
          promiseEntries,
          DB.getConfig('moniteur_nom')
        ]).then(function(results) {
          var entries     = results[0];
          var moniteurNom = results[1] || '';

          // === Feuille INFOS ===
          var sheet = workbook.addWorksheet(Capitalize(worker.nom).substring(0, 30));
          var rowInfos = 1;

          sheet.getCell(rowInfos, 1).value = 'INFORMATIONS TRAVAILLEUR';
          sheet.getCell(rowInfos, 1).font = { bold: true, size: 14 };
          rowInfos++;

          sheet.getCell(rowInfos, 1).value = 'Nom:';
          sheet.getCell(rowInfos, 2).value = Capitalize(worker.nom);
          rowInfos++;

          sheet.getCell(rowInfos, 1).value = 'Prénom:';
          sheet.getCell(rowInfos, 2).value = Capitalize(worker.prenom);
          rowInfos++;

          if (worker.date_distinctive) {
            sheet.getCell(rowInfos, 1).value = 'Date de naissance:';
            sheet.getCell(rowInfos, 2).value = worker.date_distinctive;
            rowInfos++;
          }

          sheet.getCell(rowInfos, 1).value = 'Type:';
          sheet.getCell(rowInfos, 2).value = worker.type === 'stagiaire' ? 'Stagiaire' : 'Travailleur';
          rowInfos++;

          if (worker.date_creation) {
            sheet.getCell(rowInfos, 1).value = 'Date création:';
            sheet.getCell(rowInfos, 2).value = worker.date_creation;
            rowInfos++;
          }

          // UUID stocké pour vérification future
          sheet.getCell(rowInfos, 1).value = 'UUID:';
          sheet.getCell(rowInfos, 2).value = worker.uuid || '';
          rowInfos++;

          if (moniteurNom) {
            sheet.getCell(rowInfos, 1).value = 'Moniteur:';
            sheet.getCell(rowInfos, 2).value = moniteurNom;
          }

          sheet.columns = [{ width: 20 }, { width: 25 }];

          // === Feuille JOURNAL ===
          var sheetJournal = workbook.addWorksheet(('JOURNAL_' + Capitalize(worker.nom)).substring(0, 31));

          var headers = ['Date', 'Atelier', 'Matériel', 'Durée (min)', 'Saisi par', 'Commentaire'];
          headers.forEach(function(h, i) {
            var cell = sheetJournal.getCell(1, i + 1);
            cell.value = h;
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
          });

          entries.sort(function(a, b) {
            return b.date.localeCompare(a.date);
          });

          entries.forEach(function(e, i) {
            var row = i + 2;
            sheetJournal.getCell(row, 1).value = e.date;
            sheetJournal.getCell(row, 2).value = e.atelier || '';
            sheetJournal.getCell(row, 3).value = e.machine_nom;
            sheetJournal.getCell(row, 4).value = e.duree_minutes;
            sheetJournal.getCell(row, 5).value = e.saisi_par || moniteurNom || '';
            sheetJournal.getCell(row, 6).value = e.commentaire || '';
          });

          sheetJournal.columns = [
            { key: 'date',        width: 12 },
            { key: 'atelier',     width: 20 },
            { key: 'machine',     width: 25 },
            { key: 'duree',       width: 12 },
            { key: 'saisi',       width: 15 },
            { key: 'commentaire', width: 40 }
          ];

          // === Feuille STATS ===
              var sheetStats = workbook.addWorksheet(('STATS_' + Capitalize(worker.nom)).substring(0, 31));

              var totalMinutes  = 0;
              var totalAbsent   = 0;
              var totalConge    = 0;
              var machinesCount = {};
              var datesCount    = {};

              entries.forEach(function(e) {
                var mins = e.duree_minutes || 0;
                if (e.machine_nom === 'Absent') {
                  totalAbsent += mins;
                } else if (e.machine_nom === 'Congé') {
                  totalConge += mins;
                } else {
                  totalMinutes += mins;
                  machinesCount[e.machine_nom] = (machinesCount[e.machine_nom] || 0) + mins;
                }
                var month = e.date ? e.date.substring(0, 7) : '';
                if (month) datesCount[month] = (datesCount[month] || 0) + mins;
              });

              var totalAvecAbsences = totalMinutes + totalAbsent + totalConge;

              var machinesSorted = Object.keys(machinesCount).sort(function(a, b) {
                return machinesCount[b] - machinesCount[a];
              });

              var rowStats = 1;

              // Titre
              var titleCell = sheetStats.getCell(rowStats, 1);
              titleCell.value = 'STATISTIQUES GLOBALES';
              titleCell.font = { bold: true, size: 14 };
              rowStats += 2;

              // Résumé temps
              sheetStats.getCell(rowStats, 1).value = 'Temps de travail effectif :';
              sheetStats.getCell(rowStats, 1).font = { bold: true };
              sheetStats.getCell(rowStats, 2).value = Utils.formatDuree(totalMinutes);
              rowStats++;

              sheetStats.getCell(rowStats, 1).value = 'Absences non justifiées :';
              sheetStats.getCell(rowStats, 1).font = { bold: true, color: { argb: 'FFE74C3C' } };
              sheetStats.getCell(rowStats, 2).value = Utils.formatDuree(totalAbsent);
              rowStats++;

              sheetStats.getCell(rowStats, 1).value = 'Congés (justifiés) :';
              sheetStats.getCell(rowStats, 1).font = { bold: true, color: { argb: 'FFF39C12' } };
              sheetStats.getCell(rowStats, 2).value = Utils.formatDuree(totalConge);
              rowStats++;

              sheetStats.getCell(rowStats, 1).value = 'Nombre d\'interventions :';
              sheetStats.getCell(rowStats, 2).value = entries.length;
              rowStats += 2;

              // En-tête tableau
              sheetStats.getCell(rowStats, 1).value = 'Matériel / Tâche';
              sheetStats.getCell(rowStats, 2).value = 'Temps total';
              sheetStats.getCell(rowStats, 3).value = '% (hors absences)';
              sheetStats.getCell(rowStats, 4).value = '% (avec absences)';
              [1,2,3,4].forEach(function(col) {
                var c = sheetStats.getCell(rowStats, col);
                c.font = { bold: true };
                c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
                c.border = {
                  bottom: { style: 'thin', color: { argb: 'FF999999' } }
                };
              });
              rowStats++;

              // Lignes matériels normaux
              machinesSorted.forEach(function(m) {
                var pctSans = totalMinutes > 0
                  ? ((machinesCount[m] / totalMinutes) * 100).toFixed(1) + '%'
                  : '—';
                var pctAvec = totalAvecAbsences > 0
                  ? ((machinesCount[m] / totalAvecAbsences) * 100).toFixed(1) + '%'
                  : '—';
                sheetStats.getCell(rowStats, 1).value = m;
                sheetStats.getCell(rowStats, 2).value = Utils.formatDuree(machinesCount[m]);
                sheetStats.getCell(rowStats, 3).value = pctSans;
                sheetStats.getCell(rowStats, 4).value = pctAvec;
                rowStats++;
              });

              // Séparateur
              rowStats++;

              // Ligne Absent
              if (totalAbsent > 0) {
                var pctAbsentAvec = totalAvecAbsences > 0
                  ? ((totalAbsent / totalAvecAbsences) * 100).toFixed(1) + '%'
                  : '—';
                sheetStats.getCell(rowStats, 1).value = '⚠ Absent (non justifié)';
                sheetStats.getCell(rowStats, 1).font = { bold: true, color: { argb: 'FFE74C3C' } };
                sheetStats.getCell(rowStats, 2).value = Utils.formatDuree(totalAbsent);
                sheetStats.getCell(rowStats, 3).value = '—';
                sheetStats.getCell(rowStats, 4).value = pctAbsentAvec;
                [1,2,3,4].forEach(function(col) {
                  sheetStats.getCell(rowStats, col).fill = {
                    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE8E6' }
                  };
                });
                rowStats++;
              }

              // Ligne Congé
              if (totalConge > 0) {
                var pctCongeAvec = totalAvecAbsences > 0
                  ? ((totalConge / totalAvecAbsences) * 100).toFixed(1) + '%'
                  : '—';
                sheetStats.getCell(rowStats, 1).value = '📅 Congé (justifié)';
                sheetStats.getCell(rowStats, 1).font = { bold: true, color: { argb: 'FFF39C12' } };
                sheetStats.getCell(rowStats, 2).value = Utils.formatDuree(totalConge);
                sheetStats.getCell(rowStats, 3).value = '—';
                sheetStats.getCell(rowStats, 4).value = pctCongeAvec;
                [1,2,3,4].forEach(function(col) {
                  sheetStats.getCell(rowStats, col).fill = {
                    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' }
                  };
                });
                rowStats++;
              }

              // Ligne total général
              rowStats++;
              sheetStats.getCell(rowStats, 1).value = 'TOTAL GÉNÉRAL';
              sheetStats.getCell(rowStats, 1).font = { bold: true };
              sheetStats.getCell(rowStats, 2).value = Utils.formatDuree(totalAvecAbsences);
              sheetStats.getCell(rowStats, 3).value = '—';
              sheetStats.getCell(rowStats, 4).value = '100%';
              [1,2,3,4].forEach(function(col) {
                sheetStats.getCell(rowStats, col).font = { bold: true };
                sheetStats.getCell(rowStats, col).fill = {
                  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' }
                };
              });

              sheetStats.columns = [
                { key: 'machine',  width: 30 },
                { key: 'duree',    width: 14 },
                { key: 'pctSans',  width: 20 },
                { key: 'pctAvec',  width: 20 }
              ];

              sheetGraph.columns = [
                { key: 'machine', width: 30 },
                { key: 'minutes', width: 12 },
                { key: 'pct',     width: 22 }
              ];

              resolve();
            });
          });
        },

        downloadFile: function(buffer, fileName) {
          var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          var url = window.URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }, 100);
        }
      };

      function Capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
      }

    })();
