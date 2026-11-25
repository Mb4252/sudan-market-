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
            : 'normal';
      } else {
        post.priceTag = 'normal';
      }
    }

    return post;
  };

  // 4. UI Components
  const elements = {
    status: document.getElementById('status'),
    author: document.getElementById('author'),
    content: document.getElementById('content'),
    publishBtn: document.getElementById('publishBtn'),
    postsContainer: document.getElementById('posts'),
    syncBadge: document.getElementById('syncBadge'),
    radarContent: document.getElementById('radarContent'),
    compareOverlay: document.getElementById('compareOverlay'),
    compareContent: document.getElementById('compareContent'),
    closeCompare: document.getElementById('closeCompare'),
    comparisonResults: document.getElementById('comparisonResults'),
    analyticsPanel: document.getElementById('analyticsPanel'),
    analyticsToggle: document.getElementById('analyticsToggle'),
    chartVolume: document.getElementById('chartVolume'),
    chartPrice: document.getElementById('chartPrice')
  };

  // 5. Event Listeners
  elements.publishBtn.addEventListener('click', publishPost);
  elements.closeCompare.addEventListener('click', closeCompare);
  elements.analyticsToggle.addEventListener('click', toggleAnalytics);
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', filterPosts);
  });
  document.getElementById('compareBtn').addEventListener('click', showCompareOverlay);

  // 6. Initialize
  initializeApp();

  // 7. Functions
  function initializeApp() {
    updateUIStatus('جاري التحميل...', false);
    renderPosts();
    updateRadar();
    updateAnalytics();
    window.addEventListener('storage:update', handleStorageUpdate);
  }

  function publishPost() {
    const author = elements.author.value.trim();
    const content = elements.content.value.trim();

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

    // Local-First Publish
    window.postStorage.addPost(window.tagPost(post));
    elements.content.value = '';
    showSuccess('تم حفظ المنشور محلياً!');
  }

  function renderPosts(filter = '') {
    const posts = window.postStorage.getAll();
    elements.postsContainer.innerHTML = '';

    if (posts.length === 0) {
      elements.postsContainer.innerHTML = '<p>لا توجد منشورات بعد.</p>';
      return;
    }

    posts.forEach(post => {
      if (filter && post.priceTag !== filter) return;

      const postElement = document.createElement('div');
      postElement.className = `post ${post.priceTag || ''}`;
      postElement.innerHTML = `
        <div class="post-header">
          <span class="post-author">${post.author}</span>
          <span class="post-time">${new Date(post.timestamp).toLocaleString('ar-EG')}</span>
        </div>
        <div class="post-content">${post.content}</div>
        ${post.price ? `<div class="post-price">السعر: ${post.price} ريال</div>` : ''}
        ${post.store ? `<div class="post-store">المتجر: ${post.store}</div>` : ''}
      `;

      elements.postsContainer.appendChild(postElement);
    });
  }

  function updateRadar() {
    const posts = window.postStorage.getAll();
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);

    const recentPosts = posts.filter(p => p.timestamp > dayAgo && p.price !== null);

    if (recentPosts.length === 0) {
      elements.radarContent.innerHTML = 'لا توجد بيانات كافية لتحليل الفرص.';
      return;
    }

    const stores = {};
    recentPosts.forEach(post => {
      if (!stores[post.store]) {
        stores[post.store] = {
          prices: [],
          cheapest: null,
          mostExpensive: null
        };
      }

      stores[post.store].prices.push(post.price);
    }