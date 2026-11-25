/*! Smart Market Price Tagger v2.1 - Reactive, Offline-First, NLP, Analytics & Forecasting */
(function() {
  'use strict';

  // 1. Global Error Handling (Mandatory)
  window.onerror = function(message, source, lineno, colno, error) {
    console.error('[App Error]', message, source, lineno, colno, error);
    logError('JS', message, source, lineno);
  };
  window.onunhandledrejection = function(event) {
    console.error('[Promise Rejection]', event.reason);
    logError('Promise', event.reason.message || 'Unknown', 'async', 0);
  };

  function logError(type, msg, src, line) {
    try {
      const logs = JSON.parse(localStorage.getItem('error_logs') || '[]');
      logs.push({ type, msg, src, line, time: new Date().toISOString() });
      if (logs.length > 50) logs.shift();
      localStorage.setItem('error_logs', JSON.stringify(logs));
    } catch(e) {}
  }

  // 2. Reactive Store Implementation
  window.Store = class extends EventTarget {
    constructor(initialState = {}) {
      super();
      this._state = new Proxy(initialState, {
        set: (target, prop, value) => {
          target[prop] = value;
          this.dispatchEvent(new CustomEvent('change', { detail: { key: prop, value } }));
          return true;
        }
      });
    }
    get state() { return this._state; }
    set(key, value) { this._state[key] = value; }
  };

  // Initialize Store
  window.appStore = new Store({
    posts: [],
    connectionStatus: 'offline',
    selectedCity: 'all',
    filter: 'all'
  });

  // 3. Plugin Registry (Simplified for this context)
  const plugins = {};
  window.registerPlugin = function(name, fn) {
    plugins[name] = fn;
  };

  // 4. Data Processing & Forecasting Integration
  function processPost(postData) {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    const post = {
      id,
      ...postData,
      timestamp: new Date().toISOString(),
      predictedPrice: null,
      confidence: 0
    };

    // جلب الأسعار التاريخية من المخزن لحساب التنبؤ
    const allPosts = appStore.state.posts;
    const historicalPrices = allPosts
      .filter(p => p.price && typeof p.price === 'number' && p.price > 0)
      .map(p => p.price);

    // إضافة السعر الحالي للتنبؤ
    if (postData.price && typeof postData.price === 'number') {
      historicalPrices.push(postData.price);
    }

    // استدعاء Plugin التنبؤ
    if (window.ForecastPlugin) {
      try {
        const forecast = window.ForecastPlugin.predict(historicalPrices);
        post.predictedPrice = forecast.predictedPrice;
        post.confidence = forecast.confidence;
      } catch (e) {
        console.error('Forecast Error:', e);
        post.predictedPrice = null;
        post.confidence = 0;
      }
    }

    return post;
  }

  function addPost(postData) {
    const post = processPost(postData);
    const currentPosts = [...appStore.state.posts, post];
    appStore.set('posts', currentPosts);
    
    // الحفظ في LocalStorage (Offline-First)
    try {
      localStorage.setItem('sudan_market_posts', JSON.stringify(currentPosts));
    } catch(e) {
      console.error('Storage Error:', e);
    }

    // البث عبر WebSocket (إذا كان متاحاً)
    broadcastPost(post);
    
    // تحديث الواجهة
    renderPosts();
  }

  function broadcastPost(post) {
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      try {
        window.ws.send(JSON.stringify({ type: 'NEW_POST', payload: post }));
      } catch(e) {}
    }
  }

  // 5. UI Rendering
  function renderPosts() {
    const container = document.getElementById('posts-container');
    if (!container) return;

    const posts = appStore.state.posts;
    if (posts.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد منشورات بعد</div>';
      return;
    }

    // ترتيب المنشورات من الأحدث للأقدم
    const sortedPosts = [...posts].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    container.innerHTML = sortedPosts.map(post => {
      const priceDisplay = post.price ? `<span class="entity-price">${post.price} ج.س</span>` : 'غير محدد';
      
      // عرض التنبؤ والثقة
      let forecastHtml = '';
      if (post.predictedPrice !== null && post.predictedPrice !== undefined) {
        const confidenceColor = post.confidence > 70 ? 'var(--primary)' : (post.confidence > 40 ? 'var(--warning)' : 'var(--danger)');
        forecastHtml = `
          <div class="forecast-section">
            <span class="forecast-label">🔮 السعر المتوقع:</span>
            <span class="forecast-price">${post.predictedPrice} ج.س</span>
            <div class="confidence-indicator" style="color: ${confidenceColor};">
              الثقة: ${post.confidence}%
            </div>
          </div>
        `;
      }

      return `
        <div class="post-card ${post.isAnomaly ? 'anomaly' : ''}">
          <div class="post-header">
            <span class="author">${post.author || 'مجهول'}</span>
            <span class="timestamp">${new Date(post.timestamp).toLocaleTimeString('ar-SD')}</span>
          </div>
          <div class="post-content">${post.content}</div>
          <div class="post-details">
            <span class="entity-item">${post.item || 'منتج'}</span>
            <span class="entity-price">${priceDisplay}</span>
            ${post.city ? `<span class="entity-place">📍 ${post.city}</span>` : ''}
          </div>
          ${forecastHtml}
          ${post.isAnomaly ? '<span class="anomaly-badge">⚠️ شذوذ</span>' : ''}
        </div>
      `;
    }).join('');
  }

  // 6. Initialization
  document.addEventListener('DOMContentLoaded', function() {
    // استرجاع البيانات من LocalStorage
    try {
      const savedPosts = JSON.parse(localStorage.getItem('sudan_market_posts') || '[]');
      if (savedPosts.length > 0) {
        appStore.set('posts', savedPosts);
      }
    } catch(e) {
      console.error('Load Error:', e);
    }

    // ربط النموذج
    const form = document.getElementById('post-form');
    if (form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        const content = document.getElementById('post-content').value.trim();
        const price = parseFloat(document.getElementById('post-price').value);
        const author = document.getElementById('post-author').value.trim();
        const city = document.getElementById('post-city').value.trim();
        const item = document.getElementById('post-item').value.trim();

        if (!content) return;

        const postData = {
          content,
          price: isNaN(price) ? null : price,
          author: author || 'مجهول',
          city: city || null,
          item: item || null,
          isAnomaly: false // يمكن إضافة منطق كشف الشذوذ لاحقاً
        };

        addPost(postData);
        form.reset();
      });
    }

    // ملاحظة: تم نقل منطق WebSocket إلى قسم منفصل أو ملف آخر لضمان البساطة هنا
    initWebSocket();
    
    // أول عرض
    renderPosts();
  });

  // 7. WebSocket Connection (Simplified)
  function initWebSocket() {
    const wsUrl = 'wss://sudan-market-2.onrender.com';
    try {
      window.ws = new WebSocket(wsUrl);
      
      window.ws.onopen = () => {
        appStore.set('connectionStatus', 'online');
        updateStatusUI();
      };

      window.ws.onclose = () => {
        appStore.set('connectionStatus', 'offline');
        updateStatusUI();
        // إعادة المحاولة بعد 5 ثوانٍ
        setTimeout(initWebSocket, 5000);
      };

      window.ws.onerror = () => {
        appStore.set('connectionStatus', 'offline');
        updateStatusUI();
      };

      window.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'NEW_POST') {
            // تجنب الإضافة المكررة
            const exists = appStore.state.posts.some(p => p.id === data.payload.id);
            if (!exists) {
              addPost(data.payload);
            }
          }
        } catch(e) {}
      };
    } catch(e) {
      console.error('WS Init Error:', e);
      appStore.set('connectionStatus', 'offline');
      updateStatusUI();
    }
  }

  function updateStatusUI() {
    const statusEl = document.getElementById('status-indicator');
    if (statusEl) {
      const status = appStore.state.connectionStatus;
      statusEl.className = `status-indicator ${status}`;
      statusEl.textContent = status === 'online' ? 'متصل' : 'غير متصل';
    }
  }

  // 8. Expose for testing/debugging
  window.SmartMarket = {
    addPost,
    getPosts: () => appStore.state.posts
  };

})();