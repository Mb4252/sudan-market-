(function() {
  'use strict';

  // 1. Config & State
  window.APP_CONFIG = {
    wsUrl: 'wss://browser-relay-server.onrender.com',
    storageKey: 'smart_posts_v1',
    maxPosts: 500,
    priceRegex: /(\d+(\.\d{1,2})?)\s*(ريال|جنية|دولار|ليرة|دينار|قيراط|مليون|مليار|مليون ريال|مليون جنيه)/i,
    storeRegex: /(في|من|عند)\s+([\u0600-\u06FF\s]+)/i,
    connectionTimeout: 5000
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
      updateUIStatus('وضع محلي سريع', false);
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
          : null;
      }
    }

    return post;
  };

  // 4. UI State Management
  function updateUIStatus(status, isOnline) {
    const statusElement = document.getElementById('status');
    const syncBadge = document.getElementById('syncBadge');

    statusElement.textContent = status;
    statusElement.className = 'status ' + (isOnline ? 'online' : 'offline');

    if (isOnline) {
      syncBadge.classList.remove('offline');
      syncBadge.classList.add('online');
      syncBadge.title = 'متصل بالجسر';
      document.getElementById('publishBtn').disabled = false;
      document.getElementById('compareBtn').disabled = false;
      document.getElementById('analyticsToggle').disabled = false;
    } else {
      syncBadge.classList.remove('online');
      syncBadge.classList.add('offline');
      syncBadge.title = 'وضع محلي سريع';
      document.getElementById('publishBtn').disabled = false;
      document.getElementById('compareBtn').disabled = false;
      document.getElementById('analyticsToggle').disabled = false;
    }
  }

  // 5. WebSocket Connection Handler
  function connectWebSocket() {
    let ws = null;
    let connectionAttempts = 0;
    const maxAttempts = 5;
    const attemptDelay = 3000;

    function attemptConnection() {
      ws = new WebSocket(window.APP_CONFIG.wsUrl);

      ws.onopen = () => {
        connectionAttempts = 0;
        updateUIStatus('متصل بالجسر', true);
        console.log('Connected to WebSocket server');
      };

      ws.onclose = () => {
        if (connectionAttempts < maxAttempts) {
          const delay = attemptDelay * (connectionAttempts + 1);
          setTimeout(attemptConnection, delay);
          connectionAttempts++;
          updateUIStatus('جارِ الاتصال...', false);
        } else {
          updateUIStatus('فشل الاتصال بعد عدة محاولات', false);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateUIStatus('خطأ في الاتصال', false);
      };
    }

    attemptConnection();
    return ws;
  }

  // 6. Publish Button Handler
  document.getElementById('publishBtn').addEventListener('click', () => {
    const author = document.getElementById('author').value.trim() || 'مستخدم مجهول';
    const content = document.getElementById('content').value.trim();

    if (!content) {
      showError('من فضلك أدخل نص المنشور', 'warning');
      return;
    }

    const post = {
      id: Date.now().toString(),
      author,
      content,
      timestamp: Date.now(),
      isLocal: true
    };

    const taggedPost = window.tagPost(post);
    window.postStorage.addPost(taggedPost);
    document.getElementById('content').value = '';
    showError('تم حفظ المنشور محلياً!', 'success');

    // Trigger UI update
    window.dispatchEvent(new CustomEvent('posts:update'));
  });

  // 7. Compare Button Handler
  document.getElementById('compareBtn').addEventListener('click', () => {
    const compareOverlay = document.getElementById('compareOverlay');
    const compareContent = document.getElementById('compareContent');

    if (compareOverlay.classList.contains('hidden')) {
      compareOverlay.classList.remove('hidden');
      compareContent.innerHTML = '<p>جارِ تحميل المقارنة...</p>';
      compareContent.classList.remove('hidden');

      // Simulate comparison logic
      setTimeout(() => {
        compareContent.innerHTML = '<p>مقارنة الأسعار بين المتاجر المختلفة...</p>';
        const posts = window.postStorage.getAll();
        const storesWithPrices = posts.filter(p => p.price !== null && p.store).reduce((acc, post) => {
          if (!acc[post.store]) {
            acc[post.store] = [];
          }
          acc[post.store].push(post.price);
          return acc;
        }, {}