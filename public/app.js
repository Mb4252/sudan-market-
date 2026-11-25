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

    return post;
  };

  // 4. UI Initialization
  document.addEventListener('DOMContentLoaded', () => {
    // Ensure DOM elements exist
    const requiredIds = ['status', 'author', 'content', 'publishBtn', 'posts', 'compareOverlay', 'compareContent'];
    const missingIds = requiredIds.filter(id => !document.getElementById(id));

    if (missingIds.length > 0) {
      console.error('Missing DOM elements:', missingIds);
      return;
    }

    // Initialize UI
    document.getElementById('status').textContent = 'جاهز للنشر'; // Updated status text
    renderPosts();

    // Event Listeners
    document.getElementById('publishBtn').addEventListener('click', publishPost);
    document.getElementById('compareBtn').addEventListener('click', showCompareOverlay);
    document.getElementById('analyticsToggle').addEventListener('click', toggleAnalytics);
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', filterPosts);
    });

    // Storage Update Listener
    window.addEventListener('storage:update', (e) => {
      renderPosts();
      updateRadar();
    });
  });

  // 5. Publish Post
  function publishPost() {
    const content = document.getElementById('content').value.trim();
    const author = document.getElementById('author').value.trim();

    if (!content) {
      showError('الرجاء كتابة المنشور', 'warning');
      return;
    }

    const post = {
      id: Date.now().toString(),
      content,
      author: author || 'مجهول',
      timestamp: Date.now()
    };

    // Tag post before saving
    const taggedPost = window.tagPost(post);
    window.postStorage.addPost(taggedPost);

    // Clear input
    document.getElementById('content').value = '';
    document.getElementById('author').value = '';

    // Show success message
    showError('تم نشر المنشور بنجاح!', 'success');
  }

  // 6. Render Posts
  function renderPosts(filter = '') {
    const posts = window.postStorage.getAll();
    const postsContainer = document.getElementById('posts');

    if (posts.length === 0) {
      postsContainer.innerHTML = '<p>لا توجد منشورات بعد. كن أول من ينشر!</p>';
      return;
    }

    let filteredPosts = posts;
    if (filter === 'cheap') {
      filteredPosts = posts.filter(p => p.priceTag === 'cheap');
    } else if (filter === 'expensive') {
      filteredPosts = posts.filter(p => p.priceTag === 'expensive');
    }

    postsContainer.innerHTML = filteredPosts.map(post => {
      const priceTag = post.priceTag ? `<span class="price-tag ${post.priceTag}">${post.priceTag === 'cheap' ? 'رخيص' : 'غالي'}</span>` : '';
      return `
        <div class="post" data-id="${post.id}">
          <div class="post-header">
            <span class="author">${post.author}</span>
            <span class="timestamp">${new Date(post.timestamp).toLocaleString('ar-EG')}</span>
          </div>
          <div class="post-content">${post.content}</div>
          <div class="post-footer">
            ${priceTag}
            <span class="store">${post.store}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // 7. Filter Posts
  function filterPosts(e) {
    const filter = e.target.getAttribute('data-filter');
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    renderPosts(filter);
  }

  // 8. Compare Prices
  function showCompareOverlay() {
    const posts = window.postStorage.getAll();
    const compareOverlay = document.getElementById('compareOverlay');
    const compareContent = document.getElementById('compareContent');

    if (posts.length < 2) {
      showError('تحتاج إلى منشورين على الأقل للمقارنة', 'warning');
      return;
    }

    // Group posts by store
    const stores = {};
    posts.forEach(post => {
      if (!stores[post.store]) stores[post.store] = [];
      stores[post.store].push(post);
    });

    // Find stores with multiple posts
    const comparableStores = Object.entries(stores).filter(([store, posts]) => posts.length > 1);

    if (comparableStores.length === 0) {
      showError('لا توجد منشورات من نفس المتجر للمقارنة', 'warning');
      return;
    }