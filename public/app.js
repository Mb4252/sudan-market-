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
    const contentInput = document.getElementById('content');
    const publishBtn = document.getElementById('publishBtn');
    const postsContainer = document.getElementById('posts');
    const statusElement = document.getElementById('status');
    const syncBadge = document.getElementById('syncBadge');
    const compareOverlay = document.getElementById('compareOverlay');
    const compareContent = document.getElementById('compareContent');
    const closeCompareBtn = document.getElementById('closeCompare');
    const compareBtn = document.getElementById('compareBtn');
    const analyticsToggle = document.getElementById('analyticsToggle');
    const analyticsPanel = document.getElementById('analyticsPanel');

    // Initialize UI
    renderPosts(window.postStorage.getAll());
    updateUIStatus('جاهز', true);

    // Event Listeners
    publishBtn.addEventListener('click', handlePublish);
    compareBtn.addEventListener('click', showCompareOverlay);
    closeCompareBtn.addEventListener('click', hideCompareOverlay);
    analyticsToggle.addEventListener('click', toggleAnalyticsPanel);

    // Custom Events
    window.addEventListener('storage:update', (e) => {
      renderPosts(e.detail);
      updatePriceRadar(e.detail);
    });

    // Functions
    function handlePublish() {
      const content = contentInput.value.trim();
      if (!content) return;

      const post = {
        id: Date.now().toString(),
        content,
        timestamp: Date.now(),
        author: document.getElementById('author').value.trim() || 'مجهول'
      };

      const taggedPost = window.tagPost(post);
      window.postStorage.addPost(taggedPost);
      contentInput.value = '';
    }

    function renderPosts(posts) {
      postsContainer.innerHTML = posts.length ? posts.map(p => {
        const priceTag = p.priceTag ? `<span class="price-tag ${p.priceTag}">${p.priceTag === 'cheap' ? 'رخيص' : p.priceTag === 'expensive' ? 'غالي' : 'عادي'}</span>` : '';
        return `<div class="post">
          <p>${p.content}</p>
          <div class="post-meta">
            <span class="author">${p.author}</span>
            <span class="timestamp">${new Date(p.timestamp).toLocaleString('ar-EG')}</span>
            ${priceTag}
          </div>
        </div>`;
      }).join('') : '<p>لا توجد منشورات بعد.</p>';
    }

    function updatePriceRadar(posts) {
      const radarContent = document.getElementById('radarContent');
      const now = Date.now();
      const dayAgo = now - (24 * 60 * 60 * 1000);

      const recentPosts = posts.filter(p => p.timestamp > dayAgo && p.price !== null);

      if (recentPosts.length === 0) {
        radarContent.innerHTML = '<p>لا توجد بيانات كافية لتحليل الفرص.</p>';
        return;
      }

      const stores = {};
      recentPosts.forEach(p => {
        if (!stores[p.store]) {
          stores[p.store] = {
            prices: [],
            count: 0
          };
        }
        stores[p.store].prices.push(p.price);
        stores[p.store].count++;
      });

      const storeData = Object.entries(stores).map(([store, data]) => {
        const avgPrice = data.prices.reduce((sum, price) => sum + price, 0) / data.prices.length;
        const minPrice = Math.min(...data.prices);
        const maxPrice = Math.max(...data.prices);
        const priceRange = maxPrice - minPrice;
        const volatility = priceRange / avgPrice;

        return {
          store,
          avgPrice,
          minPrice,
          maxPrice,
          volatility,
          count: data.count
        };
      });

      storeData.sort((a, b) => a.avgPrice - b.avgPrice);

      radarContent.innerHTML = storeData.map(data => {
        const volatilityClass = data.volatility > 0.3 ? 'high' : data.volatility > 0.1 ? 'medium' : 'low';
        return `<div class="store-radar">
          <h4>${data.store}</h4>
          <p>متوسط السعر: ${data.avgPrice.toFixed(2)} ريال</p>
          <p>أرخص: ${data.minPrice.toFixed(2)} ريال | أغلى: ${data.maxPrice.toFixed(2)} ريال</p>
          <p>تذبذب السعر: <span class="volatility ${volatilityClass}