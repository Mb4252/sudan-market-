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
        post.priceTag = post.price < avgPrice ? 'cheap' : 'expensive';
      } else {
        post.priceTag = 'normal';
      }
    }

    return post;
  };

  // 4. UI State Management
  function updateUIStatus(status, isOnline) {
    const statusElement = document.getElementById('status');
    const syncBadge = document.getElementById('syncBadge');

    statusElement.textContent = status;

    if (isOnline) {
      syncBadge.classList.remove('offline');
      syncBadge.classList.add('online');
      syncBadge.title = 'متصل';
      document.getElementById('publishBtn').disabled = false;
      document.getElementById('compareBtn').disabled = false;
      document.getElementById('analyticsToggle').disabled = false;
    } else {
      syncBadge.classList.remove('online');
      syncBadge.classList.add('offline');
      syncBadge.title = 'وضع محلي سري';
      document.getElementById('publishBtn').disabled = false;
      document.getElementById('compareBtn').disabled = false;
      document.getElementById('analyticsToggle').disabled = false;
    }
  }

  // 5. Initialize
  document.addEventListener('DOMContentLoaded', () => {
    // Render initial posts
    renderPosts(window.postStorage.getAll());

    // Set up event listeners
    document.getElementById('publishBtn').addEventListener('click', publishPost);
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', filterPosts);
    });
    document.getElementById('compareBtn').addEventListener('click', comparePrices);
    document.getElementById('analyticsToggle').addEventListener('click', toggleAnalytics);

    // Set initial status
    updateUIStatus('جاري الاتصال...', false);
  });

  // 6. Core Functions
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

    // Tag the post
    window.tagPost(post);

    // Save to local storage
    window.postStorage.addPost(post);

    // Clear input
    document.getElementById('content').value = '';
    document.getElementById('author').value = '';

    // Show success message
    showError('تم الحفظ محلياً', 'success');

    // Broadcast to other tabs
    channel.postMessage({ type: 'NEW_POST', post });
  }

  function renderPosts(posts) {
    const postsContainer = document.getElementById('posts');
    postsContainer.innerHTML = '';

    if (posts.length === 0) {
      postsContainer.innerHTML = '<p>لا توجد منشورات بعد</p>';
      return;
    }

    posts.forEach(post => {
      const postElement = document.createElement('div');
      postElement.className = 'post';

      if (post.priceTag) {
        postElement.classList.add(post.priceTag);
      }

      postElement.innerHTML = `
        <div class="post-header">
          <span class="post-author">${post.author}</span>
          <span class="post-time">${new Date(post.timestamp).toLocaleString('ar-EG')}</span>
        </div>
        <div class="post-content">${post.content}</div>
        ${post.price ? `<div class="post-price">السعر: ${post.price} ${post.priceTag === 'cheap' ? '🟢' : post.priceTag === 'expensive' ? '🔴' : ''}</div>` : ''}
        ${post.store ? `<div class="post-store">المتجر: ${post.store}</div>` : ''}
      `;

      postsContainer.appendChild(postElement);
    });
  }

  function filterPosts(e) {
    const filter = e.target.getAttribute('data-filter');
    const posts = window.postStorage.getAll();

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    e.target.classList.add('active');

    if (!filter) {
      renderPosts(posts);
      return;
    }

    const filteredPosts = posts.filter(post => post.priceTag === filter);
    renderPosts(filteredPosts);
  }

  function comparePrices() {
    const posts = window.postStorage.getAll();
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);

    const recentPosts = posts.filter(p => p.timestamp > dayAgo && p.price !== null);

    if (recentPosts.length < 2) {
      showError('لا توجد بيانات كافية للمقارنة', 'warning');
      return;
    }