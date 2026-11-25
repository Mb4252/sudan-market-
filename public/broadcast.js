(function() {
  const channel = new BroadcastChannel('posts');
  let ws = null;
  let isConnecting = true;
  let connectionAttempts = 0;
  const maxAttempts = 5;
  const attemptDelay = 3000;

  // Initialize WebSocket connection
  function initWebSocket() {
    ws = new WebSocket(window.APP_CONFIG.wsUrl);
    ws.onopen = onOpen;
    ws.onclose = onClose;
    ws.onerror = onError;
    ws.onmessage = onMessage;
  }

  // WebSocket event handlers
  function onOpen() {
    connectionAttempts = 0;
    isConnecting = false;
    updateUIStatus('متصل بالبث المباشر', true);
    channel.postMessage({ type: 'connect', data: { status: 'online' } });
  }

  function onClose() {
    if (connectionAttempts < maxAttempts) {
      connectionAttempts++;
      setTimeout(initWebSocket, attemptDelay);
    } else {
      isConnecting = true;
      updateUIStatus('فشل الاتصال بالبث المباشر', false);
    }
  }

  function onError(error) {
    console.error('WebSocket error:', error);
    updateUIStatus('خطأ في الاتصال بالبث المباشر', false);
  }

  function onMessage(event) {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'SYNC') {
        const posts = data.data;
        window.postStorage.clear();
        posts.forEach(post => window.postStorage.addPost(post));
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  }

  // Broadcast Channel listeners
  channel.addEventListener('message', (event) => {
    if (event.data.type === 'publish') {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event.data));
      } else {
        console.warn('WebSocket not connected, publishing locally only');
      }
    }
  });

  // Initialize
  initWebSocket();

  // UI State Management
  function updateUIStatus(status, isOnline) {
    const statusElement = document.getElementById('status');
    const syncBadge = document.getElementById('syncBadge');

    statusElement.textContent = status;

    if (isOnline) {
      syncBadge.classList.remove('offline');
      syncBadge.classList.add('online');
      syncBadge.title = 'متصل';
      document.getElementById('publishBtn').disabled = false;
    } else {
      syncBadge.classList.remove('online');
      syncBadge.classList.add('offline');
      syncBadge.title = 'غير مزامن';
      document.getElementById('publishBtn').disabled = false;
    }
  }

  // Expose public API
  window.broadcastManager = {
    initWebSocket,
    updateUIStatus
  };

})();