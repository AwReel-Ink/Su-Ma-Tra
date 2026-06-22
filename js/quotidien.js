/**
 * quotidien.js - Module onglet Quotidien
 */

(function() {
  'use strict';

  window.QuotidienModule = {

    init: function() {
      var btnDate = document.getElementById('btn-date-nav');
      var btnPrev = document.getElementById('btn-date-prev');
      var btnNext = document.getElementById('btn-date-next');

      function updateDateUI() {
        if (btnDate) btnDate.textContent = Utils.formatDate(App.currentDate);
        if (btnNext) {
          var isToday = App.currentDate === Utils.todayISO();
          btnNext.disabled = isToday;
          btnNext.classList.toggle('btn-date-arrow--disabled', isToday);
        }
      }

      if (btnPrev) {
        btnPrev.addEventListener('click', function() {
          App.setCurrentDate(Utils.addDays(App.currentDate, -1));
          updateDateUI();
          QuotidienModule.refresh();
        });
      }

      if (btnNext) {
        btnNext.addEventListener('click', function() {
          if (App.currentDate >= Utils.todayISO()) return;
          App.setCurrentDate(Utils.addDays(App.currentDate, 1));
          updateDateUI();
          QuotidienModule.refresh();
        });
      }

      if (btnDate) {
        btnDate.addEventListener('click', QuotidienModule.chooseDate);
      }

      updateDateUI();
      QuotidienModule.initAtelierSelect();
      QuotidienModule.refresh();
    },

    initAtelierSelect: function() {
      var select = document.getElementById('select-atelier');
      if (!select) return;

      DB.getConfig('atelier_nom').then(function(nom) {
        if (nom) {
          var option = document.createElement('option');
          option.value = nom;
          option.textContent = nom;
          select.appendChild(option);

          if (App.currentAtelier) {
            select.value = App.currentAtelier;
          } else {
            select.value = nom;
            App.setCurrentAtelier(nom);
          }
        }

        select.addEventListener('change', function() {
          App.setCurrentAtelier(this.value);
          QuotidienModule.refresh();
        });
      });
    },

    chooseDate: function() {
      Utils.openModal(
        '<div class="field-group">' +
          '<label>Choisir une date</label>' +
          '<input type="date" id="input-date-picker" value="' + App.currentDate + '">' +
        '</div>',
        function() {
          var input = document.getElementById('input-date-picker');
          if (!input || !input.value) return;
          Utils.closeModal();
          App.setCurrentDate(input.value);
          var btnDate = document.getElementById('btn-date-nav');
          if (btnDate) btnDate.textContent = Utils.formatDate(App.currentDate);
          QuotidienModule.refresh();
        },
        null,
        'Valider',
        'Annuler'
      );
    },

    refresh: function() {
      var container = document.getElementById('liste-travailleurs-quotidien');
      if (!container) return;

      DB.getAllTravailleurs().then(function(travailleurs) {
        container.innerHTML = '';

        if (travailleurs.length === 0) {
          container.innerHTML = '<div class="empty-state"><p>Aucun travailleur enregistré.</p><p>Allez dans l\'onglet Travailleurs pour en ajouter.</p></div>';
          return;
        }

        // Bouton global "Tout enregistrer" en haut
        var btnSaveAll = document.createElement('button');
        btnSaveAll.className = 'btn-primary btn-large btn-save-all';
        btnSaveAll.textContent = '💾 Enregistrer tout';
        btnSaveAll.addEventListener('click', function() {
          QuotidienModule.saveAll(container);
        });
        container.appendChild(btnSaveAll);

        travailleurs.forEach(function(t) {
          container.appendChild(QuotidienModule.createTravailleurCard(t));
        });

        // Deuxième bouton en bas pour les longues listes
        var btnSaveAllBottom = btnSaveAll.cloneNode(true);
        btnSaveAllBottom.addEventListener('click', function() {
          QuotidienModule.saveAll(container);
        });
        container.appendChild(btnSaveAllBottom);

      }).catch(function(err) {
        console.error('Erreur chargement travailleurs:', err);
        Utils.showToast('Erreur lors du chargement', 'error');
      });
    },

    saveAll: function(container) {
      var lignesNew = container.querySelectorAll('.ligne-materiel[data-new="true"]');

      if (lignesNew.length === 0) {
        Utils.showToast('Aucune nouvelle entrée à enregistrer', 'warning');
        return;
      }

      var promises = [];
      var errors = 0;

      lignesNew.forEach(function(ligne) {
        var selectMachine = ligne.querySelector('.select-machine');
        var dureeContainer = ligne.querySelector('.duree-options');
        var customHH = ligne.querySelector('.duree-hh');
        var customMM = ligne.querySelector('.duree-mm');
        var uuidTravailleur = ligne.getAttribute('data-uuid-travailleur');
        var inputComment = ligne.querySelector('.input-commentaire');
        var commentaire = inputComment ? inputComment.value.trim() : '';

        var machineNom = selectMachine ? selectMachine.value : '';

        var duree = 0;
        var selectedBtn = dureeContainer ? dureeContainer.querySelector('.btn-duree.active') : null;
        if (selectedBtn) {
          duree = parseInt(selectedBtn.getAttribute('data-minutes'));
        } else if (customHH && customMM) {
          var hh = parseInt(customHH.value) || 0;
          var mm = parseInt(customMM.value) || 0;
          duree = hh * 60 + mm;
        }

        if (!machineNom || !duree || duree <= 0) {
          errors++;
          ligne.classList.add('ligne-error');
          return;
        }

        ligne.classList.remove('ligne-error');

        promises.push(
          DB.addJournalEntry({
            uuid_travailleur: uuidTravailleur,
            date: App.currentDate,
            atelier: App.getCurrentAtelier(),
            machine_nom: machineNom,
            duree_minutes: duree,
            commentaire: commentaire,
            saisi_par: ''
          })
        );
      });

      if (errors > 0) {
        Utils.showToast(errors + ' ligne(s) incomplète(s) ignorée(s)', 'warning');
      }

      if (promises.length === 0) return;

      Promise.all(promises).then(function() {
        Utils.showToast('Tout a été enregistré avec succès !', 'success');
        QuotidienModule.refresh();
      }).catch(function() {
        Utils.showToast('Erreur lors de l\'enregistrement', 'error');
      });
    },

    createTravailleurCard: function(travailleur) {
      var card = document.createElement('div');
      card.className = 'card-travailleur';
      card.setAttribute('data-uuid', travailleur.uuid);

      var nom = document.createElement('div');
      nom.className = 'travailleur-nom';
      nom.textContent = QuotidienModule.iseur(travailleur.prenom) + ' ' + QuotidienModule.iseur(travailleur.nom);
      card.appendChild(nom);

      DB.getJournalByDate(App.currentDate).then(function(entries) {
        var entriesToday = entries.filter(function(e) {
          return e.uuid_travailleur === travailleur.uuid;
        });

        if (entriesToday.length > 0) {
          entriesToday.forEach(function(entry) {
            card.appendChild(QuotidienModule.createLigneMateriel(travailleur, entry));
          });
        }

        var btnAdd = document.createElement('button');
        btnAdd.className = 'btn-add-ligne btn-secondary';
        btnAdd.textContent = '+ Ajouter un matériel';
        btnAdd.addEventListener('click', function() {
          card.insertBefore(QuotidienModule.createLigneMateriel(travailleur, null), btnAdd);
        });
        card.appendChild(btnAdd);
      });

      return card;
    },

    createLigneMateriel: function(travailleur, entry) {
      var ligne = document.createElement('div');
      ligne.className = 'ligne-materiel';

      var isExisting = entry && entry.id;

      if (!isExisting) {
        ligne.setAttribute('data-new', 'true');
        ligne.setAttribute('data-uuid-travailleur', travailleur.uuid);
      }

      // Sélecteur de matériel
      var selectMachine = document.createElement('select');
      selectMachine.className = 'select-machine';
      selectMachine.innerHTML = '<option value="">-- Sélectionner un matériel --</option>';

      DB.getAllMachines().then(function(machines) {
        machines.forEach(function(m) {
          var opt = document.createElement('option');
          opt.value = m.nom;
          opt.textContent = m.nom;
          selectMachine.appendChild(opt);
        });

        if (entry && entry.machine_nom) {
          // Vérifier si la machine existe encore dans la liste
          var exists = machines.some(function(m) {
            return m.nom === entry.machine_nom;
          });

          // Si la machine a été supprimée et que c'est une ligne en lecture,
          // on l'ajoute quand même comme option pour l'affichage
          if (!exists && isExisting) {
            var optOld = document.createElement('option');
            optOld.value = entry.machine_nom;
            // Indication visuelle que la machine n'existe plus
            optOld.textContent = entry.machine_nom + ' (supprimé)';
            optOld.style.color = 'var(--text-secondary, #888)';
            optOld.style.fontStyle = 'italic';
            selectMachine.appendChild(optOld);
          }

          selectMachine.value = entry.machine_nom;
        }
      });

      // Options de durée
      var dureeContainer = document.createElement('div');
      dureeContainer.className = 'duree-options';

      var durees = [
        { label: '½ journée (3h30)', minutes: 210 },
        { label: 'Journée (7h)',     minutes: 420 }
      ];

      durees.forEach(function(d) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-duree';
        btn.textContent = d.label;
        btn.setAttribute('data-minutes', d.minutes);
        btn.addEventListener('click', function() {
          dureeContainer.querySelectorAll('.btn-duree').forEach(function(b) {
            b.classList.remove('active');
          });
          btn.classList.add('active');
          customHH.value = '';
          customMM.value = '';
        });
        dureeContainer.appendChild(btn);
      });

      var labelCustom = document.createElement('span');
      labelCustom.className = 'duree-custom-label';
      labelCustom.textContent = 'Personnalisé :';
      dureeContainer.appendChild(labelCustom);

      var customHH = document.createElement('input');
      customHH.type = 'number';
      customHH.className = 'duree-custom duree-hh';
      customHH.placeholder = 'hh';
      customHH.min = '0';
      customHH.max = '23';

      var sep = document.createElement('span');
      sep.className = 'duree-sep';
      sep.textContent = ':';

      var customMM = document.createElement('input');
      customMM.type = 'number';
      customMM.className = 'duree-custom duree-mm';
      customMM.placeholder = 'mm';
      customMM.min = '0';
      customMM.max = '59';

      function onCustomInput() {
        dureeContainer.querySelectorAll('.btn-duree').forEach(function(b) {
          b.classList.remove('active');
        });
      }
      customHH.addEventListener('input', onCustomInput);
      customMM.addEventListener('input', onCustomInput);

      dureeContainer.appendChild(customHH);
      dureeContainer.appendChild(sep);
      dureeContainer.appendChild(customMM);

      // Pré-remplir durée si entrée existante
      if (entry && entry.duree_minutes) {
        var isStandard = durees.find(function(d) { return d.minutes === entry.duree_minutes; });
        if (isStandard) {
          dureeContainer.querySelectorAll('.btn-duree').forEach(function(btn) {
            if (parseInt(btn.getAttribute('data-minutes')) === entry.duree_minutes) {
              btn.classList.add('active');
            }
          });
        } else {
          customHH.value = Math.floor(entry.duree_minutes / 60);
          customMM.value = entry.duree_minutes % 60;
        }
      }

      // Champ commentaire
      var inputComment = document.createElement('input');
      inputComment.type = 'text';
      inputComment.className = 'input-commentaire';
      inputComment.placeholder = '💬 Commentaire (optionnel) : formation, incident, blessure...';
      inputComment.maxLength = 300;
      if (entry && entry.commentaire) {
        inputComment.value = entry.commentaire;
      }
      if (isExisting) {
        inputComment.disabled = true;
      }

      // Ligne d'actions
      var actionsRow = document.createElement('div');
      actionsRow.className = 'ligne-actions';

      if (isExisting) {
        // Ligne existante : lecture seule + bouton suppression
        ligne.classList.add('ligne-saved');
        selectMachine.disabled = true;
        dureeContainer.querySelectorAll('button, input').forEach(function(el) {
          el.disabled = true;
        });

        var btnSuppr = document.createElement('button');
        btnSuppr.type = 'button';
        btnSuppr.className = 'btn-icon';
        btnSuppr.textContent = '🗑️';
        btnSuppr.title = 'Supprimer cette entrée';
        btnSuppr.addEventListener('click', function() {
          Utils.openModal(
            'Voulez-vous vraiment supprimer cette entrée ?',
            function() {
              Utils.closeModal();
              DB.deleteJournalEntry(entry.id).then(function() {
                Utils.showToast('Entrée supprimée', 'success');
                QuotidienModule.refresh();
              }).catch(function() {
                Utils.showToast('Erreur lors de la suppression', 'error');
              });
            }
          );
        });
        actionsRow.appendChild(btnSuppr);

      } else {
        // Nouvelle ligne : bouton retirer sans passer par la DB
        var btnRetirer = document.createElement('button');
        btnRetirer.type = 'button';
        btnRetirer.className = 'btn-icon';
        btnRetirer.textContent = '✖';
        btnRetirer.title = 'Retirer cette ligne';
        btnRetirer.addEventListener('click', function() {
          ligne.remove();
        });
        actionsRow.appendChild(btnRetirer);
      }

      ligne.appendChild(selectMachine);
      ligne.appendChild(dureeContainer);
      ligne.appendChild(inputComment);
      ligne.appendChild(actionsRow);

      return ligne;
    },

    iseur: function(str) {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }
  };

})();
