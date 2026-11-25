(function() {
  'use strict';

  // 1. Global Error Handling (Mandatory)
  window.onerror = function(message, source, lineno, colno, error) {
    console.error('[App Error]', message, source, lineno, colno, error);
    showError(message);
  };

  window.addEventListener('unhandledrejection', function(event) {
    console.error('[Unhandled Rejection]', event.reason);
    showError(event.reason.message || 'Unhandled rejection');
  });

  // 2. DOM Elements
  const statusElement = document.getElementById('status');
  const syncBadge = document.getElementById('syncBadge');
  const postsContainer = document.getElementById('posts');
  const compareOverlay = document.getElementById('compareOverlay');
  const compareContent = document.getElementById('compareContent');
  const radarContent = document.getElementById('radarContent');

  // 3. State Management
  let posts = [];
  let isOnline = false;
  let isSyncing = false;

  // 4. Initialize
  function init() {
    // Check DOM elements
    if (!statusElement || !syncBadge || !postsContainer || !compareOverlay || !compareContent || !radarContent) {
      console.error('Missing required DOM elements');
      return;
    }

    // Set initial state
    updateStatus();
    updateSyncBadge();

    // Connect to WebSocket
    connectWebSocket();

    // Load saved posts
    loadPosts();
  }

  // 5. WebSocket Connection
  function connectWebSocket() {
    const wsUrl = 'wss://sudan-market-2.onrender.com';
    const ws = new WebSocket(wsUrl);

    ws.onopen = function() {
      isOnline = true;
      updateStatus();
      console.log('WebSocket connected');
    };

    ws.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = function() {
      isOnline = false;
      updateStatus();
      console.log('WebSocket disconnected');
      // Attempt to reconnect after 5 seconds
      setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = function(error) {
      console.error('WebSocket error:', error);
    };
  }

  // 6. Handle WebSocket Messages
  function handleWebSocketMessage(data) {
    if (data.type === 'post') {
      addPost(data.post);
    } else if (data.type === 'sync') {
      isSyncing = data.syncing;
      updateSyncBadge();
    }
  }

  // 7. Add Post
  function addPost(post) {
    posts.unshift(post);
    if (posts.length > 50) {
      posts.pop();
    }
    renderPosts();
    savePosts();
    updateCharts();
  }

  // 8. Render Posts
  function renderPosts() {
    postsContainer.innerHTML = posts.map(post => {
      const isAnomaly = post.anomaly ? ' anomaly' : '';
      return `
        <div class="post-card${isAnomaly}">
          <div class="post-header">
            <span class="author">${post.author}</span>
            <span>${new Date(post.timestamp).toLocaleString()}</span>
          </div>
          <div class="post-content">${post.content}</div>
          <div class="post-details">
            <span class="entity-item">${post.item}</span>
            <span class="entity-price">${post.price} ${post.currency}</span>
            <span class="entity-place">${post.place}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // 9. Update Status
  function updateStatus() {
    statusElement.textContent = isOnline ? 'متصل' : 'غير متصل';
    statusElement.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
  }

  // 10. Update Sync Badge
  function updateSyncBadge() {
    syncBadge.textContent = isSyncing ? 'متزامن' : 'غير متزامن';
    syncBadge.style.backgroundColor = isSyncing ? 'var(--primary)' : 'var(--secondary)';
  }

  // 11. Save Posts to Local Storage
  function savePosts() {
    try {
      localStorage.setItem('sudanMarketPosts', JSON.stringify(posts));
    } catch (error) {
      console.error('Error saving posts to localStorage:', error);
    }
  }

  // 12. Load Posts from Local Storage
  function loadPosts() {
    try {
      const savedPosts = localStorage.getItem('sudanMarketPosts');
      if (savedPosts) {
        posts = JSON.parse(savedPosts);
        renderPosts();
        updateCharts();
      }
    } catch (error) {
      console.error('Error loading posts from localStorage:', error);
    }
  }

  // 13. Update Charts
  function updateCharts() {
    if (window.volumeChart && window.priceChart) {
      const labels = posts.map(post => new Date(post.timestamp).toLocaleTimeString());
      const prices = posts.map(post => post.price);

      window.volumeChart.data.labels = labels;
      window.volumeChart.data.datasets[0].data = Array(posts.length).fill(1);
      window.volumeChart.update();

      window.priceChart.data.labels = labels;
      window.priceChart.data.datasets[0].data = prices;
      window.priceChart.update();
    }
  }

  // 14. Show Error
  function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.style.position = 'fixed';
    errorElement.style.top = '20px';
    errorElement.style.left = '50%';
    errorElement.style.transform = 'translateX(-50%)';
    errorElement.style.backgroundColor = 'var(--danger)';
    errorElement.style.color = 'white';
    errorElement.style.padding = '10px 20px';
    errorElement.style.borderRadius = '5px';
    errorElement.style.zIndex = '1000';
    errorElement.textContent = `خطأ: ${message}`;
    document.body.appendChild(errorElement);

    setTimeout(() => {
      document.body.removeChild(errorElement);
    }, 5000);
  }

  // Initialize the app
  document.addEventListener('DOMContentLoaded', init);

})();