// ============================================================
// sync-fusion.js — Logique de fusion des données Su-Ma-Tra
// Adapté à la structure réelle de db.js
// ============================================================

const SyncFusion = (() => {
  'use strict';

  // ----------------------------------------------------------
  // CONSTANTES
  // ----------------------------------------------------------
  const JOURNEE_COMPLETE = 7 * 60; // 7h en minutes

  // ----------------------------------------------------------
  // POINT D'ENTRÉE PRINCIPAL
  // donneesLocales et donneesDistantes ont la forme :
  // {
  //   travailleurs: [...],
  //   machines: [...],
  //   journal: [...]
  // }
  // Retourne l'objet fusionné prêt à être écrit en DB
  // ----------------------------------------------------------
  async function fusionnerTout(donneesLocales, donneesDistantes) {
    console.log('[SyncFusion] Début de la fusion...');

    const resultat = {
      travailleurs: fusionnerTravailleurs(
        donneesLocales.travailleurs  || [],
        donneesDistantes.travailleurs || []
      ),
      machines: fusionnerMachines(
        donneesLocales.machines  || [],
        donneesDistantes.machines || []
      ),
      journal: fusionnerJournal(
        donneesLocales.journal  || [],
        donneesDistantes.journal || []
      )
    };

    console.log('[SyncFusion] Fusion terminée.', {
      travailleurs: resultat.travailleurs.length,
      machines:     resultat.machines.length,
      journal:      resultat.journal.length
    });

    return resultat;
  }

  // ----------------------------------------------------------
  // FUSION TRAVAILLEURS
  // Clé unique : uuid
  // Pas de champ updatedAt → on garde celui qui est actif,
  // sinon on préfère le distant (il a peut-être réactivé)
  // ----------------------------------------------------------
  function fusionnerTravailleurs(locaux, distants) {
    const map = new Map();

    // Charger les locaux
    for (const t of locaux) {
      map.set(t.uuid, t);
    }

    // Merger les distants
    for (const tDistant of distants) {
      const tLocal = map.get(tDistant.uuid);

      if (!tLocal) {
        // Absent en local → on ajoute
        map.set(tDistant.uuid, tDistant);
      } else {
        // Présent des deux côtés
        // Règle : si l'un est actif et l'autre non → on garde l'actif
        // Si les deux actifs ou les deux inactifs → on garde le local
        if (tDistant.actif === true && tLocal.actif === false) {
          map.set(tDistant.uuid, tDistant);
        }
        // sinon on garde le local, rien à faire
      }
    }

    return Array.from(map.values());
  }

  // ----------------------------------------------------------
  // FUSION MACHINES
  // Clé unique : nom (normalisé en minuscule)
  // car l'id est autoIncrement et sera différent sur chaque appareil
  // ----------------------------------------------------------
  function fusionnerMachines(locales, distantes) {
    // On indexe par nom normalisé
    const map = new Map();

    for (const m of locales) {
      map.set(normaliserNom(m.nom), m);
    }

    for (const mDistante of distantes) {
      const cle = normaliserNom(mDistante.nom);
      const mLocale = map.get(cle);

      if (!mLocale) {
        // Machine inconnue en local → on l'ajoute
        // On retire l'id car il sera réattribué par autoIncrement à l'écriture
        const mSansId = Object.assign({}, mDistante);
        delete mSansId.id;
        map.set(cle, mSansId);
      } else {
        // Même nom : si l'une est active et l'autre non → on garde l'active
        if (mDistante.actif === true && mLocale.actif === false) {
          // On garde l'id local pour ne pas casser les références potentielles
          const mFusionnee = Object.assign({}, mDistante, { id: mLocale.id });
          map.set(cle, mFusionnee);
        }
        // sinon on garde le local
      }
    }

    return Array.from(map.values());
  }

  // ----------------------------------------------------------
  // FUSION JOURNAL
  // Étape 1 : grouper par (uuid_travailleur + date)
  // Étape 2 : pour chaque groupe, appliquer les règles de conflit
  // ----------------------------------------------------------
  function fusionnerJournal(journalLocal, journalDistant) {

    const groupesLocaux   = grouperParTravailleurJour(journalLocal);
    const groupesDistants = grouperParTravailleurJour(journalDistant);

    const toutesLesCles = new Set([
      ...Object.keys(groupesLocaux),
      ...Object.keys(groupesDistants)
    ]);

    const journalFinal = [];

    for (const cle of toutesLesCles) {
      const groupeLocal   = groupesLocaux[cle]   || [];
      const groupeDistant = groupesDistants[cle] || [];

      let vainqueur;

      if (groupeLocal.length === 0) {
        vainqueur = groupeDistant;
      } else if (groupeDistant.length === 0) {
        vainqueur = groupeLocal;
      } else {
        vainqueur = resoudreConflit(groupeLocal, groupeDistant);
      }

      // On nettoie les id pour éviter les conflits à l'écriture
      // (ils seront réattribués par autoIncrement)
      for (const entree of vainqueur) {
        const entreeSansId = Object.assign({}, entree);
        delete entreeSansId.id;
        journalFinal.push(entreeSansId);
      }
    }

    return journalFinal;
  }

  // ----------------------------------------------------------
  // GROUPER PAR (uuid_travailleur + date)
  // ----------------------------------------------------------
  function grouperParTravailleurJour(journal) {
    const groupes = {};

    for (const entree of journal) {
      const date = normaliserDate(entree.date);
      const cle  = `${entree.uuid_travailleur}_${date}`;

      if (!groupes[cle]) groupes[cle] = [];
      groupes[cle].push(entree);
    }

    return groupes;
  }

  // ----------------------------------------------------------
  // RÉSOUDRE UN CONFLIT
  //
  // Règle 1 : total >= 7h (JOURNEE_COMPLETE)
  // Règle 2 : plus d'entrées distinctes (machine_nom différents)
  // Condition ET : les deux doivent être vraies pour gagner
  // Fallback : le groupe avec le plus grand total de minutes
  // ----------------------------------------------------------
  function resoudreConflit(groupeLocal, groupeDistant) {
    const totalLocal   = calculerTotalMinutes(groupeLocal);
    const totalDistant = calculerTotalMinutes(groupeDistant);

    const localComplet   = totalLocal   >= JOURNEE_COMPLETE;
    const distantComplet = totalDistant >= JOURNEE_COMPLETE;

    // Compter les machines/tâches distinctes
    const machinesLocales   = compterMachinesDistinctes(groupeLocal);
    const machinesDistantes = compterMachinesDistinctes(groupeDistant);

    const localPlusDetail   = machinesLocales   > machinesDistantes;
    const distantPlusDetail = machinesDistantes > machinesLocales;

    // -- Cas 1 : Seul le local satisfait les deux règles (ET)
    if (localComplet && localPlusDetail) {
      console.log('[SyncFusion] Conflit → LOCAL gagne (complet + plus détaillé)');
      return groupeLocal;
    }

    // -- Cas 2 : Seul le distant satisfait les deux règles (ET)
    if (distantComplet && distantPlusDetail) {
      console.log('[SyncFusion] Conflit → DISTANT gagne (complet + plus détaillé)');
      return groupeDistant;
    }

    // -- Cas 3 : Les deux sont complets
    if (localComplet && distantComplet) {
      if (distantPlusDetail) {
        console.log('[SyncFusion] Conflit → DISTANT gagne (les deux complets, distant plus détaillé)');
        return groupeDistant;
      }
      // Local plus détaillé ou égalité → local
      console.log('[SyncFusion] Conflit → LOCAL gagne (les deux complets, local plus détaillé ou égalité)');
      return groupeLocal;
    }

    // -- Fallback : aucun ne satisfait les deux règles
    // → celui avec le total de minutes le plus élevé
    if (totalDistant > totalLocal) {
      console.log(`[SyncFusion] Fallback → DISTANT gagne (${totalDistant}min > ${totalLocal}min)`);
      return groupeDistant;
    }

    console.log(`[SyncFusion] Fallback → LOCAL gagne (${totalLocal}min >= ${totalDistant}min)`);
    return groupeLocal;
  }

  // ----------------------------------------------------------
  // CALCULER LE TOTAL EN MINUTES d'un groupe
  // Champ réel dans db.js : duree_minutes
  // ----------------------------------------------------------
  function calculerTotalMinutes(groupe) {
    return groupe.reduce(function(acc, entree) {
      return acc + (entree.duree_minutes || 0);
    }, 0);
  }

  // ----------------------------------------------------------
  // COMPTER LES MACHINES DISTINCTES dans un groupe
  // ----------------------------------------------------------
  function compterMachinesDistinctes(groupe) {
    const noms = new Set();
    for (const entree of groupe) {
      if (entree.machine_nom) noms.add(entree.machine_nom.toLowerCase());
    }
    return noms.size;
  }

  // ----------------------------------------------------------
  // NORMALISER UNE DATE → YYYY-MM-DD
  // ----------------------------------------------------------
  function normaliserDate(date) {
    if (!date) return '0000-00-00';
    // Si c'est déjà au bon format (string YYYY-MM-DD) on retourne directement
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date).substring(0, 10);
    return d.toISOString().substring(0, 10);
  }

  // ----------------------------------------------------------
  // NORMALISER UN NOM de machine (trim + lowercase)
  // ----------------------------------------------------------
  function normaliserNom(nom) {
    return (nom || '').trim().toLowerCase();
  }

  // ----------------------------------------------------------
  // ÉCRIRE LE RÉSULTAT FUSIONNÉ DANS INDEXEDDB
  // Efface et réécrit travailleurs, machines, journal
  // ----------------------------------------------------------
  async function appliquerFusion(donneesFusionnees) {
    console.log('[SyncFusion] Application de la fusion en DB...');

    try {
      // --- Travailleurs ---
      await DB.clearAllTravailleurs();
      for (const t of donneesFusionnees.travailleurs) {
        await DB.addTravailleur(t);
      }
      console.log(`[SyncFusion] ${donneesFusionnees.travailleurs.length} travailleurs écrits`);

      // --- Machines ---
      await DB.clearAllMachines();
      for (const m of donneesFusionnees.machines) {
        await DB.addMachine(m);
      }
      console.log(`[SyncFusion] ${donneesFusionnees.machines.length} machines écrites`);

      // --- Journal ---
      // Pour le journal on ne clear pas : on utilise mergeJournalEntries
      // qui gère les doublons sur (uuid_travailleur + date + machine_nom + duree_minutes)
      // MAIS après fusion les données vainqueur remplacent les données perdantes
      // → on doit donc vider et réécrire proprement
      await viderJournal();
      for (const entree of donneesFusionnees.journal) {
        await DB.addJournalEntry(entree);
      }
      console.log(`[SyncFusion] ${donneesFusionnees.journal.length} entrées journal écrites`);

      console.log('[SyncFusion] Application terminée ✅');
      return true;

    } catch (err) {
      console.error('[SyncFusion] Erreur lors de l\'application de la fusion:', err);
      throw err;
    }
  }

  // ----------------------------------------------------------
  // VIDER LE JOURNAL COMPLET
  // (pas exposé dans DB, on le fait directement)
  // ----------------------------------------------------------
  function viderJournal() {
    return new Promise(function(resolve, reject) {
      // On passe par getAllJournalEntries + deleteJournalEntry serait trop lent
      // On accède directement à indexedDB via une transaction clear
      const request = indexedDB.open('SuMatTra_DB', 1);
      request.onsuccess = function(event) {
        const database = event.target.result;
        const transaction = database.transaction(['journal'], 'readwrite');
        const store = transaction.objectStore('journal');
        const clearRequest = store.clear();
        clearRequest.onsuccess = function() { resolve(); };
        clearRequest.onerror   = function() { reject(clearRequest.error); };
      };
      request.onerror = function() { reject(request.error); };
    });
  }

  // ----------------------------------------------------------
  // COLLECTER TOUTES LES DONNÉES LOCALES
  // Pratique pour préparer l'envoi vers l'appareil distant
  // ----------------------------------------------------------
  async function collecterDonneesLocales() {
    const [travailleurs, machines, journal] = await Promise.all([
      DB.getAllTravailleursIncludingInactive(),
      DB.getAllMachines(),
      DB.getAllJournalEntries()
    ]);

    // On filtre les machines système (absent, conge) qui ne sont pas en DB
    const machinesSansSystem = machines.filter(function(m) {
      return m.id !== 'absent' && m.id !== 'conge';
    });

    return {
      travailleurs,
      machines: machinesSansSystem,
      journal
    };
  }

  // ----------------------------------------------------------
  // API PUBLIQUE
  // ----------------------------------------------------------
  return {
    fusionnerTout,
    appliquerFusion,
    collecterDonneesLocales
  };

})();
