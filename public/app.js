(function() {
  'use strict';

  // 1. Global Error Handling (Mandatory)
  window.onerror = function(message, source, lineno, colno, error) {
    console.error('[App Error]', message, source, lineno, colno, error);
    showError(message);
  };

  window.addEventListener('unhandledrejection', function(event) {
    console.error('[Unhandled Rejection]', event.reason);
    showError(event.reason.message || 'حدث خطأ غير متوقع');
  });

  // 2. DOM Elements
  const statusIndicator = document.getElementById('status-indicator');
  const postsContainer = document.getElementById('posts-container');
  const publishForm = document.getElementById('publishForm');
  const authorInput = document.getElementById('author');
  const contentInput = document.getElementById('content');
  const compareBtn = document.getElementById('compareBtn');
  const priceRadar = document.getElementById('priceRadar');

  // 3. State Management
  let posts = [];
  let isOnline = false;
  let ws;

  // 4. Initialize
  function init() {
    loadPosts();
    setupEventListeners();
    checkOnlineStatus();
    connectWebSocket();
  }

  // 5. Load posts from localStorage
  function loadPosts() {
    const savedPosts = localStorage.getItem('sudanMarketPosts');
    if (savedPosts) {
      posts = JSON.parse(savedPosts);
      renderPosts();
    }
  }

  // 6. Save posts to localStorage
  function savePosts() {
    localStorage.setItem('sudanMarketPosts', JSON.stringify(posts));
  }

  // 7. Render posts to DOM
  function renderPosts() {
    postsContainer.innerHTML = '';
    posts.forEach(post => {
      const postElement = document.createElement('div');
      postElement.className = `post-card ${post.isAnomaly ? 'anomaly' : ''}`;
      postElement.innerHTML = `
        <div class="post-header">
          <span class="author">${post.author}</span>
          <span class="timestamp">${new Date(post.timestamp).toLocaleString('ar-SD')}</span>
        </div>
        <div class="post-content">${post.content}</div>
        <div class="post-details">
          ${post.entities.map(entity => `
            <span class="entity-item">${entity.name}</span>
            <span class="entity-price">${entity.price} ${entity.currency}</span>
            <span class="entity-place">${entity.place}</span>
          `).join('')}
        </div>
        ${post.forecast ? `
        <div class="forecast-section">
          <div>التنبؤ: <span class="forecast-value">${post.forecast.value} ${post.forecast.currency}</span></div>
          <div class="confidence ${post.forecast.confidence > 0.7 ? 'high-confidence' : 'low-confidence'}">ثقة: ${Math.round(post.forecast.confidence * 100)}%</div>
        </div>
        ` : ''}
      `;
      postsContainer.appendChild(postElement);
    });
  }

  // 8. Show error message
  function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    document.querySelector('.container').prepend(errorElement);
    setTimeout(() => errorElement.remove(), 5000);
  }

  // 9. Check online status
  function checkOnlineStatus() {
    isOnline = navigator.onLine;
    updateStatusIndicator();
    if (isOnline && !ws) {
      connectWebSocket();
    }
  }

  // 10. Update status indicator
  function updateStatusIndicator() {
    statusIndicator.textContent = isOnline ? 'متصل' : 'غير متصل';
    statusIndicator.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
  }

  // 11. Connect to WebSocket
  function connectWebSocket() {
    if (ws) ws.close();
    ws = new WebSocket('wss://sudan-market-2.onrender.com');

    ws.onopen = () => {
      isOnline = true;
      updateStatusIndicator();
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'post') {
        posts.unshift(data.post);
        savePosts();
        renderPosts();
      }
    };

    ws.onclose = () => {
      isOnline = false;
      updateStatusIndicator();
      console.log('WebSocket disconnected');
      setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  // 12. Setup event listeners
  function setupEventListeners() {
    window.addEventListener('online', checkOnlineStatus);
    window.addEventListener('offline', checkOnlineStatus);

    publishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const post = {
        author: authorInput.value,
        content: contentInput.value,
        timestamp: new Date().toISOString(),
        entities: extractEntities(contentInput.value),
        isAnomaly: false
      };

      // Add forecast if entities exist
      if (post.entities.length > 0) {
        const forecast = forecastPrice(post.entities.map(e => e.price));
        post.forecast = {
          value: forecast.value,
          currency: post.entities[0].currency,
          confidence: forecast.confidence
        };
      }

      // Save locally first
      posts.unshift(post);
      savePosts();
      renderPosts();

      // Send to server if online
      if (isOnline && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'post', post }));
      }

      // Reset form
      publishForm.reset();
    });

    compareBtn.addEventListener('click', () => {
      // Implement price comparison logic here
      console.log('مقارنة الأسعار');
    });
  }

  // 13. Extract entities from content
  function extractEntities(content) {
    // Simple entity extraction (in a real app, use NLP)
    const entities = [];
    const itemMatch = content.match(/(\d+)\s*(جنيه|جنيهات|دولار|دولارات)/i);
    if (itemMatch) {
      entities.push({
        name: 'المنتج',
        price: parseFloat(itemMatch[1]),
        currency: itemMatch[2],
        place: 'غير محدد'
      });
    }
    return entities;
  }

  // Initialize the app
  init();
})();