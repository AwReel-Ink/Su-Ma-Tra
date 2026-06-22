/**
 * calendrier.js - Module onglet Calendrier
 */

(function() {
  'use strict';

  window.CalendrierModule = {

    init: function() {
      CalendrierModule.initMaterielSelect();
      CalendrierModule.initShareButton();
    },

    initMaterielSelect: function() {
      var select = document.getElementById('select-materiel-calendrier');
      if (!select) return;

      var currentVal = select.value;
      select.innerHTML = '<option value="">-- Sélectionner un matériel --</option>';

      DB.getAllMachines().then(function(machines) {
        machines.forEach(function(m) {
          var opt = document.createElement('option');
          opt.value = m.nom;
          opt.textContent = m.nom;
          select.appendChild(opt);
        });

        // Restaurer la sélection si toujours valide
        if (currentVal && Array.from(select.options).some(function(o) { return o.value === currentVal; })) {
          select.value = currentVal;
        }

        // Eviter de re-empiler le listener à chaque refresh
        if (!select._listenerAdded) {
          select._listenerAdded = true;
          select.addEventListener('change', function() {
            if (this.value) {
              CalendrierModule.showCalendrier(this.value);
            } else {
              var container = document.getElementById('liste-calendrier');
              if (container) container.innerHTML = '';
            }
          });
        }
      });
    },

    initShareButton: function() {
      var btn = document.getElementById('btn-share-calendrier');
      if (!btn) return;
      btn.addEventListener('click', CalendrierModule.openShareModal);
    },

    refresh: function() {
      // Recharge toujours la liste des machines
      CalendrierModule.initMaterielSelect();

      var select = document.getElementById('select-materiel-calendrier');
      if (select && select.value) {
        CalendrierModule.showCalendrier(select.value);
      }
    },

    showCalendrier: function(machineNom) {
      var container = document.getElementById('liste-calendrier');
      if (!container) return;

      container.innerHTML = '<div class="loading"></div>';

      DB.getLastUsageByMachine(machineNom).then(function(entries) {
        container.innerHTML = '';

        if (entries.length === 0) {
          container.innerHTML = '<div class="empty-state"><p>Aucune utilisation enregistrée pour ce matériel.</p></div>';
          return;
        }

        var promises = entries.map(function(entry) {
          return DB.getTravailleur(entry.uuid_travailleur).then(function(t) {
            return { worker: t, entry: entry };
          });
        });

        Promise.all(promises).then(function(results) {
          // Filtrer : travailleur existant ET actif
          var valides = results.filter(function(r) {
            return r.worker && r.worker.actif !== false;
          });

          if (valides.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Aucune utilisation enregistrée pour ce matériel.</p></div>';
            return;
          }

          valides.forEach(function(r, index) {
            container.appendChild(CalendrierModule.createEntryCard(r.worker, r.entry, index + 1));
          });
        });
      }).catch(function(err) {
        console.error('Erreur chargement calendrier:', err);
        container.innerHTML = '<div class="empty-state"><p>Erreur lors du chargement.</p></div>';
      });
    },

    createEntryCard: function(travailleur, entry, rang) {
      var card = document.createElement('div');
      card.className = 'card';

      var titre = document.createElement('div');
      titre.className = 'travailleur-nom';

      var badge = document.createElement('span');
      badge.className = 'rang-badge';
      badge.textContent = rang;

      var nomSpan = document.createElement('span');
      nomSpan.textContent = CalendrierModule.Capitalize(travailleur.prenom) + ' ' + CalendrierModule.Capitalize(travailleur.nom);

      titre.appendChild(badge);
      titre.appendChild(nomSpan);
      card.appendChild(titre);

      var dateDiv = document.createElement('div');
      dateDiv.style.fontSize = '15px';
      dateDiv.style.color = 'var(--text-secondary)';
      dateDiv.textContent = 'Dernière utilisation: ' + Utils.formatDate(entry.date);
      card.appendChild(dateDiv);

      if (entry.atelier) {
        var atelierDiv = document.createElement('div');
        atelierDiv.style.fontSize = '14px';
        atelierDiv.style.marginTop = '4px';
        atelierDiv.textContent = 'Atelier: ' + entry.atelier;
        card.appendChild(atelierDiv);
      }

      return card;
    },

    openShareModal: function() {
      var selected = MachinesModule.getSelectedMachines();

      if (selected.length === 0) {
        Utils.showToast('Aucun matériel sélectionné pour le partage. Cochez des matériels dans l\'onglet Matériels.', 'warning');
        return;
      }

      DB.getAllTravailleurs().then(function(travailleurs) {
        if (travailleurs.length === 0) {
          Utils.showToast('Aucun travailleur enregistré.', 'warning');
          return;
        }

        var machinePromises = selected.map(function(machine) {
          return DB.getLastUsageByMachine(machine.nom).then(function(entries) {
            return { machine: machine, entries: entries };
          });
        });

        Promise.all(machinePromises).then(function(machineData) {
          var texte = CalendrierModule.buildShareText(travailleurs, machineData);
          CalendrierModule.showShareModal(texte);
        });
      });
    },

    buildShareText: function(travailleurs, machineData) {
      var today = new Date();
      var dateStr = today.getDate().toString().padStart(2,'0') + '/' +
                    (today.getMonth()+1).toString().padStart(2,'0') + '/' +
                    today.getFullYear();

      var lines = [];
      lines.push('Calendrier d\'utilisation — ' + dateStr);
      lines.push('');

      // Trier travailleurs par nom, actifs uniquement
      var workers = travailleurs.filter(function(t) {
        return t.actif !== false;
      }).sort(function(a, b) {
        return a.nom.localeCompare(b.nom);
      });

      var COL_NOM  = 20;
      var COL_DATE = 12;
      var BLOC_SIZE = 3;

      for (var b = 0; b < machineData.length; b += BLOC_SIZE) {
        var bloc = machineData.slice(b, b + BLOC_SIZE);

        // Ligne entête
        var header = CalendrierModule.padRight('Travailleur', COL_NOM);
        bloc.forEach(function(md) {
          header += ' | ' + CalendrierModule.padRight(md.machine.nom, COL_DATE);
        });
        lines.push(header);

        // Ligne séparateur
        var sep = CalendrierModule.padRight('', COL_NOM, '-');
        bloc.forEach(function() {
          sep += '-+-' + CalendrierModule.padRight('', COL_DATE, '-');
        });
        lines.push(sep);

        // Une ligne par travailleur
        workers.forEach(function(worker) {
          var nomComplet = worker.nom.toUpperCase() + ' ' + CalendrierModule.Capitalize(worker.prenom);
          var line = CalendrierModule.padRight(nomComplet, COL_NOM);

          bloc.forEach(function(md) {
            var entry = null;
            md.entries.forEach(function(e) {
              if (e.uuid_travailleur === worker.uuid) {
                entry = e;
              }
            });
            var dateVal = entry ? Utils.formatDate(entry.date) : '-';
            line += ' | ' + CalendrierModule.padRight(dateVal, COL_DATE);
          });

          lines.push(line);
        });

        lines.push('');
      }

      return lines.join('\n');
    },

    showShareModal: function(texte) {
      var overlay = document.createElement('div');
      overlay.id = 'share-modal-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;';

      var modal = document.createElement('div');
      modal.style.cssText = 'background:var(--bg-card);border-radius:12px;padding:24px;width:100%;max-width:700px;max-height:85vh;display:flex;flex-direction:column;gap:16px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';

      // Titre
      var titre = document.createElement('div');
      titre.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
      titre.innerHTML = '<h2 style="margin:0;font-size:18px;">📋 Résumé à copier / imprimer</h2>';

      var btnFermer = document.createElement('button');
      btnFermer.textContent = '✕';
      btnFermer.style.cssText = 'background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary);padding:4px 8px;border-radius:6px;';
      btnFermer.addEventListener('click', function() {
        document.body.removeChild(overlay);
      });
      titre.appendChild(btnFermer);
      modal.appendChild(titre);

      // Textarea
      var textarea = document.createElement('textarea');
      textarea.value = texte;
      textarea.readOnly = true;
      textarea.style.cssText = 'width:100%;flex:1;min-height:320px;font-family:monospace;font-size:13px;line-height:1.5;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);resize:none;box-sizing:border-box;';
      modal.appendChild(textarea);

      // Boutons actions
      var btnActions = document.createElement('div');
      btnActions.style.cssText = 'display:flex;gap:10px;';

      // Bouton copier
      var btnCopier = document.createElement('button');
      btnCopier.className = 'btn-primary';
      btnCopier.textContent = '📋 Copier dans le presse-papier';
      btnCopier.style.cssText = 'flex:1;padding:14px;font-size:16px;font-weight:600;border-radius:8px;cursor:pointer;';
      btnCopier.addEventListener('click', function() {
        textarea.select();
        navigator.clipboard.writeText(texte).then(function() {
          btnCopier.textContent = '✅ Copié !';
          btnCopier.style.background = 'var(--success, #22c55e)';
          setTimeout(function() {
            btnCopier.textContent = '📋 Copier dans le presse-papier';
            btnCopier.style.background = '';
          }, 2000);
        }).catch(function() {
          document.execCommand('copy');
          btnCopier.textContent = '✅ Copié !';
          setTimeout(function() {
            btnCopier.textContent = '📋 Copier dans le presse-papier';
          }, 2000);
        });
      });

      // Bouton imprimer
      var btnImprimer = document.createElement('button');
      btnImprimer.className = 'btn-secondary';
      btnImprimer.textContent = '🖨️ Imprimer';
      btnImprimer.style.cssText = 'flex:1;padding:14px;font-size:16px;font-weight:600;border-radius:8px;cursor:pointer;';
      btnImprimer.addEventListener('click', function() {
        var printWin = window.open('', '_blank');
        printWin.document.write(
          '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Calendrier</title>' +
          '<style>' +
          'body{font-family:monospace;font-size:13px;line-height:1.6;padding:24px;color:#000;background:#fff;}' +
          'pre{white-space:pre-wrap;word-break:break-word;}' +
          '@media print{body{padding:0;}}' +
          '</style></head><body>' +
          '<pre>' + texte.replace(/</g, '<').replace(/>/g, '>') + '</pre>' +
          '</body></html>'
        );
        printWin.document.close();
        printWin.focus();
        setTimeout(function() {
          printWin.print();
          printWin.close();
        }, 300);
      });

      btnActions.appendChild(btnCopier);
      btnActions.appendChild(btnImprimer);
      modal.appendChild(btnActions);
      overlay.appendChild(modal);

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
        }
      });

      document.body.appendChild(overlay);
    },

    padRight: function(str, length, char) {
      char = char || ' ';
      str = String(str);
      while (str.length < length) str += char;
      return str.substring(0, length);
    },

    Capitalize: function(str) {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }
  };

})();
