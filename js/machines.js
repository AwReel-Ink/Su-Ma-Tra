/**
 * machines.js - Module onglet Matériels
 */

(function() {
  'use strict';

  window.MachinesModule = {
    init: function() {
      var btnAdd = document.getElementById('btn-add-machine');
      if (btnAdd) {
        btnAdd.addEventListener('click', MachinesModule.addMachine);
      }
      MachinesModule.refresh();
    },

    refresh: function() {
      var container = document.getElementById('liste-machines');
      if (!container) return;

      DB.getAllMachines().then(function(machines) {
        container.innerHTML = '';

        // Bandeau explicatif
        var info = document.createElement('div');
        info.className = 'share-info-banner';
        info.innerHTML = '📋 <strong>Partage calendrier :</strong> Cochez les matériels à inclure dans le résumé partageable (onglet Calendrier).';
        container.appendChild(info);

        if (machines.length === 0) {
          container.innerHTML += '<div class="empty-state"><p>Aucun matériel enregistré.</p></div>';
          return;
        }

        machines.forEach(function(m) {
          container.appendChild(MachinesModule.createMachineCard(m));
        });
      }).catch(function(err) {
        console.error('Erreur chargement machines:', err);
        Utils.showToast('Erreur lors du chargement', 'error');
      });
    },

    createMachineCard: function(machine) {
      var card = document.createElement('div');
      card.className = 'card';
      card.setAttribute('data-id', machine.id);

      // Style spécial pour entrées système
      if (machine.system) {
        card.style.borderLeft = machine.id === 'absent'
          ? '4px solid #e74c3c'
          : '4px solid #f39c12';
        card.style.opacity = '0.92';
      }

      var content = document.createElement('div');
      content.style.display = 'flex';
      content.style.justifyContent = 'space-between';
      content.style.alignItems = 'center';

      // Checkbox partage (masquée pour les entrées système)
      if (!machine.system) {
        var checkWrapper = document.createElement('label');
        checkWrapper.className = 'share-checkbox-wrapper';
        checkWrapper.title = 'Inclure dans le partage';

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'share-checkbox';
        checkbox.setAttribute('data-machine-id', machine.id);
        checkbox.setAttribute('data-machine-nom', machine.nom);

        var saved = MachinesModule.getShareSelection();
        if (saved.indexOf(String(machine.id)) !== -1) {
          checkbox.checked = true;
        }
        checkbox.addEventListener('change', function() {
          MachinesModule.saveShareSelection();
        });

        checkWrapper.appendChild(checkbox);
        content.appendChild(checkWrapper);
      } else {
        // Spacer pour alignement
        var spacer = document.createElement('div');
        spacer.style.width = '28px';
        content.appendChild(spacer);
      }

      // Icône + nom
      var nomWrapper = document.createElement('div');
      nomWrapper.style.flex = '1';
      nomWrapper.style.marginLeft = '10px';
      nomWrapper.style.display = 'flex';
      nomWrapper.style.alignItems = 'center';
      nomWrapper.style.gap = '8px';

      var nom = document.createElement('span');
      nom.style.fontSize = '17px';
      nom.style.fontWeight = '600';
      nom.textContent = machine.nom;
      nomWrapper.appendChild(nom);

      if (machine.system) {
        var badge = document.createElement('span');
        badge.style.cssText = [
          'font-size:11px',
          'font-weight:600',
          'padding:2px 8px',
          'border-radius:20px',
          'color:#fff',
          'background:' + (machine.id === 'absent' ? '#e74c3c' : '#f39c12')
        ].join(';');
        badge.textContent = machine.id === 'absent' ? 'Absence injustifiée' : 'Absence justifiée';
        nomWrapper.appendChild(badge);

        var desc = document.createElement('span');
        desc.style.cssText = 'font-size:12px;color:var(--text-secondary);';
        desc.textContent = '— système';
        nomWrapper.appendChild(desc);
      }

      content.appendChild(nomWrapper);

      // Boutons d'action (masqués pour entrées système)
      if (!machine.system) {
        var actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '8px';

        var btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'btn-icon';
        btnEdit.textContent = '✏️';
        btnEdit.title = 'Modifier';
        btnEdit.addEventListener('click', function() {
          MachinesModule.editMachine(machine);
        });
        actions.appendChild(btnEdit);

        var btnDelete = document.createElement('button');
        btnDelete.type = 'button';
        btnDelete.className = 'btn-icon';
        btnDelete.textContent = '🗑️';
        btnDelete.title = 'Supprimer';
        btnDelete.addEventListener('click', function() {
          MachinesModule.deleteMachine(machine);
        });
        actions.appendChild(btnDelete);

        content.appendChild(actions);
      } else {
        // Icône cadenas pour indiquer non modifiable
        var lock = document.createElement('span');
        lock.style.cssText = 'font-size:18px;opacity:0.4;padding:0 8px;';
        lock.textContent = '🔒';
        lock.title = 'Entrée système — non modifiable';
        content.appendChild(lock);
      }

      card.appendChild(content);
      return card;
    },

    saveShareSelection: function() {
      var checkboxes = document.querySelectorAll('.share-checkbox:checked');
      var ids = [];
      checkboxes.forEach(function(cb) {
        ids.push(cb.getAttribute('data-machine-id'));
      });
      localStorage.setItem('shareSelection', JSON.stringify(ids));
    },

    getShareSelection: function() {
      try {
        return JSON.parse(localStorage.getItem('shareSelection')) || [];
      } catch(e) {
        return [];
      }
    },

    getSelectedMachines: function() {
      var checkboxes = document.querySelectorAll('.share-checkbox:checked');
      var result = [];
      checkboxes.forEach(function(cb) {
        result.push({
          id: cb.getAttribute('data-machine-id'),
          nom: cb.getAttribute('data-machine-nom')
        });
      });
      return result;
    },

    addMachine: function() {
      Utils.openModal(
        '<div class="field-group"><label>Nom du matériel</label><input type="text" id="modal-machine-nom" placeholder="Ex: Tronçonneuse"></div>',
        function() {
          var input = document.getElementById('modal-machine-nom');
          var nom = input.value.trim();
          if (!nom) {
            Utils.showToast('Veuillez entrer un nom', 'warning');
            return;
          }
          // Empêcher de créer une machine avec le nom réservé
          if (nom.toLowerCase() === 'absent' || nom.toLowerCase() === 'congé' || nom.toLowerCase() === 'conge') {
            Utils.showToast('"' + nom + '" est un nom réservé au système', 'warning');
            return;
          }
          Utils.closeModal();
          DB.addMachine(nom).then(function() {
            Utils.showToast('Matériel ajouté', 'success');
            MachinesModule.refresh();
          }).catch(function() {
            Utils.showToast('Erreur lors de l\'ajout', 'error');
          });
        },
        null, 'Ajouter', 'Annuler'
      );
      setTimeout(function() {
        var input = document.getElementById('modal-machine-nom');
        if (input) input.focus();
      }, 100);
    },

    editMachine: function(machine) {
      if (machine.system) {
        Utils.showToast('Cette entrée est non modifiable', 'warning');
        return;
      }
      Utils.openModal(
        '<div class="field-group"><label>Nouveau nom du matériel</label><input type="text" id="modal-machine-nom" value="' + escapeHtml(machine.nom) + '"></div>',
        function() {
          var input = document.getElementById('modal-machine-nom');
          var nom = input.value.trim();
          if (!nom) {
            Utils.showToast('Veuillez entrer un nom', 'warning');
            return;
          }
          if (nom.toLowerCase() === 'absent' || nom.toLowerCase() === 'congé' || nom.toLowerCase() === 'conge') {
            Utils.showToast('"' + nom + '" est un nom réservé au système', 'warning');
            return;
          }
          Utils.closeModal();
          DB.updateMachine(machine.id, nom).then(function() {
            Utils.showToast('Matériel mis à jour', 'success');
            MachinesModule.refresh();
          }).catch(function() {
            Utils.showToast('Erreur lors de la mise à jour', 'error');
          });
        },
        null, 'Enregistrer', 'Annuler'
      );
      setTimeout(function() {
        var input = document.getElementById('modal-machine-nom');
        if (input) {
          input.focus();
          input.setSelectionRange(0, input.value.length);
        }
      }, 100);
    },

    deleteMachine: function(machine) {
      if (machine.system) {
        Utils.showToast('Cette entrée est non supprimable', 'warning');
        return;
      }
      Utils.openModal(
        '<p>Êtes-vous sûr de vouloir supprimer "<strong>' + escapeHtml(machine.nom) + '</strong>" ?</p>' +
        '<p style="font-size:13px;color:var(--text-secondary);margin-top:8px;">Le matériel sera marqué comme inactif (réversible).</p>',
        function() {
          Utils.closeModal();
          DB.deleteMachine(machine.id).then(function() {
            Utils.showToast('Matériel supprimé', 'success');
            MachinesModule.refresh();
          }).catch(function() {
            Utils.showToast('Erreur lors de la suppression', 'error');
          });
        },
        null, 'Supprimer', 'Annuler'
      );
    }
  };

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
