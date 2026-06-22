/**
 * service-worker.js - Service Worker pour Su-Mat-Tra
 * Stratégie: Cache First pour les assets locaux
 */

const CACHE_NAME = 'sumattra-v1';
const ASSETS_TO_CACHE = [
  './index.html',
  './css/style.css',
  './js/utils.js',
  './js/db.js',
  './js/app.js',
  './js/quotidien.js',
  './js/calendrier.js',
  './js/machines.js',
  './js/travailleurs.js',
  './js/parametres.js',
  './js/excel.js',
  './js/import.js',
  './js/graphiques.js',
  './manifest.json'
];

// Les libs (exceljs, chart.js) sont trop lourdes, on ne les met pas en cache automatique
// Elles seront chargées depuis le réseau

/**
 * Installation du Service Worker
 */
self.addEventListener('install', function(event) {
  console.log('[SW] Installation...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Mise en cache des assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(function() {
      console.log('[SW] Assets mis en cache');
      return self.skipWaiting();
    }).catch(function(err) {
      console.error('[SW] Erreur mise en cache:', err);
    })
  );
});

/**
 * Activation du Service Worker
 */
self.addEventListener('activate', function(event) {
  console.log('[SW] Activation...');
  
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          // Supprimer les anciens caches
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      console.log('[SW] Prêt');
      return self.clients.claim();
    })
  );
});

/**
 * Interception des requêtes
 */
self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = new URL(request.url);
  
  // Ignorer les requêtes qui ne sont pas locales
  if (url.origin !== location.origin) {
    return;
  }
  
  // Stratégie: Cache First pour les assets locaux
  event.respondWith(
    caches.match(request).then(function(response) {
      if (response) {
        // Retourner depuis le cache
        return response;
      }
      
      // Sinon, aller chercher sur le réseau
      return fetch(request).then(function(networkResponse) {
        // Mettre en cache les nouvelles réponses (seulement pour les assets)
        if (networkResponse && networkResponse.status === 200) {
          var responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      }).catch(function(err) {
        console.error('[SW] Erreur réseau:', err);
        
        // Si offline et demandé une page HTML, retourner la page d'accueil
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        
        return new Response('Offline', { status: 503, statusText: 'Service unavailable' });
      });
    })
  );
});

/**
 * Message du client
 */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});