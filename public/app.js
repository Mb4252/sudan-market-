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
    // Initialize UI elements
    const publishBtn = document.getElementById('publishBtn');
    const contentInput = document.getElementById('content');
    const authorInput = document.getElementById('author');
    const postsContainer = document.getElementById('posts');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const compareBtn = document.getElementById('compareBtn');
    const analyticsToggle = document.getElementById('analyticsToggle');
    const analyticsPanel = document.getElementById('analyticsPanel');
    const compareOverlay = document.getElementById('compareOverlay');
    const compareContent = document.getElementById('compareContent');

    // Check if DOM elements exist
    if (!compareOverlay || !compareContent) {
      console.error('Missing DOM elements for comparison feature');
      return;
    }

    // Render posts from storage
    renderPosts();

    // Event Listeners
    publishBtn.addEventListener('click', publishPost);
    contentInput.addEventListener('input', validatePost);
    filterBtns.forEach(btn => btn.addEventListener('click', filterPosts));
    compareBtn.addEventListener('click', showComparison);
    analyticsToggle.addEventListener('click', toggleAnalytics);

    // Close overlay when clicking outside content
    compareOverlay.addEventListener('click', (e) => {
      if (e.target === compareOverlay) {
        compareOverlay.classList.add('hidden');
      }
    });

    // Close button in overlay
    const closeBtn = compareContent.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        compareOverlay.classList.add('hidden');
      });
    }

    // Listen for storage updates
    window.addEventListener('storage:update', () => renderPosts());
  });

  // 5. Post Publishing
  function publishPost() {
    const content = document.getElementById('content').value.trim();
    const author = document.getElementById('author').value.trim() || 'مجهول';

    if (!content) {
      showError('المنشور فارغ!', 'validation');
      return;
    }

    const post = {
      id: Date.now().toString(),
      content,
      author,
      timestamp: Date.now(),
      price: null,
      store: 'غير محدد',
      priceTag: 'normal'
    };

    // Tag the post with price and store info
    const taggedPost = window.tagPost(post);

    // Save to local storage
    window.postStorage.addPost(taggedPost);

    // Clear input fields
    document.getElementById('content').value = '';
    document.getElementById('author').value = '';

    // Show success message
    showSuccess('تم نشر المنشور بنجاح!');
  }

  // 6. Post Validation
  function validatePost() {
    const content = document.getElementById('content').value.trim();
    const publishBtn = document.getElementById('publishBtn');

    publishBtn.disabled = !content;
  }

  // 7. Post Rendering
  function renderPosts(filter = '') {
    const posts = window.postStorage.getAll();
    const postsContainer = document.getElementById('posts');

    if (!postsContainer) return;

    postsContainer.innerHTML = '';

    if (posts.length === 0) {
      postsContainer.innerHTML = '<p>لا توجد منشورات بعد.</p>';
      return;
    }

    const filteredPosts = filter ? posts.filter(p => p.priceTag === filter) : posts;

    if (filteredPosts.length === 0) {
      postsContainer.innerHTML = '<p>لا توجد منشورات مطابقة للفلتر.</p>';
      return;
    }

    filteredPosts.forEach(post => {
      const postElement = document.createElement('div');
      postElement.className = `post ${post.priceTag}`;

      postElement.innerHTML = `
        <div class="post-header">
          <span class="post-author">${escapeHtml(post.author)}</span>
          <span class="post-time">${formatTime(post.timestamp)}</span>
        </div>
        <div class="post-content">${escapeHtml(post.content)}</div>
        <div class="post-meta">
          <span class="post-store">${escapeHtml(post.store)}</span>
          ${post.price !== null ? `<span class="post-price">${post.price} ريال</span>` : ''}
        </div>
      `;

      postsContainer.appendChild(postElement);
    });
  }