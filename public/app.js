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
    const priceMatch = text.match(/(\d+(?:\.\d+)?)/);
    post.price = priceMatch ? parseFloat(priceMatch[1]) : null;
    
    // Extract Store Name
    const storeMatch = text.match(/(?:في|من|عند)\s+([\u0600-\u06FF\s]+)/);
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
    
    const filtered = filter ? posts.filter(p => p.priceTag === filter) : posts;
    
    if (filtered.length === 0) {
      container.innerHTML = '<p>لا توجد منشورات.</p>';
      return;
    }

    container.innerHTML = filtered.map(p => `
      <div class="post-item">
        <strong>${p.author || 'مجهول'}</strong> - ${p.content}
        <span class="tag ${p.priceTag}">${p.priceTag === 'cheap' ? 'رخيص 🟢' : p.priceTag === 'expensive' ? 'غالي 🔴' : 'عادي'}</span>
      </div>
    `).join('');
  };

  const renderRadar = () => {
    const posts = window.postStorage.getAll();
    const radarContent = document.getElementById('radarContent');
    if (!radarContent) return;
    
    // Group by store and find cheapest/most expensive
    const storeStats = {};
    posts.forEach(p => {
      if (!p.price) return;
      if (!storeStats[p.store]) storeStats[p.store] = { prices: [], cheap: 0, expensive: 0 };
      storeStats[p.store].prices.push(p.price);
      if (p.priceTag === 'cheap') storeStats[p.store].cheap++;
      if (p.priceTag === 'expensive') storeStats[p.store].expensive++;
    });

    const sortedStores = Object.entries(storeStats).sort((a, b) => {
      const avgA = a[1].prices.reduce((s, p) => s + p, 0) / a[1].prices.length;
      const avgB = b[1].prices.reduce((s, p) => s + p, 0) / b[1].prices.length;
      return avgA - avgB;
    });

    if (sortedStores.length === 0) {
      radarContent.innerHTML = '<p>لا توجد بيانات كافية للتحليل.</p>';
      return;
    }

    radarContent.innerHTML = sortedStores.map(([store, stats]) => {
      const avg = stats.prices.reduce((s, p) => s + p, 0) / stats.prices.length;
      return `<div class="radar-item"><strong>${store}</strong> - متوسط: ${avg.toFixed(1)} ريال (رخيص: ${stats.cheap}, غالي: ${stats.expensive})</div>`;
    }).join('');
  };

  const renderAnalytics = () => {
    const posts = window.postStorage.getAll();
    if (posts.length === 0) return;

    // Volume Chart (Posts per day)
    const volumeData = {};
    posts.forEach(p => {
      const date = new Date(p.timestamp).toISOString().split('T')[0];
      volumeData[date] = (volumeData[date] || 0) + 1;
    });
    const volumeLabels = Object.keys(volumeData).sort();
    const volumeValues = volumeLabels.map(l => volumeData[l]);

    // Price Chart (Average price per day)
    const priceData = {};
    posts.forEach(p => {
      if (!p.price) return;
      const date = new Date(p.timestamp).toISOString().split('T')[0];
      if (!priceData[date]) priceData[date] = [];
      priceData[date].push(p.price);
    });
    const priceLabels = Object.keys(priceData).sort();
    const priceValues = priceLabels.map(l => priceData[l].reduce((s, p) => s + p, 0) / priceData[l].length);

    // Stores Chart (Post count per store)
    const storeData = {};
    posts.forEach(p => {
      storeData[p.store] = (storeData[p.store] || 0) + 1;
    });
    const storeLabels = Object.keys(storeData);
    const storeValues = storeLabels.map(l => storeData[l]);

    // Update Charts
    const charts = {};
    const createChart = (ctxId, type, labels, data, label) => {
      const ctx = document.getElementById(ctxId);
      if (!ctx) return;
      if (charts[ctxId]) charts[ctxId].destroy();
      charts[ctxId] = new Chart(ctx, {
        type: type,
        data: { labels: labels, datasets: [{ label: label, data: data }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    };

    createChart('chartVolume', 'bar', volumeLabels, volumeValues, 'عدد المنشورات');
    createChart('chartPrice', 'line', priceLabels, priceValues, 'متوسط السعر');
    createChart('chartStores', 'pie', storeLabels, storeValues, 'المتاجر');
  }