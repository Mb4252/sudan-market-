(function() {
  'use strict';

  // 1. Global Error Handling (Mandatory)
  window.onerror = function(message, source, lineno, colno, error) {
    console.error('[App Error]', message, source, lineno, colno, error);
    showError(message);
  };

  window.addEventListener('unhandledrejection', function(event) {
    console.error('[Unhandled Rejection]', event.reason);
    showError(event.reason.message || 'خطأ غير معروف');
  });

  function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = `خطأ: ${message}`;
    document.body.prepend(errorElement);

    // Log error to localStorage
    const errors = JSON.parse(localStorage.getItem('errors') || '[]');
    errors.push({
      message,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('errors', JSON.stringify(errors));
  }

  // 2. Initialize when DOM is loaded
  document.addEventListener('DOMContentLoaded', function() {
    // Initialize charts
    const ctxVolume = document.getElementById('chartVolume').getContext('2d');
    const ctxPrice = document.getElementById('chartPrice').getContext('2d');

    // Create charts
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

    window.priceChart = new Chart(ctxPrice, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'السعر المتوسط',
          data: [],
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 2,
          tension: 0.1
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

    // Initialize WebSocket connection
    connectWebSocket();
  });

  // 3. WebSocket Connection
  function connectWebSocket() {
    const statusIndicator = document.getElementById('status-indicator');
    const postsContainer = document.getElementById('posts-container');

    // Update status indicator
    function updateStatus(online) {
      statusIndicator.textContent = online ? 'متصل' : 'غير متصل';
      statusIndicator.className = `status-indicator ${online ? 'online' : 'offline'}`;
    }

    // Connect to WebSocket
    const socket = new WebSocket('wss://sudan-market-2.onrender.com');

    socket.onopen = function() {
      console.log('WebSocket connection established');
      updateStatus(true);
    };

    socket.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        console.log('Received data:', data);

        // Process the received data
        if (data.type === 'post') {
          displayPost(data.post);
          updateCharts(data.post);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        showError('خطأ في معالجة البيانات الواردة');
      }
    };

    socket.onclose = function() {
      console.log('WebSocket connection closed');
      updateStatus(false);
      // Attempt to reconnect after 5 seconds
      setTimeout(connectWebSocket, 5000);
    };

    socket.onerror = function(error) {
      console.error('WebSocket error:', error);
      showError('خطأ في الاتصال بالبث المباشر');
    };
  }

  // 4. Display Post
  function displayPost(post) {
    const postsContainer = document.getElementById('posts-container');
    const postElement = document.createElement('div');
    postElement.className = `post-card ${post.isAnomaly ? 'anomaly' : ''}`;

    // Create post header
    const postHeader = document.createElement('div');
    postHeader.className = 'post-header';
    postHeader.innerHTML = `
      <span class="author">${post.author}</span>
      <span>${new Date(post.timestamp).toLocaleString('ar-EG')}</span>
    `;

    // Create post content
    const postContent = document.createElement('div');
    postContent.className = 'post-content';
    postContent.textContent = post.content;

    // Create post details
    const postDetails = document.createElement('div');
    postDetails.className = 'post-details';

    // Add entities
    post.entities.forEach(entity => {
      const entityElement = document.createElement('span');
      entityElement.className = 'entity-item';
      entityElement.textContent = entity;
      postDetails.appendChild(entityElement);
    });

    // Add price
    if (post.price) {
      const priceElement = document.createElement('span');
      priceElement.className = 'entity-price';
      priceElement.textContent = `${post.price} ${post.currency}`;
      postDetails.appendChild(priceElement);
    }

    // Add place
    if (post.place) {
      const placeElement = document.createElement('span');
      placeElement.className = 'entity-place';
      placeElement.textContent = post.place;
      postDetails.appendChild(placeElement);
    }

    // Add forecast if available
    if (post.forecast) {
      const forecastSection = document.createElement('div');
      forecastSection.className = 'forecast-section';
      forecastSection.innerHTML = `
        <h3>تنبؤ السعر</h3>
        <p>التنبؤ: <span class="forecast-value">${post.forecast.value} ${post.currency}</span></p>
        <p>الثقة: <span class="confidence-indicator ${getConfidenceClass(post.forecast.confidence)}">${post.forecast.confidence.toFixed(2)}</span></p>
      `;
      postElement.appendChild(forecastSection);
    }

    // Assemble post element
    postElement.appendChild(postHeader);
    postElement.appendChild(postContent);
    postElement.appendChild(postDetails);

    // Add to container (new posts at the top)
    postsContainer.prepend(postElement);
  }

  // 5. Update Charts
  function updateCharts(post) {
    if (!post.price || !post.timestamp) return;

    // Update volume chart
    const volumeData = window.volumeChart.data;
    const date = new Date(post.timestamp).toLocaleDateString('ar-EG');

    // Check if date exists in labels
    const dateIndex = volumeData.labels.indexOf(date);
    if (dateIndex === -1) {
      volumeData.labels.push(date);
      volumeData.datasets[0].data.push(1);
    } else {
      volumeData.datasets[0].data[dateIndex]++;
    }

    // Update price chart
    const priceData = window.priceChart.data;
    const time = new Date(post.timestamp).toLocaleTimeString('ar-EG');
    priceData.labels.push(time);
    priceData.datasets[0].data.push(post.price);

    // Keep only the last 20 data points
    if (priceData.labels.length > 20) {
      priceData.labels.shift();
      priceData.datasets[0].data.shift();
    }

    // Update charts
    window.volumeChart.update();
    window.priceChart.update();
  }

  // 6. Helper Functions
  function getConfidenceClass(confidence) {
    if (confidence >= 0.8) return 'high-confidence';
    if (confidence >= 0.5) return 'medium-confidence';
    return 'low-confidence';
  }

  // 7. Local Storage Management
  function saveToLocalStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      showError('خطأ في حفظ البيانات محليًا');
    }
  }

  function loadFromLocalStorage(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error loading from localStorage:', error);
      showError('خطأ في تحميل البيانات المحفوظة');
      return null;
    }
  }

  // 8. Initialize from localStorage
  function initializeFromLocalStorage() {
    const savedPosts = loadFromLocalStorage('marketPosts');
    if (savedPosts && savedPosts.length > 0) {
      savedPosts.forEach(post => displayPost(post));
    }
  }

  // Initialize from localStorage when DOM is loaded
  document.addEventListener('DOMContentLoaded', initializeFromLocalStorage);

  // 9. Service Worker Registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js').then(function(registration) {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      }, function(err) {
        console.log('ServiceWorker registration failed: ', err);
        showError('فشل تسجيل خدمة الويب');
      });
    });
  }

})();