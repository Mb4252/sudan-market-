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
      syncBadge.title = 'وض';
    }
  }
  
  // WebSocket Connection
  function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    
    if (connectionAttempts >= maxAttempts) {
      updateUIStatus('فشل الاتصال', false);
      return;
    }