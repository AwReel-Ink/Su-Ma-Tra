/**
 * keyboard.js - Raccourcis clavier pour Su-Mat-Tra
 */

(function() {
  'use strict';

  window.KeyboardManager = {

    init: function() {
      document.addEventListener('keydown', function(e) {
        // --- Echap : fermer la modale ---
        if (e.key === 'Escape') {
          var modal = document.getElementById('modal-container');
          if (modal && modal.innerHTML !== '') {
            var btnCancel = modal.querySelector('#modal-cancel');
            if (btnCancel) {
              btnCancel.click();
            } else {
              Utils.closeModal();
            }
            e.preventDefault();
            return;
          }
        }

        // --- Enter dans une modale : navigation entre champs ou validation ---
        if (e.key === 'Enter') {
          var modal = document.getElementById('modal-container');
          if (modal && modal.innerHTML !== '') {
            KeyboardManager.handleModalEnter(e, modal);
            return;
          }
        }

        // --- Alt + Flèches : navigation de date dans Quotidien ---
        if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          var activeTab = document.querySelector('.tab-content.active');
          if (activeTab && activeTab.id === 'tab-quotidien') {
            e.preventDefault();
            if (e.key === 'ArrowLeft') {
              var btnPrev = document.getElementById('btn-date-prev');
              if (btnPrev) btnPrev.click();
            } else {
              var btnNext = document.getElementById('btn-date-next');
              if (btnNext && !btnNext.disabled) btnNext.click();
            }
          }
          return;
        }
      });
    },

    /**
     * Gère la touche Enter à l'intérieur d'une modale :
     * - Si on est dans un champ de saisie : passe au champ suivant
     * - Si on est sur le dernier champ ou ailleurs : clique sur Confirmer
     */
    handleModalEnter: function(e, modal) {
      var focusable = Array.from(
        modal.querySelectorAll('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
      ).filter(function(el) {
        return el.offsetParent !== null; // visible uniquement
      });

      var active = document.activeElement;
      var currentIndex = focusable.indexOf(active);

      // Si on est dans un champ et qu'il y en a un suivant → focus suivant
      if (currentIndex !== -1 && currentIndex < focusable.length - 1) {
        e.preventDefault();
        focusable[currentIndex + 1].focus();
        return;
      }

      // Sinon → valider (clic sur bouton Confirmer)
      var btnConfirm = modal.querySelector('#modal-confirm');
      if (btnConfirm) {
        e.preventDefault();
        btnConfirm.click();
      }
    }

  };

})();
