/**
 * travailleurs.js - Module onglet Travailleurs
 */

(function() {
  'use strict';

  window.TravailleursModule = {

    init: function() {
      var btnAddTravailleur = document.getElementById('btn-add-travailleur');
      var btnAddStagiaire   = document.getElementById('btn-add-stagiaire');

      if (btnAddTravailleur) {
        btnAddTravailleur.addEventListener('click', function() {
          TravailleursModule.addTravailleur('travailleur');
        });
      }
      if (btnAddStagiaire) {
        btnAddStagiaire.addEventListener('click', function() {
          TravailleursModule.addTravailleur('stagiaire');
        });
      }

      TravailleursModule.refresh();
    },

    // ─────────────────────────────────────────────
    //  REFRESH
    // ─────────────────────────────────────────────
    refresh: function() {
      var container = document.getElementById('liste-travailleurs');
      if (!container) return;

      DB.getAllTravailleurs().then(function(travailleurs) {
        container.innerHTML = '';

        if (travailleurs.length === 0) {
          container.innerHTML =
            '<div class="empty-state">' +
              '<p>Aucun travailleur enregistré.</p>' +
              '<p>Cliquez sur "+ Ajouter un travailleur" pour commencer.</p>' +
            '</div>';
          return;
        }

        var travailleursList = travailleurs.filter(function(t) { return t.type === 'travailleur'; });
        var stagiairesList   = travailleurs.filter(function(t) { return t.type === 'stagiaire'; });

        if (travailleursList.length > 0) {
          var titreT = document.createElement('h3');
          titreT.textContent = 'Travailleurs';
          titreT.style.cssText = 'margin:16px 0 8px;color:var(--text-secondary);';
          container.appendChild(titreT);
          travailleursList.forEach(function(t) {
            container.appendChild(TravailleursModule.createTravailleurCard(t));
          });
        }

        if (stagiairesList.length > 0) {
          var titreS = document.createElement('h3');
          titreS.textContent = 'Stagiaires';
          titreS.style.cssText = 'margin:16px 0 8px;color:var(--text-secondary);';
          container.appendChild(titreS);

          stagiairesList.sort(function(a, b) {
            return b.date_creation.localeCompare(a.date_creation);
          });
          stagiairesList.forEach(function(t) {
            container.appendChild(TravailleursModule.createTravailleurCard(t));
          });
        }

      }).catch(function(err) {
        console.error('Erreur chargement travailleurs:', err);
        Utils.showToast('Erreur lors du chargement', 'error');
      });
    },

    // ─────────────────────────────────────────────
    //  CARTE TRAVAILLEUR
    // ─────────────────────────────────────────────
    createTravailleurCard: function(travailleur) {
      var card = document.createElement('div');
      card.className = 'card';
      card.setAttribute('data-uuid', travailleur.uuid);

      var content = document.createElement('div');
      content.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

      // ── Infos ──
      var info = document.createElement('div');

      var nom = document.createElement('div');
      nom.style.cssText = 'font-size:17px;font-weight:600;color:var(--accent);';
      nom.textContent = Capitalize(travailleur.prenom) + ' ' + Capitalize(travailleur.nom);
      info.appendChild(nom);

      if (travailleur.date_distinctive) {
        var naissance = document.createElement('div');
        naissance.style.cssText = 'font-size:13px;color:var(--text-secondary);margin-top:2px;';
        naissance.textContent = 'Date de naissance : ' + travailleur.date_distinctive;
        info.appendChild(naissance);
      }

      var dateAjout = document.createElement('div');
      dateAjout.style.cssText = 'font-size:12px;margin-top:4px;color:var(--text-secondary);';
      dateAjout.textContent = 'Ajouté le : ' + Utils.formatDateShort(travailleur.date_creation);
      info.appendChild(dateAjout);

      content.appendChild(info);

      // ── Actions ──
      var actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;';

      var btnHistory = document.createElement('button');
      btnHistory.type = 'button';
      btnHistory.className = 'btn-icon';
      btnHistory.textContent = '📊';
      btnHistory.title = 'Voir l\'historique';
      btnHistory.addEventListener('click', function() {
        TravailleursModule.showHistory(travailleur);
      });

      var btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.className = 'btn-icon';
      btnEdit.textContent = '✏️';
      btnEdit.title = 'Modifier';
      btnEdit.addEventListener('click', function() {
        TravailleursModule.editTravailleur(travailleur);
      });

      var btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'btn-icon';
      btnDelete.textContent = '🗑️';
      btnDelete.title = 'Supprimer';
      btnDelete.addEventListener('click', function() {
        TravailleursModule.deleteTravailleur(travailleur);
      });

      actions.appendChild(btnHistory);
      actions.appendChild(btnEdit);
      actions.appendChild(btnDelete);
      content.appendChild(actions);
      card.appendChild(content);

      return card;
    },

    // ─────────────────────────────────────────────
    //  VALIDATION DATE MM/AAAA
    // ─────────────────────────────────────────────

    /**
     * Formate la saisie en temps réel → MM/AAAA
     * Accepte la suppression (backspace) naturellement.
     */
    bindDateInput: function(input) {
      input.addEventListener('input', function() {
        // Conserver uniquement les chiffres
        var digits = input.value.replace(/\D/g, '');

        if (digits.length === 0) {
          input.value = '';
          return;
        }

        // Limiter à 6 chiffres (MMAAAA)
        if (digits.length > 6) digits = digits.substring(0, 6);

        // Insérer le slash après les 2 premiers chiffres
        if (digits.length <= 2) {
          input.value = digits;
        } else {
          input.value = digits.substring(0, 2) + '/' + digits.substring(2);
        }
      });

      // Nettoyage à la sortie du champ
      input.addEventListener('blur', function() {
        var val = input.value.trim();
        if (val === '') return;
        var err = TravailleursModule.validateDateNaissance(val);
        if (err) {
          input.style.borderColor = 'var(--error, #ef4444)';
          input.title = err;
        } else {
          input.style.borderColor = '';
          input.title = '';
        }
      });

      input.addEventListener('focus', function() {
        input.style.borderColor = '';
        input.title = '';
      });
    },

    /**
     * Valide une date au format MM/AAAA
     * @returns {string|null} Message d'erreur ou null si valide
     */
    validateDateNaissance: function(val) {
      if (!val || val.trim() === '') return null; // champ optionnel

      var parts = val.split('/');
      if (parts.length !== 2) return 'Format attendu : MM/AAAA (ex : 03/1985)';

      var mois  = parseInt(parts[0], 10);
      var annee = parseInt(parts[1], 10);

      if (isNaN(mois) || isNaN(annee))          return 'Format attendu : MM/AAAA (ex : 03/1985)';
      if (parts[0].length !== 2)                return 'Le mois doit être sur 2 chiffres (ex : 03)';
      if (parts[1].length !== 4)                return 'L\'année doit être sur 4 chiffres (ex : 1985)';
      if (mois < 1 || mois > 12)                return 'Le mois doit être compris entre 01 et 12';
      if (annee < 1950)                         return 'L\'année semble incorrecte (minimum 1950). Vérifiez la saisie.';

      return null;
    },

    // ─────────────────────────────────────────────
    //  AJOUTER UN TRAVAILLEUR
    // ─────────────────────────────────────────────
    addTravailleur: function(type) {
      var label = type === 'stagiaire' ? 'stagiaire' : 'travailleur';

      Utils.openModal(
        '<div class="field-group">' +
          '<label>Nom</label>' +
          '<input type="text" id="modal-trav-nom" placeholder="Nom de famille">' +
        '</div>' +
        '<div class="field-group">' +
          '<label>Prénom</label>' +
          '<input type="text" id="modal-trav-prenom" placeholder="Prénom">' +
        '</div>' +
        '<div class="field-group">' +
          '<label>Date de naissance <span style="font-weight:400;color:var(--text-secondary);">(optionnel)</span></label>' +
          '<input type="text" id="modal-trav-date" placeholder="MM/AAAA" maxlength="7" inputmode="numeric">' +
          '<div id="modal-trav-date-err" style="font-size:12px;color:var(--error,#ef4444);margin-top:4px;min-height:16px;"></div>' +
        '</div>' +
        '<p style="font-size:12px;color:var(--text-secondary);margin-top:4px;">' +
          'La date de naissance permet de différencier deux personnes avec le même nom.' +
        '</p>',

        function() {
          var nom    = document.getElementById('modal-trav-nom').value.trim();
          var prenom = document.getElementById('modal-trav-prenom').value.trim();
          var date   = document.getElementById('modal-trav-date').value.trim();
          var errDiv = document.getElementById('modal-trav-date-err');

          if (!nom || !prenom) {
            Utils.showToast('Veuillez entrer le nom et le prénom', 'warning');
            return;
          }

          var errDate = TravailleursModule.validateDateNaissance(date);
          if (errDate) {
            errDiv.textContent = errDate;
            document.getElementById('modal-trav-date').focus();
            return; // Ne pas fermer la modale
          }

          Utils.closeModal();
          DB.addTravailleur({
            nom: nom,
            prenom: prenom,
            date_distinctive: date,
            type: type
          }).then(function() {
            Utils.showToast(label === 'stagiaire' ? 'Stagiaire ajouté' : 'Travailleur ajouté', 'success');
            TravailleursModule.refresh();
          }).catch(function() {
            Utils.showToast('Erreur lors de l\'ajout', 'error');
          });
        },
        null,
        'Ajouter',
        'Annuler'
      );

      setTimeout(function() {
        var inputNom  = document.getElementById('modal-trav-nom');
        var inputDate = document.getElementById('modal-trav-date');
        if (inputNom)  inputNom.focus();
        if (inputDate) TravailleursModule.bindDateInput(inputDate);
      }, 100);
    },

    // ─────────────────────────────────────────────
    //  MODIFIER UN TRAVAILLEUR
    // ─────────────────────────────────────────────
    editTravailleur: function(travailleur) {
      Utils.openModal(
        '<div class="field-group">' +
          '<label>Nom</label>' +
          '<input type="text" id="modal-edit-nom" value="' + escapeHtml(travailleur.nom) + '">' +
        '</div>' +
        '<div class="field-group">' +
          '<label>Prénom</label>' +
          '<input type="text" id="modal-edit-prenom" value="' + escapeHtml(travailleur.prenom) + '">' +
        '</div>' +
        '<div class="field-group">' +
          '<label>Date de naissance <span style="font-weight:400;color:var(--text-secondary);">(optionnel)</span></label>' +
          '<input type="text" id="modal-edit-date" value="' + escapeHtml(travailleur.date_distinctive || '') + '" placeholder="MM/AAAA" maxlength="7" inputmode="numeric">' +
          '<div id="modal-edit-date-err" style="font-size:12px;color:var(--error,#ef4444);margin-top:4px;min-height:16px;"></div>' +
        '</div>',

        function() {
          var nom    = document.getElementById('modal-edit-nom').value.trim();
          var prenom = document.getElementById('modal-edit-prenom').value.trim();
          var date   = document.getElementById('modal-edit-date').value.trim();
          var errDiv = document.getElementById('modal-edit-date-err');

          if (!nom || !prenom) {
            Utils.showToast('Le nom et le prénom sont obligatoires', 'warning');
            return;
          }

          var errDate = TravailleursModule.validateDateNaissance(date);
          if (errDate) {
            errDiv.textContent = errDate;
            document.getElementById('modal-edit-date').focus();
            return;
          }

          Utils.closeModal();
          DB.updateTravailleur(travailleur.uuid, {
            nom: nom,
            prenom: prenom,
            date_distinctive: date
          }).then(function() {
            Utils.showToast('Informations mises à jour', 'success');
            TravailleursModule.refresh();
          }).catch(function() {
            Utils.showToast('Erreur lors de la modification', 'error');
          });
        },
        null,
        'Enregistrer',
        'Annuler'
      );

      setTimeout(function() {
        var inputDate = document.getElementById('modal-edit-date');
        if (inputDate) TravailleursModule.bindDateInput(inputDate);
      }, 100);
    },

    // ─────────────────────────────────────────────
    //  SUPPRIMER UN TRAVAILLEUR
    // ─────────────────────────────────────────────
    deleteTravailleur: function(travailleur) {
      var typeLabel = travailleur.type === 'stagiaire' ? 'stagiaire' : 'travailleur';

      Utils.openModal(
        '<p>Êtes-vous sûr de vouloir supprimer <strong>' +
          Capitalize(travailleur.prenom) + ' ' + Capitalize(travailleur.nom) +
        '</strong> ?</p>' +
        '<p style="font-size:13px;color:var(--text-secondary);margin-top:8px;">' +
          'Ce ' + typeLabel + ' sera marqué comme inactif. Il pourra être réactivé lors d\'un import.' +
        '</p>',
        function() {
          Utils.closeModal();
          DB.deleteTravailleur(travailleur.uuid).then(function() {
            Utils.showToast(typeLabel + ' supprimé', 'success');
            TravailleursModule.refresh();
          }).catch(function() {
            Utils.showToast('Erreur lors de la suppression', 'error');
          });
        },
        null,
        'Supprimer',
        'Annuler'
      );
    },

    // ─────────────────────────────────────────────
    //  HISTORIQUE
    // ─────────────────────────────────────────────
    showHistory: function(travailleur) {
      var modalContent =
        '<div id="history-modal-content">' +
          '<div class="field-group"><label>Période</label>' +
            '<select id="history-periode">' +
              '<option value="7">7 derniers jours</option>' +
              '<option value="30" selected>30 derniers jours</option>' +
              '<option value="90">3 derniers mois</option>' +
              '<option value="365">Année complète</option>' +
              '<option value="custom">Personnalisé</option>' +
            '</select>' +
          '</div>' +
          '<div id="history-custom-dates" class="hidden">' +
            '<div class="field-group"><label>Du</label><input type="date" id="history-date-debut"></div>' +
            '<div class="field-group"><label>Au</label><input type="date" id="history-date-fin"></div>' +
          '</div>' +
          '<div id="history-stats"  style="margin-top:16px;"></div>' +
          '<div id="history-chart"  style="margin-top:16px;height:250px;"></div>' +
          '<div id="history-table"  style="margin-top:16px;max-height:200px;overflow-y:auto;"></div>' +
        '</div>';

      Utils.openModal(modalContent, null, null, '', 'Fermer');

      var selectPeriode  = document.getElementById('history-periode');
      var divCustomDates = document.getElementById('history-custom-dates');
      var inputDateDebut = document.getElementById('history-date-debut');
      var inputDateFin   = document.getElementById('history-date-fin');

      selectPeriode.addEventListener('change', function() {
        if (this.value === 'custom') {
          divCustomDates.classList.remove('hidden');
          var threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
          inputDateFin.value   = Utils.todayISO();
          inputDateDebut.value = threeMonthsAgo.toISOString().split('T')[0];
        } else {
          divCustomDates.classList.add('hidden');
          TravailleursModule.loadHistory(travailleur);
        }
      });

      inputDateDebut.addEventListener('change', function() { TravailleursModule.loadHistory(travailleur); });
      inputDateFin.addEventListener('change',   function() { TravailleursModule.loadHistory(travailleur); });

      TravailleursModule.loadHistory(travailleur);
    },

    loadHistory: function(travailleur) {
      var selectPeriode  = document.getElementById('history-periode');
      var inputDateDebut = document.getElementById('history-date-debut');
      var inputDateFin   = document.getElementById('history-date-fin');

      var dateDebut, dateFin;
      var periode = selectPeriode.value;

      if (periode === 'custom') {
        dateDebut = inputDateDebut.value;
        dateFin   = inputDateFin.value;
      } else {
        var n = parseInt(periode);
        dateFin   = Utils.todayISO();
        dateDebut = Utils.addDays(dateFin, -n);
      }

      if (!dateDebut || !dateFin) return;

      var containerStats = document.getElementById('history-stats');
      var containerChart = document.getElementById('history-chart');
      var containerTable = document.getElementById('history-table');

      containerStats.innerHTML = '<div class="loading"></div>';
      containerChart.innerHTML = '';
      containerTable.innerHTML = '';

      DB.getJournalByPeriode(travailleur.uuid, dateDebut, dateFin).then(function(entries) {
        var totalMinutes = 0;
        var machinesCount = {};

        entries.forEach(function(e) {
          totalMinutes += e.duree_minutes || 0;
          machinesCount[e.machine_nom] = (machinesCount[e.machine_nom] || 0) + (e.duree_minutes || 0);
        });

        var machinesSorted = Object.keys(machinesCount).sort(function(a, b) {
          return machinesCount[b] - machinesCount[a];
        });

        // Stats
        containerStats.innerHTML =
          '<div class="card" style="margin:0;">' +
            '<div style="font-size:14px;color:var(--text-secondary);">Période : ' +
              Utils.formatDateShort(dateDebut) + ' – ' + Utils.formatDateShort(dateFin) +
            '</div>' +
            '<div style="font-size:24px;font-weight:700;color:var(--accent);margin-top:8px;">' +
              Utils.formatDuree(totalMinutes) +
            '</div>' +
            '<div style="font-size:13px;color:var(--text-secondary);">Temps total</div>' +
            '<div style="font-size:15px;margin-top:8px;">' + entries.length + ' interventions</div>' +
          '</div>';

        // Graphique
        if (typeof Chart !== 'undefined' && machinesSorted.length > 0) {
          var ctx = document.createElement('canvas');
          containerChart.appendChild(ctx);
          new Chart(ctx, {
            type: 'doughnut',
            data: {
              labels: machinesSorted.slice(0, 8),
              datasets: [{
                data: machinesSorted.map(function(m) { return machinesCount[m]; }),
                backgroundColor: [
                  '#2e7d32','#1976d2','#7b1fa2','#c62828',
                  '#f57f17','#00838f','#558b2f','#e65100'
                ].slice(0, machinesSorted.length)
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom' } }
            }
          });
        }

        // Tableau
        if (entries.length === 0) {
          containerTable.innerHTML =
            '<div class="empty-state"><p>Aucune intervention pendant cette période.</p></div>';
        } else {
          var html =
            '<table style="width:100%;font-size:13px;border-collapse:collapse;">' +
              '<thead>' +
                '<tr style="background:var(--bg-primary);">' +
                  '<th style="text-align:left;padding:8px;">Date</th>' +
                  '<th style="text-align:left;padding:8px;">Matériel</th>' +
                  '<th style="text-align:right;padding:8px;">Durée</th>' +
                '</tr>' +
              '</thead><tbody>';

          entries.forEach(function(e) {
            html +=
              '<tr>' +
                '<td style="padding:8px;border-bottom:1px solid var(--border);">' + Utils.formatDateShort(e.date) + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid var(--border);">' + escapeHtml(e.machine_nom) + '</td>' +
                '<td style="padding:8px;border-bottom:1px solid var(--border);text-align:right;">' + Utils.formatDuree(e.duree_minutes) + '</td>' +
              '</tr>';
          });

          html += '</tbody></table>';
          containerTable.innerHTML = html;
        }
      });
    }
  };

  // ─────────────────────────────────────────────
  //  UTILITAIRES PRIVÉS
  // ─────────────────────────────────────────────

  function Capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
