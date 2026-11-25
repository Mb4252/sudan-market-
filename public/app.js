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

  // 4. UI Initialization
  document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI
    renderPosts();
    updateRadar();
    updateAnalytics();

    // Event Listeners
    document.getElementById('publishBtn').addEventListener('click', publishPost);
    document.getElementById('compareBtn').addEventListener('click', comparePrices);
    document.getElementById('analyticsToggle').addEventListener('click', toggleAnalytics);

    // Filter Buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderPosts(btn.dataset.filter);
      });
    });

    // Storage Update Listener
    window.addEventListener('storage:update', () => {
      renderPosts();
      updateRadar();
      updateAnalytics();
    });
  });

  // 5. Core Functions
  function publishPost() {
    const content = document.getElementById('content').value.trim();
    const author = document.getElementById('author').value.trim();

    if (!content) {
      showError('الرجاء كتابة المنشور', 'validation');
      return;
    }

    const post = {
      id: Date.now().toString(),
      content,
      author: author || 'مجهول',
      timestamp: Date.now(),
      price: null,
      store: 'غير محدد',
      priceTag: 'normal'
    };

    // Tag the post immediately
    const taggedPost = window.tagPost(post);

    // Save to local storage
    window.postStorage.addPost(taggedPost);

    // Clear input fields
    document.getElementById('content').value = '';
    document.getElementById('author').value = '';

    // Show success message
    showSuccess('تم نشر المنشور بنجاح!');
  }

  function renderPosts(filter = '') {
    const posts = window.postStorage.getAll();
    const postsContainer = document.getElementById('posts');
    postsContainer.innerHTML = '';

    if (posts.length === 0) {
      postsContainer.innerHTML = '<p>لا توجد منشورات بعد</p>';
      return;
    }

    const filteredPosts = filter
      ? posts.filter(p => p.priceTag === filter)
      : posts;

    filteredPosts.forEach(post => {
      const postElement = document.createElement('div');
      postElement.className = 'post';

      if (post.priceTag === 'cheap') {
        postElement.classList.add('cheap');
      } else if (post.priceTag === 'expensive') {
        postElement.classList.add('expensive');
      }

      postElement.innerHTML = `
        <div class="post-header">
          <span class="post-author">${post.author}</span>
          <span class="post-time">${new Date(post.timestamp).toLocaleString('ar-EG')}</span>
        </div>
        <div class="post-content">${post.content}</div>
        <div class="post-meta">
          <span class="post-store">${post.store}</span>
          ${post.price ? `<span class="post-price">${post.price} ريال</span>` : ''}
        </div>
      `;

      postsContainer.appendChild(postElement);
    });
  }

  function updateRadar() {
    const posts = window.postStorage.getAll();
    const radarContent = document.getElementById('radarContent');

    if (posts.length === 0) {
      radarContent.innerHTML = 'لا توجد بيانات كافية لتحليل الفرص';
      return;
    }

    // Find the cheapest and most expensive items
    const items = {};

    posts.forEach(post => {
      if (post.price !== null) {
        if (!items[post.store]) {
          items[post.store] = {
            minPrice: post.price,
            maxPrice: post.price,
            minItem: post.content,
            maxItem: post.content
          };
        } else {
          if (post.price < items[post.store].minPrice) {
            items[post.store].minPrice = post.price;
            items[post.store].minItem = post.content;
          }
          if (post.price > items[post.store].maxPrice) {
            items[post.store].maxPrice = post.price;
            items[post.store].maxItem = post.content;
          }
        }
      }
    });

    // Generate radar content
    let radarHTML = '<ul>';

    for (const store in items) {
      radarHTML += `
        <li>
          <strong>${store}</strong>:
          <ul>
            <li class="cheap">أرخص: ${items[store].minItem} (${items[store].minPrice} ريال)</li>
            <li class="expensive">أغلى: ${items[store].maxItem}