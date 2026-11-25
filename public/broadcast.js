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

  function connectWS() {
    if (!window.APP_CONFIG || !window.APP_CONFIG.wsUrl) return;
    try {
      ws = new WebSocket(window.APP_CONFIG.wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'NEW_POST' && window.postStorage) {
            window.postStorage.addPost(data);
          }
        } catch (e) { console.warn('WS parse error', e); }
      };
    } catch (e) { console.warn('WS connection error', e); }
  }

  function publishPost(post) {
    try {
      if (window.tagPost) {
        post = window.tagPost(post);
      }
      if (window.postStorage) {
        window.postStorage.addPost(post);
      }
      channel.postMessage({ type: 'NEW_POST', ...post });
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'NEW_POST', ...post }));
      }
    } catch (err) {
      console.warn('Publish error', err);
    }
  }