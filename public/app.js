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
      syncBadge.title = 'وضع محلي';
      document.getElementById('publishBtn').disabled = false;
      document.getElementById('compareBtn').disabled = false;
      document.getElementById('analyticsToggle').disabled = false;
    }
  }

  // 5. Smart Opportunities Radar
  function updateRadar() {
    const posts = window.postStorage.getAll();
    const radarContent = document.getElementById('radarContent');

    if (posts.length === 0) {
      radarContent.innerHTML = '<p>لا توجد منشورات بعد</p>';
      return;
    }

    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const relevantPosts = posts.filter(p => p.timestamp > dayAgo && p.price !== null);

    if (relevantPosts.length === 0) {
      radarContent.innerHTML = '<p>لا توجد منشورات ذات أسعار في اليوم الأخير</p>';
      return;
    }

    // Group by store and item
    const grouped = {};
    relevantPosts.forEach(post => {
      const key = `${post.store}|${post.content.split(' ')[0]}`;
      if (!grouped[key]) {
        grouped[key] = {
          store: post.store,
          item: post.content.split(' ')[0],
          prices: []
        };
      }
      grouped[key].prices.push(post.price);
    });

    // Calculate opportunities
    const opportunities = Object.values(grouped)
      .map(group => {
        const minPrice = Math.min(...group.prices);
        const maxPrice = Math.max(...group.prices);
        const avgPrice = group.prices.reduce((sum, price) => sum + price, 0) / group.prices.length;
        const savings = ((maxPrice - minPrice) / maxPrice) * 100;

        return {
          store: group.store,
          item: group.item,
          minPrice,
          maxPrice,
          avgPrice,
          savings: savings.toFixed(1)
        };
      })
      .filter(op => op.savings > 5)
      .sort((a, b) => b.savings - a.savings);

    // Render opportunities
    if (opportunities.length > 0) {
      radarContent.innerHTML = opportunities.map(op => {
        return `
          <div class="opportunity">
            <h4>${op.item} في ${op.store}</h4>
            <p>أرخص: ${op.minPrice} ريال</p>
            <p>أغلى: ${op.maxPrice} ريال</p>
            <p>توفير: ${op.savings}%</p>
          </div>
        `;
      }).join('');
    } else {
      radarContent.innerHTML = '<p>لا توجد فرص توفير اليوم</p>';
    }
  }

  // 6. Event Listeners
  document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI
    updateUIStatus('جاري الاتصال...', false);
    updateRadar();

    // Publish Button
    document.getElementById('publishBtn').addEventListener('click', () => {
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
        timestamp: Date.now(),
        price: null,
        store: 'غير محدد',
        priceTag: 'neutral'
      }