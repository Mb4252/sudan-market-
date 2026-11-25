/*! Smart Market Price Tagger v1.0 - Fixed & Optimized */
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
    const now = Date.now();

    // Extract Price
    const priceMatch = text.match(window.APP_CONFIG.priceRegex);
    post.price = priceMatch ? parseFloat(priceMatch[0].replace(/[^\d.]/g, '')) : null;

    // Extract Store Name
    const storeMatch = text.match(window.APP_CONFIG.storeRegex);
    post.store = storeMatch ? storeMatch[2].trim().substring(0, 20) : 'غير محدد';

    // Smart Dynamic Tagging
    if (post.price !== null) {
      const posts = window.postStorage.getAll();
      const dayAgo = now - (24 * 60 * 60 * 1000);

      const relevantPosts = posts.filter(p => 
        p.timestamp > dayAgo && 
        p.store === post.store && 
        p.price !== null
      );

      if (relevantPosts.length > 0) {
        const avgPrice = relevantPosts.reduce((sum, p) => sum + p.price, 0) / relevantPosts.length;
        post.priceTag = post.price < avgPrice * 0.9 ? 'cheap' : 'expensive';
        post.priceDiff = ((post.price - avgPrice) / avgPrice * 100).toFixed(1) + '%';
      }
    }

    // Add metadata
    post.id = 'post_' + now;
    post.timestamp = now;
    post.author = post.author || 'مستخدم مجهول';
    return post;
  };

  // 4. DOM Ready & Event Listeners
  document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI
    updateUIStatus('جارٍ الاتصال...', false);
    renderPosts();

    // Event Listeners
    document.getElementById('publishBtn').addEventListener('click', publishPost);
    document.getElementById('compareBtn').addEventListener('click', comparePosts);
    document.getElementById('analyticsToggle').addEventListener('click', toggleAnalytics);

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterPosts(btn.dataset.filter);
      });
    });

    // Storage sync listener
    window.addEventListener('storage:update', renderPosts);
  });

  // 5. UI Functions
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
      syncBadge.title = 'غير مزامن';
      document.getElementById('publishBtn').disabled = false;
      document.getElementById('compareBtn').disabled = true;
      document.getElementById('analyticsToggle').disabled = true;
    }
  }

  function renderPosts() {
    const postsContainer = document.getElementById('posts');
    const posts = window.postStorage.getAll();

    postsContainer.innerHTML = '';

    if (posts.length === 0) {
      postsContainer.innerHTML = '<p>لا يوجد منشورات بعد</p>';
      return;
    }

    posts.forEach(post => {
      const postElement = document.createElement('div');
      postElement.className = 'post-card ' + (post.priceTag || '');
      postElement.innerHTML = `
        <div class="post-header">
          <span class="post-author">${post.author}</span>
          <span class="post-time">منذ ${Math.floor((Date.now() - post.timestamp) / 60000)} دقيقة</span>
        </div>
        <div class="post-content">${post.content}</div>
        ${post.price !== null ? `<div class="post-price">${post.price} ريال ${post.priceTag ? `<span class="price-tag">(${post.priceTag === 'cheap' ? '🟢' : '🔴'}) ${post.priceDiff}</span>` : ''}</div>` : ''}
        <div class="post-store">في ${post.store}</div>
      `;
      postsContainer.appendChild(postElement);
    });
  }

  function filterPosts(filter) {
    const posts = window.postStorage.getAll();
    const filteredPosts = filter ? posts.filter(p => p.priceTag === filter) : posts;
    renderPosts();
  }

  function comparePosts() {
    const posts = window.postStorage.getAll().filter(p => p.price !== null);
    if (posts.length < 2) {
      alert('يحتاج المقارنة إلى أكثر من منشور');
      return;
    }

    const sortedPosts = [...posts].sort((a, b) => a.price - b.price);
    const cheapest = sortedPosts[0];
    const mostExpensive = sortedPosts[sortedPosts.length - 1];

    const compareOverlay = document.getElementById('compareOverlay');
    compareOverlay.innerHTML = `
      <div class="compare-overlay-content">
        <h3>مقارنة الأسعار</h3>
        <div class="compare-item">
          <h4>أرخص</h4>
          <p>${cheapest.content}</p>
          <p>${cheapest.price} ريال في ${cheapest.store}</p>
        </div>
        <div class="compare-item">
          <h4>أغلى</h4>
          <p>${mostExpensive.content}</p>
          <p>${mostExpensive.price} ريال في ${mostExpensive.store}</p>
        </div>
        <button id="closeCompare" class="close-btn">إغلاق</button>
      </div>
    `;

    compareOverlay.classList.remove('hidden');
    document.getElementById('closeCompare').addEventListener('click', () => {
      compareOverlay.classList.add('hidden');
    });
  }

  function toggleAnalytics() {
    const analyticsPanel = document.getElementById('analyticsPanel');
    analyticsPanel.classList.toggle('hidden');
    if (!analyticsPanel.classList.contains('hidden')) {
      updateAnalyticsCharts();
    }
  }

  function updateAnalyticsCharts() {
    // Placeholder for analytics chart logic
    console.log('Updating analytics charts...');
  }

  // 6. Publish Logic
  function publishPost() {
    const content = document.getElementById('content').value.trim();
    const author = document.getElementById('author').value.trim() || 'مستخدم مجهول';

    if (!content) {
      alert('يرجى إدخال نص المنشور');
      return;
    }

    const post = {
      content: content,
      author: author
    };

    const taggedPost = window.tagPost(post);
    window.postStorage.addPost(taggedPost);

    // Clear input
    document.getElementById('content').value = '';
    document.getElementById('author').value = '';

    // Show success message
    updateUIStatus('منشور محلي بنجاح!', false);
  }

})();