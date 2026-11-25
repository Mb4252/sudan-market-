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
      syncBadge.title = 'وضع محلي';
    }
  }
  
  function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    
    if (connectionAttempts >= maxAttempts) {
      updateUIStatus('وضع محلي سريع', false);
      return;
    }
    
    ws = new WebSocket(window.APP_CONFIG.wsUrl);
    
    ws.onopen = () => {
      connectionAttempts = 0;
      updateUIStatus('متصل بالجسر', true);
      console.log('WebSocket connected');
    };
    
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'NEW_POST') {
          window.postStorage.addPost(data);
        } else if (data.type === 'HEALTH') {
          updateUIStatus('متصل بنجاح', true);
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };
    
    ws.onclose = () => {
      connectionAttempts++;
      if (ws.readyState === WebSocket.CLOSED && connectionAttempts < maxAttempts) {
        setTimeout(connectWebSocket, attemptDelay);
      } else {
        updateUIStatus('غير متصل (جاري إعادة الاتصال...)', false);
      }
      console.log('WebSocket disconnected');
    };
    
    ws.onerror = (e) => {
      console.error('WebSocket error:', e);
      updateUIStatus('خطأ في الاتصال', false);
    };
  }
  
  // Check health endpoint
  function checkHealth() {
    fetch(window.APP_CONFIG.wsUrl.replace('wss', 'https').replace('ws', 'http') + '/health', {
      method: 'GET',
      credentials: 'include'
    }).then(response => {
      if (response.ok) {
        updateUIStatus('متصل بنجاح', true);
      } else {
        updateUIStatus('خطأ في الجسر', false);
      }
    }).catch(() => {
      updateUIStatus('خطأ في الجسر', false);
    });
  }
  
  // Initialize
  updateUIStatus('جاري الاتصال...', false);
  connectWebSocket();
  checkHealth();
  
  // Handle Broadcast Channel
  channel.addEventListener('message', (e) => {
    try {
      if (e.data && e.data.type === 'NEW_POST') {
        window.postStorage.addPost(e.data);
      }
    } catch (err) {
      console.error('Broadcast handler error:', err);
    }
  });
})();