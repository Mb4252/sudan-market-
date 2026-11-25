(function() {
  const channel = new BroadcastChannel('posts');
  let ws = null;
  let isConnecting = true;
  let connectionAttempts = 0;
  const maxAttempts = 5;
  const attemptDelay = 3000;

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
      document.getElementById('compareBtn').disabled = false;
      document.getElementById('analyticsToggle').disabled = false;
    } else {
      syncBadge.classList.remove('online');
      syncBadge.classList.add('offline');
      syncBadge.title = 'وضع محلي سريع';
      document.getElementById('publishBtn').disabled = false;
      document.getElementById('compareBtn').disabled = false;
      document.getElementById('analyticsToggle').disabled = false;
    }
  }

  // WebSocket Connection
  function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    if (connectionAttempts >= maxAttempts) {
      updateUIStatus('وضع محلي سريع', false);
      return;
    }

    isConnecting = true;
    updateUIStatus('جاري الاتصال...', false);

    ws = new WebSocket(window.APP_CONFIG.wsUrl);

    ws.onopen = () => {
      connectionAttempts = 0;
      isConnecting = false;
      updateUIStatus('متصل بالجسر', true);

      // Send all local posts to server
      const posts = window.postStorage.getAll();
      if (posts.length > 0) {
        ws.send(JSON.stringify({ type: 'SYNC', data: posts }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'POST') {
          window.postStorage.addPost(message.data);
        } else if (message.type === 'SYNC') {
          message.data.forEach(post => window.postStorage.addPost(post));
        }
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    }