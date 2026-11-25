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
      ws = null;
      setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = err => {
      console.error('WebSocket error:', err);
      ws.close();
    };
  }

  // Try to connect immediately
  connectWebSocket();

  // Wake up Render server
  fetch('https://browser-relay-server.onrender.com/health')
    .then(() => console.log('Render server woke up'))
    .catch(err => console.warn('Failed to wake up Render server', err));
})();