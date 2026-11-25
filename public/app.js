/*! Smart Market Price Tagger v2.1 - Reactive, Offline-First, NLP, Analytics & Forecasting */
(function() {
  'use strict';

  // 1. Global Error Handling (Mandatory)
  window.onerror = function(message, source, lineno, colno, error) {
    console.error('[App Error]', message, source, lineno, colno, error);
    // Log errors to localStorage for debugging
    const errors = JSON.parse(localStorage.getItem('errors') || '[]');
    errors.push({ message, source, lineno, colno, timestamp: new Date().toISOString() });
    localStorage.setItem('errors', JSON.stringify(errors));
  };

  // 2. Reactive Store using Proxy and EventTarget
  class ReactiveStore extends EventTarget {
    constructor(initialState) {
      super();
      this.state = new Proxy(initialState, {
        set: (target, property, value) => {
          target[property] = value;
          this.dispatchEvent(new CustomEvent('stateChange', { detail: { property, value } }));
          return true;
        }
      });
    }
  }

  // Initialize store with default state
  const store = new ReactiveStore({
    posts: [],
    volumeData: [],
    priceData: [],
    forecast: null
  });

  // 3. DOM Elements
  const elements = {
    posts: document.getElementById('posts'),
    chartVolume: document.getElementById('chartVolume'),
    chartPrice: document.getElementById('chartPrice'),
    status: document.getElementById('status'),
    syncBadge: document.getElementById('syncBadge'),
    compareOverlay: document.getElementById('compareOverlay'),
    compareContent: document.getElementById('compareContent'),
    radarContent: document.getElementById('radarContent'),
    publishBtn: document.getElementById('publishBtn'),
    author: document.getElementById('author'),
    content: document.getElementById('content'),
    compareBtn: document.getElementById('compareBtn'),
    priceRadar: document.getElementById('priceRadar')
  };

  // 4. WebSocket Connection
  let socket;
  function connectWebSocket() {
    socket = new WebSocket('wss://sudan-market-2.onrender.com');

    socket.onopen = function() {
      elements.status.textContent = 'متصل';
      elements.status.className = 'status-indicator online';
      elements.syncBadge.textContent = 'متزامن';
      elements.syncBadge.className = 'status-indicator online';
    };

    socket.onclose = function() {
      elements.status.textContent = 'غير متصل';
      elements.status.className = 'status-indicator offline';
      elements.syncBadge.textContent = 'غير متزامن';
      elements.syncBadge.className = 'status-indicator offline';
      // Attempt to reconnect
      setTimeout(connectWebSocket, 5000);
    };

    socket.onmessage = function(event) {
      const data = JSON.parse(event.data);
      store.state.posts = data.posts;
      store.state.volumeData = data.volumeData;
      store.state.priceData = data.priceData;
      saveToLocalStorage(data);
    };
  }

  // 5. Save to localStorage
  function saveToLocalStorage(data) {
    localStorage.setItem('marketData', JSON.stringify(data));
  }

  // 6. Broadcast data via WebSocket
  function broadcastData(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  // 7. Update UI
  function updateUI() {
    // Update posts
    elements.posts.innerHTML = store.state.posts.map(post => {
      return `
        <div class="post-card">
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

    // Update charts
    if (window.volumeChart) {
      window.volumeChart.data.labels = store.state.volumeData.map(item => item.label);
      window.volumeChart.data.datasets[0].data = store.state.volumeData.map(item => item.value);
      window.volumeChart.update();
    }

    if (window.priceChart) {
      window.priceChart.data.labels = store.state.priceData.map(item => item.label);
      window.priceChart.data.datasets[0].data = store.state.priceData.map(item => item.value);
      window.priceChart.update();
    }
  }

  // 8. Event Listeners
  elements.publishBtn.addEventListener('click', function() {
    const post = {
      author: elements.author.textContent,
      content: elements.content.value,
      timestamp: new Date().toISOString()
    };
    store.state.posts = [post, ...store.state.posts];
    broadcastData({ posts: store.state.posts });
    elements.content.value = '';
  });

  elements.compareBtn.addEventListener('click', function() {
    // Implement price comparison logic
  });

  // 9. Initialize
  function init() {
    // Load data from localStorage
    const savedData = localStorage.getItem('marketData');
    if (savedData) {
      const data = JSON.parse(savedData);
      store.state.posts = data.posts;
      store.state.volumeData = data.volumeData;
      store.state.priceData = data.priceData;
    }

    // Connect to WebSocket
    connectWebSocket();

    // Update UI when state changes
    store.addEventListener('stateChange', updateUI);

    // Initialize charts
    if (elements.chartVolume) {
      const ctxVolume = elements.chartVolume.getContext('2d');
      window.volumeChart = new Chart(ctxVolume, {
        type: 'bar',
        data: {
          labels: [],
          datasets: [{
            label: 'عدد المنشورات',
            data: [],
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      });
    }

    if (elements.chartPrice) {
      const ctxPrice = elements.chartPrice.getContext('2d');
      window.priceChart = new Chart(ctxPrice, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'متوسط السعر',
            data: [],
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: {
              beginAtZero: false
            }
          }
        }
      });
    }
  }

  // Start the application
  init();
})();