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
    const publishBtn = document.getElementById('publishBtn');
    const contentInput = document.getElementById('content');
    const authorInput = document.getElementById('author');
    const postsContainer = document.getElementById('posts');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const compareBtn = document.getElementById('compareBtn');
    const analyticsToggle = document.getElementById('analyticsToggle');
    const analyticsPanel = document.getElementById('analyticsPanel');

    // Load posts from storage
    renderPosts(window.postStorage.getAll());

    // Event Listeners
    publishBtn.addEventListener('click', handlePublish);
    contentInput.addEventListener('input', updateRadar);
    filterButtons.forEach(btn => btn.addEventListener('click', handleFilter));
    compareBtn.addEventListener('click', showComparison);
    analyticsToggle.addEventListener('click', toggleAnalytics);

    // Storage Update Listener
    window.addEventListener('storage:update', (e) => {
      renderPosts(e.detail);
      updateRadar();
    });

    // Initial UI State
    updateUIStatus('جاري الاتصال...', false);
    updateRadar();
  });

  // 5. Core Functions
  function handlePublish() {
    const content = document.getElementById('content').value.trim();
    const author = document.getElementById('author').value.trim();

    if (!content) return;

    const post = {
      id: Date.now().toString(),
      content,
      author: author || 'مجهول',
      timestamp: Date.now()
    };

    window.tagPost(post);
    window.postStorage.addPost(post);

    // Clear inputs
    document.getElementById('content').value = '';
    document.getElementById('author').value = '';
  }

  function renderPosts(posts, filter = '') {
    const container = document.getElementById('posts');
    container.innerHTML = '';

    posts
      .filter(post => !filter || post.priceTag === filter)
      .forEach(post => {
        const postElement = document.createElement('div');
        postElement.className = `post ${post.priceTag || ''}`;
        postElement.innerHTML = `
          <div class="post-header">
            <span class="author">${post.author}</span>
            <span class="timestamp">${new Date(post.timestamp).toLocaleString('ar-EG')}</span>
          </div>
          <div class="post-content">${post.content}</div>
          ${post.price ? `<div class="post-price">السعر: ${post.price} ${post.priceTag === 'cheap' ? '🟢' : post.priceTag === 'expensive' ? '🔴' : ''}</div>` : ''}
          ${post.store ? `<div class="post-store">المحل: ${post.store}</div>` : ''}
        `;
        container.appendChild(postElement);
      });
  }

  function updateRadar() {
    const content = document.getElementById('content').value;
    const radarContent = document.getElementById('radarContent');

    if (!content) {
      radarContent.innerHTML = 'اكتب منشوراً لبدء التحليل...';
      return;
    }

    // Extract potential price
    const priceMatch = content.match(window.APP_CONFIG.priceRegex);
    const price = priceMatch ? parseFloat(priceMatch[0].replace(/[^\d.]/g, '')) : null;

    // Extract potential store
    const storeMatch = content.match(window.APP_CONFIG.storeRegex);
    const store = storeMatch ? storeMatch[2].trim() : null;

    // Generate radar content
    let html = '';

    if (price) {
      html += `<div>السعر: <strong>${price}</strong></div>`;
    }

    if (store) {
      html += `<div>المحل: <strong>${store}</strong></div>`;
    }