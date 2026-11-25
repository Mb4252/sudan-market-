(function(){
  const channel = new BroadcastChannel('posts');
  let ws = null;

  channel.addEventListener('message', e => {
    try {
      if (e.data && e.data.type === 'NEW_POST') {
        window.postStorage && window.postStorage.addPost(e.data);
      }
    } catch (err) {
      console.warn('Broadcast handler error', err);
    }
  });

  function connectWebSocket() {
    if (ws) return;

    ws = new WebSocket(window.APP_CONFIG.wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      document.getElementById('status').textContent = 'متصل';
      document.getElementById('syncBadge').classList.remove('offline');
      document.getElementById('syncBadge').classList.add('online');
    }

    ws.onmessage = e => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'NEW_POST') {
          window.postStorage.addPost(data);
        }
      } catch (err) {
        console.warn('WebSocket message error', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      document.getElementById('status').textContent = 'غير متصل';
      document.getElementById('syncBadge').classList.remove('online');
      document.getElementById('syncBadge').classList.add('offline');
    };

    ws.onerror = () => {
      console.error('WebSocket error');
      document.getElementById('status').textContent = 'خطأ في الاتصال';
      document.getElementById('syncBadge').classList.remove('online');
      document.getElementById('syncBadge').classList.add('offline');
    };
  }

  // Try to connect immediately
  connectWebSocket();

  // Reconnect every 30 seconds if not connected
  setInterval(() => {
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      connectWebSocket();
    }
  }, 30000);

  // Publish post to WebSocket if connected
  window.publishPost = (post) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'NEW_POST', ...post }));
    }
  };
})();