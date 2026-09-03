/**
 * Nettuno Portal - Auth & Firebase Configuration Helper
 */
'use strict';

const firebaseConfig = {
  apiKey: "AIzaSyAEVFnwSIAwvowOYXAF3ITAsFYUbkvg9PM",
  authDomain: "nettuno-e6036.firebaseapp.com",
  projectId: "nettuno-e6036",
  storageBucket: "nettuno-e6036.firebasestorage.app",
  messagingSenderId: "610650936846",
  appId: "1:610650936846:web:e4d6ece615305c4fe00e5f"
};

if (typeof firebase !== 'undefined' && firebase.apps && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth() : null;
const db = (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;
const functions = (typeof firebase !== 'undefined' && firebase.app) ? firebase.app().functions('europe-west1') : null;

// Se estiver no emulador local
if (location.hostname === 'localhost' && location.port === '5001' && functions) {
  functions.useEmulator('localhost', 5001);
}

/**
 * Protege páginas privadas: redireciona para login.html se não autenticado.
 * @param {Function} onAuthenticated Callback chamado com (user, marketplaceData)
 */
function requireAuth(onAuthenticated) {
  if (!auth) {
    // Fallback de demonstração local se Firebase SDK não puder conectar
    const demoUser = { uid: 'demo_mkt_123', email: 'dev@marketplace-demo.com', displayName: 'Marketplace Demo' };
    const demoData = {
      uid: 'demo_mkt_123',
      name: 'Marketplace Demo',
      email: 'dev@marketplace-demo.com',
      plan: 'startup',
      status: 'active',
      currentCycle: { creditsUsed: 1240 },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (typeof onAuthenticated === 'function') onAuthenticated(demoUser, demoData);
    return;
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      // Se estiver local, permitir preview em modo de demonstração
      if (location.hostname === 'localhost' || location.protocol === 'file:') {
        const demoUser = { uid: 'demo_mkt_123', email: 'dev@marketplace.com', displayName: 'Vedix Marketplace' };
        const demoData = {
          uid: 'demo_mkt_123',
          name: 'Vedix Marketplace',
          email: 'dev@marketplace.com',
          plan: 'startup',
          status: 'active',
          currentCycle: { creditsUsed: 1850 },
          createdAt: Date.now()
        };
        if (typeof onAuthenticated === 'function') onAuthenticated(demoUser, demoData);
        return;
      }
      window.location.href = 'login.html';
      return;
    }

    try {
      let mktData = null;
      if (db) {
        const doc = await db.doc(`marketplaces/${user.uid}`).get();
        mktData = doc.exists ? doc.data() : null;

        // Sem conta ainda (1º login federado, ex: Google) — o bootstrap é feito
        // no servidor (ensureMarketplaceAccount), que fixa plan/status; o cliente
        // já não tem permissão para criar marketplaces/{uid} diretamente.
        if (!mktData && functions) {
          const fn = functions.httpsCallable('ensureMarketplaceAccount');
          const res = await fn({});
          mktData = res.data;
        } else if (!mktData) {
          mktData = { uid: user.uid, name: user.displayName || 'Marketplace', email: user.email, plan: 'developer', status: 'active' };
        }
      } else {
        mktData = { uid: user.uid, name: user.displayName || 'Marketplace', email: user.email, plan: 'developer' };
      }

      if (typeof onAuthenticated === 'function') {
        onAuthenticated(user, mktData);
      }
    } catch (err) {
      console.error('[Nettuno Portal] Erro ao carregar marketplace:', err);
      if (typeof onAuthenticated === 'function') {
        onAuthenticated(user, { uid: user.uid, email: user.email, plan: 'developer', name: 'Marketplace' });
      }
    }
  });
}

function logout() {
  if (auth && auth.currentUser) {
    auth.signOut().then(() => {
      window.location.href = 'login.html';
    });
  } else {
    window.location.href = 'login.html';
  }
}