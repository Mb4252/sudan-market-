(function() {
  'use strict';

  // 1. Config & State
  window.APP_CONFIG = {
    wsUrl: 'wss://sudan-market-2.onrender.com',
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
        post.priceTag = post.price < avgPrice ? 'cheap' : 'expensive';
      } else {
        post.priceTag = 'neutral';
      }
    }

    return post;
  };

  // 4. UI Rendering
  function renderPosts(posts) {
    const postsContainer = document.getElementById('posts');
    if (!postsContainer) return;

    postsContainer.innerHTML = posts.length ? posts.map(p => {
      const priceTag = p.priceTag === 'cheap' ? '🟢' : p.priceTag === 'expensive' ? '🔴' : '';
      return `
        <div class="post" data-id="${p.id}">
          <div class="post-header">
            <span class="author">${p.author || 'مجهول'}</span>
            <span class="timestamp">${new Date(p.timestamp).toLocaleString('ar-EG')}</span>
          </div>
          <div class="post-content">${p.content}</div>
          <div class="post-meta">
            <span class="price">${p.price !== null ? `${p.price} ريال` : 'سعر غير محدد'}</span>
            <span class="store">${p.store}</span>
            <span class="price-tag">${priceTag}</span>
          </div>
        </div>
      `;
    }).join('') : '<div class="empty">لا توجد منشورات بعد</div>';
  }

  // 5. Event Handlers
  document.getElementById('publishBtn').addEventListener('click', () => {
    const content = document.getElementById('content').value.trim();
    const author = document.getElementById('author').value.trim();

    if (!content) {
      showError('الرجاء كتابة المنشور', 'warning');
      return;
    }

    const post = {
      id: Date.now().toString(),
      content,
      author: author || null,
      timestamp: Date.now()
    };

    const taggedPost = window.tagPost(post);
    window.postStorage.addPost(taggedPost);
    document.getElementById('content').value = '';
    renderPosts(window.postStorage.getAll());
  });

  // 6. Initialization
  document.addEventListener('DOMContentLoaded', () => {
    renderPosts(window.postStorage.getAll());
  });

  // 7. Helper Functions
  function updateUIStatus(status, isOnline) {
    const statusElement = document.getElementById('status');
    const syncBadge = document.getElementById('syncBadge');

    if (statusElement) statusElement.textContent = status;
    if (syncBadge) {
      if (isOnline) {
        syncBadge.classList.remove('offline');
        syncBadge.classList.add('online');
        syncBadge.title = 'متصل';
      } else {
        syncBadge.classList.remove('online');
        syncBadge.classList.add('offline');
        syncBadge.title = 'وضع محلي سريع';
      }
    }
  }

  // 8. Filtering
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;
      const posts = window.postStorage.getAll();

      if (filter === 'cheap') {
        renderPosts(posts.filter(p => p.priceTag === 'cheap'));
      } else if (filter === 'expensive') {
        renderPosts(posts.filter(p => p.priceTag === 'expensive'));
      } else {
        renderPosts(posts);
      }
    });
  });

  // 9. Compare Prices
  document.getElementById('compareBtn').addEventListener('click', () => {
    const posts = window.postStorage.getAll();
    const compareOverlay = document.getElementById('compareOverlay');
    const compareResults = document.getElementById('compareResults');

    if (!compareOverlay || !compareResults) return;

    const products = {}