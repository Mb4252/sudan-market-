(function() {
  'use strict';

  // 1. Config & State
  window.APP_CONFIG = {
    wsUrl: 'wss://browser-relay-server.onrender.com',
    storageKey: 'smart_posts_v1',
    maxPosts: 500,
    priceRegex: /(\\d+(\\.\\d{1,2})?)\s*(ريال|جنية|دولار|ليرة|دينار|قيراط|مليون|مليار|مليون ريال|مليون جنيه)/i,
    storeRegex: /(في|من|عند)\s+([\\u0600-\\u06FF\\s]+)/i,
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
    post.price = priceMatch ? parseFloat(priceMatch[0].replace(/[^\\d.]/g, '')) : null;

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
        post.priceTag = 'neutral';
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
      document.getElementById('publishBtn').disabled = true;
      document.getElementById('compareBtn').disabled = true;
      document.getElementById('analyticsToggle').disabled = true;
    }
  }

  // 5. Event Listeners
  document.addEventListener('DOMContentLoaded', () => {
    // Hide initial status message
    document.getElementById('status').style.display = 'none';

    // Publish Button
    document.getElementById('publishBtn').addEventListener('click', () => {
      const content = document.getElementById('content').value.trim();
      const author = document.getElementById('author').value.trim();

      if (!content) {
        showError('الرجاء كتابة منشور', 'error');
        return;
      }

      const post = {
        id: Date.now().toString(),
        content,
        author: author || 'مجهول',
        timestamp: Date.now()
      };

      // Tag post and save locally
      const taggedPost = window.tagPost(post);
      window.postStorage.addPost(taggedPost);

      // Clear input
      document.getElementById('content').value = '';
      document.getElementById('author').value = '';

      // Show success message
      showError('تم النشر بنجاح!', 'success');
    });

    // Filter Buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Analytics Toggle
    document.getElementById('analyticsToggle').addEventListener('click', () => {
      document.getElementById('analyticsPanel').classList.toggle('hidden');
    });
  });

  // 6. Initial UI Setup
  updateUIStatus('جارٍ الاتصال...', false);

  // 7. Storage Update Listener
  window.addEventListener('storage:update', (e) => {
    // Update UI with new posts
  });

  // 8. Error Handling
  window.onerror = (msg, url, line, col, error) => {
    console.error(msg, url, line, col, error);
    showError(`خطأ: ${msg}`, 'error');
  };

  window.addEventListener('unhandledrejection', e => {
    console.error(e.reason);
    showError(`الرفض غير معالج: ${e.reason}`, 'error');
  });

  // 9. Local-First Implementation
  function savePostLocally(post) {
    const posts = JSON.parse(localStorage.getItem('localPosts') || '[]');
    posts.unshift(post);
    localStorage.setItem('localPosts', JSON.stringify(posts));
  }

  function syncPostsWithServer() {
    // Implementation for syncing with server
  }