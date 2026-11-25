(function(){
  'use strict';

  // 1. Config & State
  window.APP_CONFIG = {
    wsUrl: 'wss://browser-relay-server.onrender.com',
    storageKey: 'smart_posts_v1',
    maxPosts: 500
  };

  // 2. Storage Manager (Source of Truth)
  window.postStorage = {
    getAll: () => {
      try {
        const raw = localStorage.getItem(window.APP_CONFIG.storageKey);
        return JSON.parse(raw || '[]');
      } catch (e) { return []; }
    },
    addPost: (post) => {
      const posts = window.postStorage.getAll();
      posts.unshift(post);
      if (posts.length > window.APP_CONFIG.maxPosts) posts.pop();
      localStorage.setItem(window.APP_CONFIG.storageKey, JSON.stringify(posts));
      window.dispatchEvent(new CustomEvent('storage:update', { detail: posts }));
    },
    clear: () => localStorage.removeItem(window.APP_CONFIG.storageKey)
  };

  // 3. Price Extraction & Smart Tagging Engine (Time-Based Clustering)
  window.tagPost = (post) => {
    const text = post.content || '';
    const priceMatch = text.match(/(\\d+(?:\\.\\d+)?)/);
    post.price = priceMatch ? parseFloat(priceMatch[1]) : null;
    
    // Extract Store Name
    const storeMatch = text.match(/(?:في|من|عند)\\s+([\\u0600-\\u06FF\\s]+)/);
    post.store = storeMatch ? storeMatch[1].trim().substring(0, 20) : 'غير محدد';
    
    // Smart Dynamic Tagging: Compare with 24h average for same store/item
    if (post.price !== null) {
      const posts = window.postStorage.getAll();
      const now = Date.now();
      const dayAgo = now - (24 * 60 * 60 * 1000);
      
      // Filter posts from last 24 hours, same store, and has price
      const relevantPosts = posts.filter(p =>
        p.timestamp > dayAgo &&
        p.store === post.store &&
        p.price !== null
      );
      
      if (relevantPosts.length > 0) {
        const avgPrice = relevantPosts.reduce((sum, p) => sum + p.price, 0) / relevantPosts.length;
        // If current price is 10% lower than average, it's cheap; 10% higher, it's expensive
        post.priceTag = post.price < avgPrice * 0.9 ? 'cheap' : (post.price > avgPrice * 1.1 ? 'expensive' : 'normal');
      } else {
        // Fallback if no history: use absolute threshold
        post.priceTag = post.price < 50 ? 'cheap' : 'expensive';
      }
    }
    
    return post;
  };

  // 4. UI Rendering & Analytics
  const renderPosts = (filter = '') => {
    const posts = window.postStorage.getAll();
    const container = document.getElementById('posts');
    if (!container) return;

    container.innerHTML = posts.length === 0 ? '<p>لا توجد منشورات بعد. كن أول من ينشر!</p>' : '';

    posts.forEach(post => {
      if (filter && post.priceTag !== filter) return;

      const postElement = document.createElement('div');
      postElement.className = `post ${post.priceTag || ''}`;
      postElement.innerHTML = `
        <div class="post-header">
          <span class="author">${esc(post.author || 'مجهول')}</span>
          <span class="time">${new Date(post.timestamp).toLocaleTimeString('ar-EG')}</span>
        </div>
        <div class="post-content">${esc(post.content)}</div>
        <div class="post-meta">
          <span class="store">🏪 ${esc(post.store)}</span>
          ${post.price !== null ? `<span class="price">💰 ${post.price} ريال</span>` : ''}
        </div>
      `;
      container.appendChild(postElement);
    });
  };

  // 5. Event Listeners
  document.addEventListener('DOMContentLoaded', () => {
    // Initial render
    renderPosts();

    // Publish button
    document.getElementById('publishBtn')?.addEventListener('click', () => {
      const content = document.getElementById('content')?.value.trim();
      if (!content) return;

      const post = {
        author: document.getElementById('author')?.value.trim() || 'مجهول',
        content,
        timestamp: Date.now()
      };

      window.tagPost(post);
      window.postStorage.addPost(post);
      document.getElementById('content').value = '';
      renderPosts();
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderPosts(btn.dataset.filter || '');
      });
    });

    // Analytics toggle
    document.getElementById('analyticsToggle')?.addEventListener('click', () => {
      const panel = document.getElementById('analyticsPanel');
      if (panel) panel.classList.toggle('hidden');
    });

    // Compare button
    document.getElementById('compareBtn')?.addEventListener('click', () => {
      window.openCompare();
    });
  });

  // 6. Helper Functions
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
    });
  }

  // 7. Storage Update Listener
  window.addEventListener('storage:update', () => {
    renderPosts(document.querySelector('.filter-btn.active')?.dataset.filter || '');
  });
})();