/*! Smart Market Price Tagger v2.1 - Reactive, Offline-First, NLP, Analytics & Forecasting */
(function() {
  'use strict';

  // 1. Global Error Handling (Mandatory)
  window.onerror = function(message, source, lineno, colno, error) {
    console.error('[App Error]', message, source, lineno, colno, error);
    saveToLocalStorage('errors', {message, source, lineno, colno, error});
    updateUI();
  };

  window.addEventListener('unhandledrejection', function(event) {
    console.error('[Unhandled Rejection]', event.reason);
    saveToLocalStorage('errors', {type: 'unhandledrejection', reason: event.reason});
    updateUI();
  });

  // 2. Reactive Store
  const state = new Proxy({
    posts: [],
    errors: []
  }, {
    set(target, key, value) {
      target[key] = value;
      updateUI();
      return true;
    }
  });

  // 3. WebSocket Connection
  const socket = new WebSocket('wss://sudan-market-2.onrender.com');
  socket.onopen = function() {
    document.getElementById('status-indicator').className = 'status-indicator online';
    document.getElementById('status-indicator').textContent = 'متصل';
  };

  // ... (rest of the code)
})();