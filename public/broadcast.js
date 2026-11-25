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
      syncBadge.title = 'وضع محلي سري';
      document.getElementById('publishBtn').disabled = false;
      document.getElementById('compareBtn').disabled = false;
      document.getElementById('analyticsToggle').disabled = false;
    }
  }

  // WebSocket Connection
  function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    if (connectionAttempts >= maxAttempts) {
      updateUIStatus('وضع محلي سري', false);
      return;
    }

    isConnecting = true;
    updateUIStatus('جاري الاتصال...', false);

    ws = new WebSocket(window.APP_CONFIG.wsUrl);

    ws.onopen = () => {
      connectionAttempts = 0;
      isConnecting = false;
      updateUIStatus('متصل بالجسر', true);
      syncLocalPosts();
    };

    ws.onclose = () => {
      if (!isConnecting) {
        connectionAttempts++;
        setTimeout(connectWebSocket, attemptDelay);
      }
    }