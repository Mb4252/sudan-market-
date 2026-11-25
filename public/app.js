(function() {
  'use strict';

  // 1. Config & State
  window.APP_CONFIG = {
    wsUrl: 'wss://browser-relay-server.onrender.com',
    storageKey: 'smart_posts_v1',
    maxPosts: 500,
    priceRegex: /(\\d+(\\.\\d{1,2})?)\s*(ريال|جنية|دولار|ليرة|دينار|قيراط|مليون|مليار|مليون ريال|مليون جنيه)/i,
    storeRegex: /(في|من|عند)\s+([\\u0600-\\u06FF\\s]+)/i,
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
    post.price = priceMatch ? parseFloat(priceMatch[0].replace(/[^\\d.]/g, '')) : null;

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
        post.priceTag = post.price < avgPrice ? 'cheap' : 'expensive';
      } else {
        post.priceTag = 'neutral';
      }
    }

    return post;
  };

  // 4. UI Initialization
  function initUI() {
    const posts = window.postStorage.getAll();
    renderPosts(posts);
    updateRadar();

    document.getElementById('publishBtn').addEventListener('click', publishPost);
    document.getElementById('compareBtn').addEventListener('click', showCompareOverlay);
    document.getElementById('analyticsToggle').addEventListener('click', toggleAnalytics);

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderPosts(window.postStorage.getAll(), btn.dataset.filter);
      });
    });
  }

  // 5. Post Publishing (Local-First)
  function publishPost() {
    const content = document.getElementById('content').value.trim();
    const author = document.getElementById('author').value.trim();

    if (!content) {
      showError('الرجاء كتابة منشور', 'warning');
      return;
    }

    const post = {
      id: Date.now().toString(),
      content,
      author: author || 'مجهول',
      timestamp: Date.now()
    };

    // Local-First: Save immediately
    window.postStorage.addPost(window.tagPost(post));
    document.getElementById('content').value = '';
    document.getElementById('author').value = '';

    // Try to sync with server
    syncPost(post);
  }

  // 6. Server Sync
  function syncPost(post) {
    if (!window.APP_CONFIG.wsUrl) return;

    const ws = new WebSocket(window.APP_CONFIG.wsUrl);
    let timeout = setTimeout(() => {
      ws.close();
      updateUIStatus('وضع محلي سريع', false);
    }, window.APP_CONFIG.connectionTimeout);

    ws.onopen = () => {
      clearTimeout(timeout);
      ws.send(JSON.stringify({ type: 'POST', data: post }));
      updateUIStatus('تم البث المباشر', true);
    };

    ws.onerror = (e) => {
      console.error('WebSocket error:', e);
      updateUIStatus('تم الحفظ محلياً - سيُزامن عند عودة الاتصال', false);
    };
  }

  // 7. UI Rendering
  function renderPosts(posts, filter = '') {
    const postsContainer = document.getElementById('posts');
    postsContainer.innerHTML = '';

    const filteredPosts = filter ? posts.filter(p => p.priceTag === filter) : posts;

    if (filteredPosts.length === 0) {
      postsContainer.innerHTML = '<p>لا توجد منشورات بعد</p>';
      return;
    }

    filteredPosts.forEach(post => {
      const postElement = document.createElement('div');
      postElement.className = `post ${post.priceTag || ''}`;
      postElement.innerHTML = `
        <div class="post-header">
          <span class="post-author">${post.author}</span>
          <span class="post-time">${new Date(post.timestamp).toLocaleString('ar-EG')}</span>
        </div>
        <div class="post-content">${post.content}</div>
        ${post.price ? `<div class="post-price">السعر: ${post.price} ريال</div>` : ''}
        ${post.store ? `<div class="post-store">المحل: ${post.store}</div>` : ''}
      `;
      postsContainer.appendChild(postElement);
    });
  }