/**
 * graphiques.js - Module de graphiques (utilise Chart.js)
 */

(function() {
  'use strict';

  window.GraphiquesModule = {
    /**
     * Crée un graphique camembert (doughnut)
     * @param {HTMLElement} container - Conteneur
     * @param {Object} data - Données {labels: [], values: []}
     * @param {Object} options - Options supplémentaires
     */
    createPieChart: function(container, data, options) {
      if (typeof Chart === 'undefined') {
        container.innerHTML = '<p class="text-muted">Chart.js non chargé</p>';
        return null;
      }

      var canvas = document.createElement('canvas');
      container.appendChild(canvas);

      var defaultColors = [
        '#2e7d32', '#1976d2', '#7b1fa2', '#c62828', '#f57f17',
        '#00838f', '#558b2f', '#9c27b0', '#455a64', '#ef6c00'
      ];

      var config = {
        type: 'doughnut',
        data: {
          labels: data.labels,
          datasets: [{
            data: data.values,
            backgroundColor: defaultColors.slice(0, data.labels.length),
            borderWidth: 2,
            borderColor: 'var(--bg-card)'
          }]
        },
        options: Object.assign({
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                padding: 15,
                usePointStyle: true,
                font: { size: 13 }
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  var label = context.label || '';
                  var value = context.parsed || 0;
                  var total = context.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                  var pct = ((value / total) * 100).toFixed(1);
                  return label + ': ' + Utils.formatDuree(value) + ' (' + pct + '%)';
                }
              }
            }
          }
        }, options)
      };

      return new Chart(canvas, config);
    },

    /**
     * Crée un graphique à barres
     * @param {HTMLElement} container - Conteneur
     * @param {Object} data - Données {labels: [], values: []}
     * @param {Object} options - Options supplémentaires
     */
    createBarChart: function(container, data, options) {
      if (typeof Chart === 'undefined') {
        container.innerHTML = '<p class="text-muted">Chart.js non chargé</p>';
        return null;
      }

      var canvas = document.createElement('canvas');
      container.appendChild(canvas);

      var config = {
        type: 'bar',
        data: {
          labels: data.labels,
          datasets: [{
            label: 'Temps (minutes)',
            data: data.values,
            backgroundColor: 'var(--accent)',
            borderRadius: 4
          }]
        },
        options: Object.assign({
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  return Utils.formatDuree(value);
                }
              }
            }
          }
        }, options)
      };

      return new Chart(canvas, config);
    },

    /**
     * Crée un graphique linéaire
     * @param {HTMLElement} container - Conteneur
     * @param {Object} data - Données {labels: [], values: []}
     * @param {Object} options - Options supplémentaires
     */
    createLineChart: function(container, data, options) {
      if (typeof Chart === 'undefined') {
        container.innerHTML = '<p class="text-muted">Chart.js non chargé</p>';
        return null;
      }

      var canvas = document.createElement('canvas');
      container.appendChild(canvas);

      var config = {
        type: 'line',
        data: {
          labels: data.labels,
          datasets: [{
            label: 'Temps (minutes)',
            data: data.values,
            borderColor: 'var(--accent)',
            backgroundColor: 'rgba(46, 125, 50, 0.1)',
            fill: true,
            tension: 0.3
          }]
        },
        options: Object.assign({
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  return Utils.formatDuree(value);
                }
              }
            }
          }
        }, options)
      };

      return new Chart(canvas, config);
    },

    /**
     * Prépare les données pour un graphique à partir du journal
     * @param {Array} entries - Entrées du journal
     * @param {string} groupBy - 'machine' ou 'date' ou 'month'
     * @returns {Object} {labels: [], values: []}
     */
    prepareChartData: function(entries, groupBy) {
      var grouped = {};

      entries.forEach(function(e) {
        var key;
        
        switch(groupBy) {
          case 'machine':
            key = e.machine_nom || 'Inconnu';
            break;
          case 'date':
            key = e.date;
            break;
          case 'month':
            key = e.date.substring(0, 7); // YYYY-MM
            break;
          default:
            key = 'Total';
        }

        grouped[key] = (grouped[key] || 0) + (e.duree_minutes || 0);
      });

      // Trier par valeur décroissante
      var sorted = Object.keys(grouped).sort(function(a, b) {
        return grouped[b] - grouped[a];
      });

      return {
        labels: sorted,
        values: sorted.map(function(k) { return grouped[k]; })
      };
    },

    /**
     * Affiche un graphique dans un conteneur
     * @param {string} type - Type de graphique: 'pie', 'bar', 'line'
     * @param {HTMLElement} container - Conteneur
     * @param {Array} entries - Entrées du journal
     * @param {string} groupBy - Regroupement: 'machine', 'date', 'month'
     * @param {Object} options - Options supplémentaires
     */
    render: function(type, container, entries, groupBy, options) {
      container.innerHTML = '';
      
      var data = GraphiquesModule.prepareChartData(entries, groupBy);
      
      if (data.labels.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Aucune donnée à afficher</p></div>';
        return;
      }

      switch(type) {
        case 'pie':
          GraphiquesModule.createPieChart(container, data, options);
          break;
        case 'bar':
          GraphiquesModule.createBarChart(container, data, options);
          break;
        case 'line':
          GraphiquesModule.createLineChart(container, data, options);
          break;
        default:
          GraphiquesModule.createPieChart(container, data, options);
      }
    },

    /**
     * Détruit un graphique
     * @param {Chart} chart - Instance du graphique
     */
    destroy: function(chart) {
      if (chart) {
        chart.destroy();
      }
    }
  };

})();