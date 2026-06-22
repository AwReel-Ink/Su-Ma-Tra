/**
 * app.js - Point d'entrée principal Su-Mat-Tra
 */

(function() {
  'use strict';

  // Variable globale pour l'onglet actif
  window.App = {
    currentTab: 'quotidien',
    currentDate: Utils.todayISO(),
    currentAtelier: '',
    
    /**
     * Initialise l'application
     */
    init: function() {
      console.log('Initialisation Su-Mat-Tra...');
      
      // 1. Initialiser la DB
      DB.init().then(function() {
        console.log('DB initialisée');
        
        // 2. Charger le thème
        return DB.getConfig('theme');
      }).then(function(theme) {
        theme = theme || 'light';
        App.applyTheme(theme);
        
        // 3. Charger le dernier atelier
        return DB.getConfig('last_atelier');
      }).then(function(atelier) {
        App.currentAtelier = atelier || '';
        
        // 4. Initialiser la navigation
        App.initNavigation();
        
        // 5. Initialiser les modules si disponibles
        App.initModules();
        
        // 6. Initialiser les raccourcis clavier
        KeyboardManager.init();

        // 7. Activer l'onglet par défaut
        App.showTab('quotidien');
        
        console.log('Su-Mat-Tra prêt !');
      }).catch(function(err) {
        console.error('Erreur initialisation:', err);
        Utils.showToast('Erreur lors de l\'initialisation', 'error');
      });
    },

    /**
     * Initialise la navigation entre onglets
     */
    initNavigation: function() {
      var navItems = document.querySelectorAll('.nav-item');
      
      navItems.forEach(function(item) {
        item.addEventListener('click', function() {
          var tab = item.getAttribute('data-tab');
          App.showTab(tab);
        });
      });
    },

    /**
     * Affiche un onglet
     * @param {string} tabName - Nom de l'onglet
     */
    showTab: function(tabName) {
      // Mettre à jour la navigation
      var navItems = document.querySelectorAll('.nav-item');
      navItems.forEach(function(item) {
        if (item.getAttribute('data-tab') === tabName) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
      
      // Afficher/masquer les sections
      var sections = document.querySelectorAll('.tab-content');
      sections.forEach(function(section) {
        if (section.id === 'tab-' + tabName) {
          section.classList.add('active');
        } else {
          section.classList.remove('active');
        }
      });
      
      App.currentTab = tabName;
      
      // Rafraîchir le contenu de l'onglet si besoin
      App.refreshTab(tabName);
    },

    /**
     * Rafraîchit le contenu d'un onglet
     * @param {string} tabName - Nom de l'onglet
     */
    refreshTab: function(tabName) {
      switch(tabName) {
        case 'quotidien':
          if (typeof QuotidienModule !== 'undefined') {
            QuotidienModule.refresh();
          }
          break;
        case 'calendrier':
          if (typeof CalendrierModule !== 'undefined') {
            CalendrierModule.refresh();
          }
          break;
        case 'machines':
          if (typeof MachinesModule !== 'undefined') {
            MachinesModule.refresh();
          }
          break;
        case 'travailleurs':
          if (typeof TravailleursModule !== 'undefined') {
            TravailleursModule.refresh();
          }
          break;
        case 'parametres':
          if (typeof ParametresModule !== 'undefined') {
            ParametresModule.refresh();
          }
          break;
      }
    },

    /**
     * Initialise les modules optionnels
     */
    initModules: function() {
      // Chaque module a une fonction init() qui est appelée si elle existe
      if (typeof QuotidienModule !== 'undefined' && QuotidienModule.init) {
        QuotidienModule.init();
      }
      if (typeof CalendrierModule !== 'undefined' && CalendrierModule.init) {
        CalendrierModule.init();
      }
      if (typeof MachinesModule !== 'undefined' && MachinesModule.init) {
        MachinesModule.init();
      }
      if (typeof TravailleursModule !== 'undefined' && TravailleursModule.init) {
        TravailleursModule.init();
      }
      if (typeof ParametresModule !== 'undefined' && ParametresModule.init) {
        ParametresModule.init();
      }
    },

    /**
     * Bascule le thème clair/sombre
     */
    toggleTheme: function() {
      var current = document.documentElement.getAttribute('data-theme');
      var newTheme = current === 'dark' ? 'light' : 'dark';
      App.applyTheme(newTheme);
      DB.setConfig('theme', newTheme);
    },

    /**
     * Applique un thème
     * @param {string} theme - 'light' ou 'dark'
     */
    applyTheme: function(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      Utils.saveTheme(theme);
      
      // Mettre à jour le bouton
      var btn = document.getElementById('btn-theme');
      if (btn) {
        btn.textContent = theme === 'dark' ? '☀️ Mode clair' : '🌙 Mode sombre';
      }
    },

    /**
     * Définit l'atelier courant
     * @param {string} atelier - Nom de l'atelier
     */
    setCurrentAtelier: function(atelier) {
      App.currentAtelier = atelier;
      DB.setConfig('last_atelier', atelier);
    },

    /**
     * Retourne l'atelier courant
     * @returns {string}
     */
    getCurrentAtelier: function() {
      return App.currentAtelier;
    },

    /**
     * Définit la date courante
     * @param {string} dateISO - Date au format YYYY-MM-DD
     */
    setCurrentDate: function(dateISO) {
      App.currentDate = dateISO;
      DB.setConfig('last_date', dateISO);
      
      // Mettre à jour le bouton
      var btn = document.getElementById('btn-date-nav');
      if (btn) {
        btn.textContent = Utils.formatDate(dateISO);
      }
    },

    /**
     * Retourne la date courante
     * @returns {string}
     */
    getCurrentDate: function() {
      return App.currentDate;
    }
  };

  // Démarrer l'application au chargement du DOM
  document.addEventListener('DOMContentLoaded', function() {
    App.init();
  });

})();