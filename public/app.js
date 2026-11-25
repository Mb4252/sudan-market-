(function() {
  'use strict';

  // 1. Config & State
  window.APP_CONFIG = {
    wsUrl: 'wss://browser-relay-server.onrender.com',
    storageKey: 'smart_posts_v1',
    maxPosts: 500,
    priceRegex: /(\d+(\.\d{1,2})?)\s*(ريال|جنية|دولار|ليرة|دينار|قيراط|مليون|مليار|مليون ريال|مليون جنيه)/i,
    storeRegex: /(في|من|عند)\s+([\u0600-\u06FF\s]+)/i
  };

  // 2. Storage Manager (Source of Truth)
  window.postStorage = {
    getAll: () => {
      try {
        const raw = localStorage.getItem(window.APP_CONFIG.storageKey);
        return JSON.parse(raw || '[]');
      } catch (e) {
        console.error('Storage read error:', e);
        return [];
      }
    },
    addPost: (post) => {
      const posts = window.postStorage.getAll();
      const existingPostIndex = posts.findIndex(p => p.id === post.id);

      if (existingPostIndex >= 0) {
        posts[existingPostIndex] = post;
      } else {
        posts.unshift(post);
        if (posts.length > window.APP_CONFIG.maxPosts) posts.pop();
      }

      localStorage.setItem(window.APP_CONFIG.storageKey, JSON.stringify(posts));
      window.dispatchEvent(new CustomEvent('storage:update', { detail: posts }));
    },
    clear: () => localStorage.removeItem(window.APP_CONFIG.storageKey)
  };

  // 3. Price Extraction & Smart Tagging Engine
  window.tagPost = (post) => {
    const text = post.content || '';

    // Extract Price
    const priceMatch = text.match(window.APP_CONFIG.priceRegex);
    post.price = priceMatch ? parseFloat(priceMatch[0].replace(/[^\d.]/g, '')) : null;

    // Extract Store Name
    const storeMatch = text.match(window.APP_CONFIG.storeRegex);
    post.store = storeMatch ? storeMatch[2].trim().substring(0, 20) : 'غير محدد';

    // Smart Dynamic Tagging
    if (post.price !== null) {
      const posts = window.postStorage.getAll();
      const now = Date.now();
      const dayAgo = now - (24 * 60 * 60 * 1000);

      const relevantPosts = posts.filter(p =>
        p.timestamp > dayAgo &&
        p.store === post.store &&
        p.price !== null
      );

      if (relevantPosts.length > 0) {
        const avgPrice = relevantPosts.reduce((sum, p) => sum + p.price, 0) / relevantPosts.length;
        post.priceTag = post.price < avgPrice * 0.9
          ? 'cheap'
          : post.price > avgPrice * 1.1
            ? 'expensive'
            : '';
      }
    }
  };

  // 4. UI Initialization
  document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI elements
    const statusElement = document.getElementById('status');
    const syncBadge = document.getElementById('syncBadge');
    const publishBtn = document.getElementById('publishBtn');
    const compareBtn = document.getElementById('compareBtn');
    const analyticsToggle = document.getElementById('analyticsToggle');
    const postsContainer = document.getElementById('posts');
    const radarContent = document.getElementById('radarContent');
    const analyticsPanel = document.getElementById('analyticsPanel');
    const compareOverlay = document.getElementById('compareOverlay');
    const compareContent = document.getElementById('compareContent');
    const closeCompare = document.getElementById('closeCompare');
    const compareResults = document.getElementById('compareResults');

    // Set initial UI state
    statusElement.textContent = 'جارٍ الاتصال...';
    syncBadge.classList.add('offline');
    syncBadge.title = 'غير مزامن';
    publishBtn.disabled = true;
    compareBtn.disabled = true;
    analyticsToggle.disabled = true;

    // Load existing posts
    renderPosts();

    // Event Listeners
    publishBtn.addEventListener('click', publishPost);
    compareBtn.addEventListener('click', showCompareOverlay);
    analyticsToggle.addEventListener('click', toggleAnalyticsPanel);
    closeCompare.addEventListener('click', hideCompareOverlay);

    // Storage Update Listener
    window.addEventListener('storage:update', (e) => {
      renderPosts();
      updateRadar();
    });

    // Initialize WebSocket connection
    connectWebSocket();
  });

  // 5. WebSocket Connection
  function connectWebSocket() {
    const ws = new WebSocket(window.APP_CONFIG.wsUrl);

    ws.onopen = () => {
      const statusElement = document.getElementById('status');
      const syncBadge = document.getElementById('syncBadge');
      const publishBtn = document.getElementById('publishBtn');
      const compareBtn = document.getElementById('compareBtn');
      const analyticsToggle = document.getElementById('analyticsToggle');

      statusElement.textContent = 'متصل بالجسر';
      syncBadge.classList.remove('offline');
      syncBadge.classList.add('online');
      syncBadge.title = 'متصل';
      publishBtn.disabled = false;
      compareBtn.disabled = false;
      analyticsToggle.disabled = false;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'POST') {
          window.postStorage.addPost(data.post);
        }
      } catch (e) {
        console.error('WebSocket message error:', e);
      }
    };

    ws.onclose = () => {
      const statusElement = document.getElementById('status');
      const syncBadge = document.getElementById('syncBadge');
      const publishBtn = document.getElementById('publishBtn');
      const compareBtn = document.getElementById('compareBtn');
      const analyticsToggle = document.getElementById('analyticsToggle');

      statusElement.textContent = 'وضع محلي سريع';
      syncBadge.classList.remove('online');
      syncBadge.classList.add('offline');
      syncBadge.title = 'غير مزامن';
      publishBtn.disabled = false;
      compareBtn.disabled = false;
      analyticsToggle.disabled = false;

      // Attempt to reconnect after a delay
      setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  // 6. Post Publishing
  function publishPost() {
    const authorInput = document.getElementById('author');
    const contentInput = document.getElementById('content');
    const statusElement = document.getElementById('status');

    const author = authorInput.value.trim();
    const content = contentInput.value.trim();

    if (!content) {
      showError('المنشور فارغ!', 'error');
      return;
    }

    const post = {
      id: Date.now().toString(),
      author: author || 'مجهول',
      content: content,
      timestamp: Date.now()
    };

    // Tag the post
    window.tagPost(post);

    // Save to local storage
    try {
      window.postStorage.addPost(post);
      statusElement.textContent = 'تم الحفظ محلياً، جارٍ المزامنة...';
    } catch (e) {
      showError('فشل الحفظ المحلي!', 'error');
      console.error('Local storage error:', e);
      return;
    }