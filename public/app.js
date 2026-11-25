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

  // 4. UI Rendering
  function renderPosts(posts, filter = '') {
    const postsContainer = document.getElementById('posts');
    postsContainer.innerHTML = '';

    posts
      .filter(post => !filter || post.priceTag === filter)
      .forEach(post => {
        const postElement = document.createElement('div');
        postElement.className = `post ${post.priceTag || ''}`;
        postElement.innerHTML = `
          <div class="post-header">
            <span class="author">${post.author || 'مجهول'}</span>
            <span class="timestamp">${new Date(post.timestamp).toLocaleString('ar-EG')}</span>
          </div>
          <div class="post-content">${post.content}</div>
          <div class="post-meta">
            <span class="store">🏪 ${post.store}</span>
            ${post.price ? `<span class="price">💰 ${post.price.toFixed(2)}</span>` : ''}
          </div>
        `;
        postsContainer.appendChild(postElement);
      });
  }

  // 5. Event Listeners
  document.getElementById('publishBtn').addEventListener('click', () => {
    const author = document.getElementById('author').value.trim();
    const content = document.getElementById('content').value.trim();

    if (!content) {
      showError('يرجى كتابة منشور', 'warning');
      return;
    }

    const post = {
      id: Date.now().toString(),
      author: author || 'مجهول',
      content,
      timestamp: Date.now()
    };

    const taggedPost = window.tagPost(post);
    window.postStorage.addPost(taggedPost);
    document.getElementById('content').value = '';
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPosts(window.postStorage.getAll(), btn.dataset.filter);
    });
  });

  // 6. Initialization
  window.addEventListener('DOMContentLoaded', () => {
    renderPosts(window.postStorage.getAll());
  });

  window.addEventListener('storage:update', (e) => {
    renderPosts(e.detail);
  });
})();