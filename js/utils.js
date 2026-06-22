/**
 * Utils.js - Fonctions utilitaires pour Su-Mat-Tra
 */

(function() {
  'use strict';

  window.Utils = {
    /**
     * Génère un UUID v4
     * @returns {string} UUID unique
     */
    generateUUID: function() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    },

    /**
     * Formate une date en français (ex: "Lundi 14 juin 2026")
     * @param {string} dateStr - Date au format YYYY-MM-DD
     * @returns {string} Date formatée
     */
    formatDate: function(dateStr) {
      if (!dateStr) return '';
      var date = new Date(dateStr + 'T12:00:00');
      var jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
      var mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
      return jours[date.getDay()] + ' ' + date.getDate() + ' ' + mois[date.getMonth()] + ' ' + date.getFullYear();
    },

    /**
     * Formate une date en format court (ex: "14/06/2026")
     * @param {string} dateStr - Date au format YYYY-MM-DD
     * @returns {string} Date formatée
     */
    formatDateShort: function(dateStr) {
      if (!dateStr) return '';
      var date = new Date(dateStr + 'T12:00:00');
      var day = String(date.getDate()).padStart(2, '0');
      var month = String(date.getMonth() + 1).padStart(2, '0');
      return day + '/' + month + '/' + date.getFullYear();
    },

    /**
     * Formate une durée en minutes vers un format lisible
     * @param {number} minutes - Durée en minutes
     * @returns {string} Durée formatée (ex: "1h30" ou "30min")
     */
    formatDuree: function(minutes) {
      if (!minutes || minutes === 0) return '0min';
      if (minutes < 60) {
        return minutes + 'min';
      }
      var h = Math.floor(minutes / 60);
      var m = minutes % 60;
      if (m === 0) {
        return h + 'h';
      }
      return h + 'h' + m;
    },

    /**
     * Parse une chaîne de durée vers des minutes
     * @param {string} str - Chaîne (ex: "1h30", "90min", "1.5h")
     * @returns {number} Durée en minutes
     */
    parseDuree: function(str) {
      if (!str || typeof str === 'number') return str || 0;
      str = String(str).toLowerCase().trim();
      
      // Format: 1h30 ou 1h
      if (str.includes('h')) {
        var parts = str.split('h');
        var heures = parseInt(parts[0]) || 0;
        var minutes = parseInt(parts[1]) || 0;
        return heures * 60 + minutes;
      }
      
      // Format: 90min
      if (str.includes('min')) {
        return parseInt(str.replace('min', '')) || 0;
      }
      
      // Format décimal: 1.5
      if (str.includes('.')) {
        return Math.round(parseFloat(str) * 60);
      }
      
      // Nombre seul (supposé en minutes)
      return parseInt(str) || 0;
    },

    /**
     * Retourne la date du jour au format ISO (YYYY-MM-DD)
     * @returns {string} Date du jour
     */
    todayISO: function() {
      var d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    /**
     * Ajoute n jours à une date ISO
     * @param {string} dateISO - Date au format YYYY-MM-DD
     * @param {number} n - Nombre de jours à ajouter
     * @returns {string} Nouvelle date ISO
     */
    addDays: function(dateISO, n) {
      var d = new Date(dateISO + 'T12:00:00');
      d.setDate(d.getDate() + n);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    /**
     * Retourne les 7 dates de la semaine contenant la date donnée
     * @param {string} dateISO - Date au format YYYY-MM-DD
     * @returns {Array} Tableau de 7 dates ISO
     */
    getWeekDates: function(dateISO) {
      var d = new Date(dateISO + 'T12:00:00');
      var jourSemaine = d.getDay();
      var diffDimanche = jourSemaine === 0 ? 0 : -jourSemaine;
      
      var dates = [];
      for (var i = 0; i < 7; i++) {
        var current = new Date(d);
        current.setDate(d.getDate() - jourSemaine + i);
        dates.push(current.getFullYear() + '-' + String(current.getMonth() + 1).padStart(2, '0') + '-' + String(current.getDate()).padStart(2, '0'));
      }
      return dates;
    },

    /**
     * Convertit des minutes en format HH:MM
     * @param {number} minutes - Durée en minutes
     * @returns {string} Format HH:MM
     */
    minutesToHHMM: function(minutes) {
      if (!minutes) return '00:00';
      var h = Math.floor(minutes / 60);
      var m = minutes % 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    },

    /**
     * Convertit un format HH:MM en minutes
     * @param {string} str - Format HH:MM
     * @returns {number} Minutes
     */
    HHMMToMinutes: function(str) {
      if (!str) return 0;
      var parts = str.split(':');
      return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
    },

    /**
     * Affiche une notification toast
     * @param {string} message - Message à afficher
     * @param {string} type - Type: 'success', 'error', 'warning'
     * @param {number} duration - Durée d'affichage en ms
     */
    showToast: function(message, type, duration) {
      type = type || 'success';
      duration = duration || 3000;
      
      var container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
      }
      
      var toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.textContent = message;
      
      container.appendChild(toast);
      
      setTimeout(function() {
        toast.remove();
      }, duration);
    },

    /**
     * Ouvre une modal générique
     * @param {string} htmlContent - Contenu HTML de la modal
     * @param {function} onConfirm - Callback confirmation
     * @param {function} onCancel - Callback annulation
     * @param {string} confirmText - Texte du bouton confirmer
     * @param {string} cancelText - Texte du bouton annuler
     */
    openModal: function(htmlContent, onConfirm, onCancel, confirmText, cancelText, noButtons) {
      var container = document.getElementById('modal-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'modal-container';
        document.body.appendChild(container);
      }

      confirmText = confirmText || 'Confirmer';
      cancelText  = cancelText  || 'Annuler';

      var actionsHtml = noButtons ? '' :
        '<div class="modal-actions">' +
          '<button class="btn-secondary" id="modal-cancel">'  + cancelText  + '</button>' +
          '<button class="btn-primary"   id="modal-confirm">' + confirmText + '</button>' +
        '</div>';

      container.innerHTML =
        '<div class="modal-overlay active">' +
          '<div class="modal-box">' +
            '<div class="modal-content">' + htmlContent + '</div>' +
            actionsHtml +
          '</div>' +
        '</div>';

      var btnConfirm = container.querySelector('#modal-confirm');
      var btnCancel  = container.querySelector('#modal-cancel');

      if (btnConfirm) {
        btnConfirm.addEventListener('click', function() {
          if (onConfirm) onConfirm();
        });
      }

      if (btnCancel) {
        btnCancel.addEventListener('click', function() {
          Utils.closeModal();
          if (onCancel) onCancel();
        });
      }
    },

    /**
     * Ferme la modal active
     */
    closeModal: function() {
      var container = document.getElementById('modal-container');
      if (container) {
        container.innerHTML = '';
      }
    },

    /**
     * Crée une fonction debounce
     * @param {function} fn - Fonction à debouncer
     * @param {number} delay - Délai en ms
     * @returns {function} Fonction debounce
     */
    debounce: function(fn, delay) {
      var timeout;
      return function() {
        var context = this;
        var args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function() {
          fn.apply(context, args);
        }, delay);
      };
    },

    /**
     * Sauvegarde le thème dans localStorage
     * @param {string} theme - 'light' ou 'dark'
     */
    saveTheme: function(theme) {
      try {
        localStorage.setItem('sumattra-theme', theme);
      } catch (e) {
        console.warn('localStorage non disponible');
      }
    },

    /**
     * Charge le thème depuis localStorage
     * @returns {string} 'light' ou 'dark'
     */
    loadTheme: function() {
      try {
        return localStorage.getItem('sumattra-theme') || 'light';
      } catch (e) {
        return 'light';
      }
    }
  };

})();