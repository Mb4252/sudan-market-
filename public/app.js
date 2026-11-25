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
        post.priceTag = 'new';
      }
    }

    return post;
  };

  // 4. UI Rendering Engine
  function renderPosts(posts, filter = '') {
    const postsContainer = document.getElementById('posts');
    postsContainer.innerHTML = '';

    posts
      .filter(post => filter === '' || post.priceTag === filter)
      .forEach(post => {
        const postElement = document.createElement('div');
        postElement.className = `post ${post.priceTag || ''}`;
        postElement.innerHTML = `
          <div class="post-header">
            <span class="author">${post.author || 'مجهول'}</span>
            <span class="timestamp">${new Date(post.timestamp).toLocaleString('ar-EG')}</span>
          </div>
          <div class="post-content">${post.content}</div>
          <div class="post-footer">
            <span class="store">🏪 ${post.store}</span>
            ${post.price ? `<span class="price">💰 ${post.price} ريال</span>` : ''}
          </div>
        `;
        postsContainer.appendChild(postElement);
      });
  }

  // 5. Event Handlers
  document.getElementById('publishBtn').addEventListener('click', () => {
    const author = document.getElementById('author').value.trim();
    const content = document.getElementById('content').value.trim();

    if (!content) {
      showError('المنشور فارغ!', 'warning');
      return;
    }

    const post = {
      id: Date.now().toString(),
      author: author || 'مجهول',
      content: content,
      timestamp: Date.now()
    };

    const taggedPost = window.tagPost(post);
    window.postStorage.addPost(taggedPost);
    document.getElementById('content').value = '';
  });

  // 6. Initialization
  document.addEventListener('DOMContentLoaded', () => {
    const posts = window.postStorage.getAll();
    renderPosts(posts);

    // Set up filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderPosts(window.postStorage.getAll(), btn.dataset.filter);
      });
    });

    // Set up compare button
    document.getElementById('compareBtn').addEventListener('click', () => {
      const overlay = document.getElementById('compareOverlay');
      const content = document.getElementById('compareContent');
      overlay.style.display = 'block';

      // Simple comparison logic
      const posts = window.postStorage.getAll();
      const grouped = posts.reduce((acc, post) => {
        if (!post.price || !post.store) return acc;
        if (!acc[post.store]) acc[post.store] = [];
        acc[post.store].push(post);
        return acc;
      }, {});

      let comparisonHTML = '<h3>مقارنة الأسعار</h3>';
      for (const [store, storePosts] of Object.entries(grouped)) {
        const minPrice = Math.min(...storePosts.map(p => p.price));
        const maxPrice = Math.max(...storePosts.map(p => p.price));
        comparisonHTML += `
          <div class="comparison-item">
            <h4>${store}</h4>
            <p>أرخص: ${minPrice} ريال</p>
            <p>أغلى: ${maxPrice} ريال</p>
          </div>
        `;
      }

      content.innerHTML = comparisonHTML;
    });

    // Close compare overlay
    document.querySelector('.close').addEventListener('click', () => {
      document.getElementById('compareOverlay').style.display = 'none';
    });

    // Toggle analytics panel
    document.getElementById('analyticsToggle').addEventListener('click', () => {
      const panel = document.getElementById('analyticsPanel');
      panel.classList.toggle('hidden');
    });
  });

  // 7. UI Status Updates
  window.updateUIStatus = (status, isOnline) => {
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
      syncBadge.title = 'وضع محلي سرّي';
      document.getElementById('publishBtn').disabled = false;
      document.getElementById('compareBtn').disabled = false;
      document.getElementById('analyticsToggle').disabled = false;
    }
  };

  // 8. Storage Update Listener
  window.addEventListener('storage:update', (e) => {
    renderPosts(e.detail);
  });
}