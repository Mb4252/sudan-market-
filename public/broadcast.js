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